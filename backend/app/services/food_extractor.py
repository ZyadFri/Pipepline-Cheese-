"""
food_extractor.py — LLM extraction from Docling evidence packages.

Replaces the old full-document text approach with a targeted pipeline:
  1. Receives pre-built EvidencePackage objects (tables, chart CSVs, relevant text).
  2. Sends each package to settings.GROQ_FOOD_MODEL with a strict JSON prompt.
  3. Requires every returned value to cite a docling_item_ref from the known set.
  4. Validates all refs — invented refs are flagged, not silently accepted.
  5. Runs an optional Pass 2 verification for low-confidence items.

Token budget per package call (≤ 3 000 tokens content):
  system prompt    ≈  800 tokens
  package content  ≤ 3 000 tokens  (pre-controlled by evidence_package.py)
  output           ≤ 4 096 tokens
  total            ≤ 7 896 tokens  — model/provider is configured via settings,
  not hardcoded; verify actual TPM limits against whatever model is active.

API credentials never leave the server.
"""
import json
import logging
import re
import time
from typing import Any, Optional

from app.core.config import settings
from app.services.llm_usage import (
    note_fallback, parse_openai_style_rate_limit_headers, record_usage, usage_context,
)

logger = logging.getLogger(__name__)


# ─── Prompts ──────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an expert food-science data extraction assistant.
Extract structured experimental data from the provided evidence and return ONLY valid JSON.

## Target Schema

### experiments
One row per distinct (cheese_product, treatment) combination. Do not merge
experiments that genuinely differ by cheese type, treatment, concentration,
packaging, storage temperature, application method, or control status — each
stays its own row even if several share the same paper.

### ingredients
One entry per unique ingredient name.
  ingredient_name : exact name from the paper
  functional_class: antimicrobial | antioxidant | preservative | coating_agent |
                    acidulant | texture_modifier | combined | other | unknown
  source          : biological/chemical origin (e.g. "crustacean shells", "Lactococcus lactis")
                    NOT the paper title, journal, or authors.

### experiment_ingredients
  concentration      : numeric value
  concentration_unit : exact unit as written (%, g/L, mg/kg, …)

### indicators
One entry per unique (indicator_type, indicator_unit) pair.
  indicator_type : e.g. "Total viable count", "pH", "TBARS"
  indicator_unit : e.g. "log CFU/g", "pH units", "mg MDA/kg"

### measurements
One row per (experiment, day, indicator_type, indicator_unit).
  day             : integer storage day (0 = day of treatment)
  indicator_value : numeric measurement value

## Evidence Citation Rules (CRITICAL)

For EVERY experiment, ingredient, and measurement, you MUST cite a docling_item_ref
from the list of valid refs at the top of the user message.

evidence_object:
{
  "docling_item_ref" : REQUIRED — must be one of the valid refs provided,
  "page_number"      : integer (1-indexed),
  "source_type"      : "text" | "table" | "chart_csv" | "figure" | "caption",
  "source_label"     : "Table 2" | "Figure 3" | null,
  "exact_text"       : exact quoted sentence or cell value (null for chart readings),
  "confidence"       : 0.0–1.0 (1.0=exact stated value; 0.7=inferred; 0.4=chart estimate),
  "value_is_approximate": true if read from a chart CSV (chart_csv source_type)
}

## Scientific Integrity Rules

1. NEVER invent a value.  Missing value → return null and confidence 0.
2. NEVER fabricate a docling_item_ref.  Only use refs from the provided list.
3. Distinguish stated values (confidence ≥ 0.9) from chart estimates (confidence ≤ 0.6).
4. Preserve original units.
5. Include ALL treatment groups including controls.
6. Include ALL time points.

## Output Format

Return ONLY valid JSON — no markdown fences, no prose before or after.

{
  "reasoning_summary": "brief description of what you found",
  "experiments": [
    {
      "cheese_product": "string",
      "treatment": "string",
      "experiment_evidence": [evidence_object],
      "ingredients": [
        {
          "ingredient_name": "string",
          "functional_class": "string",
          "source": "string",
          "concentration": number,
          "concentration_unit": "string",
          "evidence": [evidence_object]
        }
      ],
      "measurements": [
        {
          "day": integer,
          "indicator_type": "string",
          "indicator_unit": "string",
          "indicator_threshold": number_or_null,
          "indicator_value": number,
          "value_is_approximate": boolean,
          "evidence": [evidence_object]
        }
      ]
    }
  ]
}
"""

VERIFY_SYSTEM_PROMPT = """\
You are a scientific data verification assistant.
Review low-confidence measurements and confirm, correct, or mark each as unverifiable.
Only use docling_item_ref values from the list provided in the user message.

Return ONLY valid JSON:
{
  "verified": [
    {
      "original_index": integer,
      "status": "confirmed" | "corrected" | "unverifiable",
      "corrected_value": number_or_null,
      "evidence": [evidence_object]
    }
  ]
}
"""


# ─── JSON helpers ─────────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict:
    raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        result = json.loads(m.group()) if m else {}
    return result if isinstance(result, dict) else {}


def _recover_experiments(raw: str) -> list:
    """
    Salvage complete experiment objects from a truncated JSON response.

    Scans for every balanced {…} at any nesting depth and tries to parse it.
    This handles the common finish_reason=length truncation where the outer
    wrapper is incomplete but individual experiment objects are well-formed.
    """
    objects: list = []
    depth: int = 0
    in_str: bool = False
    open_stack: list = []   # stack of open-brace positions
    i: int = 0
    while i < len(raw):
        ch = raw[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                open_stack.append(i)
                depth += 1
            elif ch == "}" and open_stack:
                start = open_stack.pop()
                depth -= 1
                try:
                    obj = json.loads(raw[start: i + 1])
                    if isinstance(obj, dict) and (
                        "cheese_product" in obj or "measurements" in obj
                    ):
                        objects.append(obj)
                except json.JSONDecodeError:
                    pass
        i += 1
    return objects


# ─── LLM clients (OpenAI primary, Groq fallback, Gemini last resort) ───────────

def _openai_client():
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package required — pip install openai")
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set in backend/.env")
    return OpenAI(api_key=settings.OPENAI_API_KEY, max_retries=0)


def _groq_client():
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package required — pip install openai")
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set in backend/.env")
    # max_retries=0: the SDK's own default retry-with-backoff on 5xx can silently
    # burn minutes per call. _provider_call() below does its own bounded retry instead.
    return OpenAI(
        api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1",
        max_retries=0,
    )


def _gemini_client():
    """
    Fallback provider for when Groq's free-tier quota is exhausted. Gemini's
    OpenAI-compatible endpoint accepts the exact same chat.completions request
    shape (including the vision content-parts format chart_converter.py uses),
    so this is a drop-in second provider — no prompt or parsing changes needed
    on either side, just a different client + model.
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package required — pip install openai")
    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not set in backend/.env")
    return OpenAI(
        api_key=settings.GOOGLE_API_KEY,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        max_retries=0,
    )


def _provider_call(
    client,
    model: str,
    system: Optional[str],
    user_content,                      # str, for text; list[dict], for vision content parts
    max_tokens: int,
    json_mode: bool,
    provider_label: str,
) -> str:
    """
    Single provider API call with adaptive retry:
      • 413 (request too large) → halve text and retry (text content only —
        vision content parts are a fixed image + short prompt, nothing to shrink)
      • 429 (rate limit)        → sleep as requested, then retry
      • 503 (model overloaded)  → 2 short retries (a few seconds apart), then give up —
        a transient shared-model capacity issue, not something worth burning minutes on
    Returns the raw response content string.
    """
    is_text = isinstance(user_content, str)
    max_chars = len(user_content) if is_text else None
    content = user_content
    retries_503 = 0
    provider_key = provider_label.lower()

    for _attempt in range(8):
        messages = [{"role": "user", "content": content}]
        if system:
            messages.insert(0, {"role": "system", "content": system})
        kwargs = dict(model=model, messages=messages, max_tokens=max_tokens, temperature=0.05)
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        call_start = time.monotonic()
        try:
            # with_raw_response gives access to the provider's rate-limit
            # headers alongside the normal parsed body — the only real
            # "how much is left" signal any of these APIs expose.
            raw_response = client.chat.completions.with_raw_response.create(**kwargs)
        except Exception as exc:
            latency_ms = int((time.monotonic() - call_start) * 1000)
            err = str(exc)
            is_413 = "413" in err or "request_too_large" in err or "Request Entity Too Large" in err
            is_quota_exhausted = "insufficient_quota" in err or "exceeded your current quota" in err.lower()
            is_429 = ("429" in err or "rate_limit_exceeded" in err or "RESOURCE_EXHAUSTED" in err) and not is_quota_exhausted
            if is_quota_exhausted:
                # A hard billing/quota exhaustion, not a transient per-minute
                # rate limit — retrying the same key won't help, so raise
                # immediately instead of burning up to 8 retries waiting on
                # an account that's simply out of credit. The caller's
                # provider-fallback chain (see _call_with_fallback) is what
                # actually recovers from this.
                record_usage(provider=provider_key, model=model, latency_ms=latency_ms,
                              success=False, error_message=err)
                raise
            if is_413 and is_text and max_chars > 1000:
                max_chars //= 2
                content = user_content[:max_chars] + "\n\n[Content truncated]"
                logger.warning("%s 413 — retrying with %d chars", provider_label, max_chars)
                continue
            elif is_429:
                m = re.search(r"try again in ([\d.]+)s", err)
                wait = min(float(m.group(1)) + 2.0, 30.0) if m else 10.0
                logger.warning("%s 429 — waiting %.1fs", provider_label, wait)
                time.sleep(wait)
                continue
            elif "503" in err and retries_503 < 2:
                retries_503 += 1
                logger.warning("%s 503 (model overloaded) — retry %d/2 in 4s", provider_label, retries_503)
                time.sleep(4.0)
                continue
            else:
                record_usage(provider=provider_key, model=model, latency_ms=latency_ms,
                              success=False, error_message=err)
                raise

        resp = raw_response.parse()
        latency_ms = int((time.monotonic() - call_start) * 1000)
        raw = resp.choices[0].message.content or "{}"
        if resp.choices[0].finish_reason == "length":
            logger.warning("Response truncated (finish_reason=length)")
        usage = resp.usage
        record_usage(
            provider=provider_key, model=model,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
            total_tokens=getattr(usage, "total_tokens", 0) if usage else 0,
            latency_ms=latency_ms, success=True,
            rate_limit=parse_openai_style_rate_limit_headers(raw_response.headers),
        )
        return raw

    record_usage(provider=provider_key, model=model, success=False,
                  error_message="call failed after maximum retries")
    raise RuntimeError(f"{provider_label} call failed after maximum retries")


def _call_with_fallback(
    system: Optional[str],
    user_content,                      # str, for text; list[dict], for vision content parts
    max_tokens: int = 4096,
    json_mode: bool = True,
    *,
    openai_model: Optional[str] = None,
    groq_model: Optional[str] = None,
    gemini_model: Optional[str] = None,
) -> str:
    """
    Three-tier provider chain: OpenAI (primary) → Groq (fallback) → Gemini
    (last resort). Each tier only runs if its own API key is configured, and
    a tier is skipped straight to the next on ANY failure from that
    provider (_provider_call already exhausts that provider's own retries
    first) — most commonly a quota/billing exhaustion. Every time a fallback
    actually happens, note_fallback() records it against the ambient
    usage_context() so callers can tell the user "the primary provider is
    exhausted, this ran on the backup instead" instead of that only being
    visible in a log.

    openai_model/groq_model/gemini_model let a caller (e.g. chart_converter's
    vision reads) use a different model per tier than plain text extraction —
    defaults are the text-extraction models.
    """
    tiers = [
        ("openai", settings.OPENAI_API_KEY, _openai_client, openai_model or settings.OPENAI_MODEL, "OpenAI"),
        ("groq", settings.GROQ_API_KEY, _groq_client, groq_model or settings.GROQ_FOOD_MODEL, "Groq"),
        ("google_ai", settings.GOOGLE_API_KEY, _gemini_client, gemini_model or settings.GOOGLE_AI_MODEL, "Gemini"),
    ]
    available = [t for t in tiers if t[1]]
    if not available:
        raise RuntimeError(
            "No LLM provider is configured — set OPENAI_API_KEY, GROQ_API_KEY, "
            "or GOOGLE_API_KEY in backend/.env"
        )

    last_error: Optional[str] = None
    for i, (provider_key, _api_key, client_factory, model, label) in enumerate(available):
        try:
            client = client_factory()
            return _provider_call(client, model, system, user_content, max_tokens, json_mode, label)
        except Exception as exc:
            last_error = str(exc)
            is_last_tier = i == len(available) - 1
            if is_last_tier:
                raise
            next_provider = available[i + 1][0]
            logger.warning("%s exhausted/failed (%s) — falling back to %s", label, last_error[:200], next_provider)
            note_fallback(from_provider=provider_key, to_provider=next_provider, reason=last_error)

    raise RuntimeError(f"All configured LLM providers failed. Last error: {last_error}")


# ─── Evidence ref validation ───────────────────────────────────────────────────

def _validate_refs(experiments: list, known_refs: set) -> list:
    """
    Validate all docling_item_ref values in the LLM response.
    Unknown refs get confidence set to 0.0 and are flagged.
    """
    for exp in experiments:
        for ev in exp.get("experiment_evidence", []):
            _check_ref(ev, known_refs)
        for ing in exp.get("ingredients", []):
            for ev in ing.get("evidence", []):
                _check_ref(ev, known_refs)
        for meas in exp.get("measurements", []):
            for ev in meas.get("evidence", []):
                _check_ref(ev, known_refs)
    return experiments


def _check_ref(ev: dict, known_refs: set) -> None:
    ref = ev.get("docling_item_ref")
    if ref and ref not in known_refs:
        logger.warning("LLM cited unknown docling_item_ref=%r — setting confidence=0", ref)
        ev["confidence"] = 0.0
        ev["_fabricated_ref"] = True


# ─── Pass 1 — extraction ──────────────────────────────────────────────────────

def _build_user_message(package_text: str, known_refs: set) -> str:
    refs_block = "\n".join(f"  - {r}" for r in sorted(known_refs))
    return (
        f"VALID docling_item_ref values (cite ONLY from this list):\n{refs_block}\n\n"
        f"{package_text}\n\n"
        "Extract all experimental data according to the schema."
    )


def _extract_package(
    package,           # EvidencePackage
    known_refs: set,
) -> dict:
    """Run Pass 1 extraction on a single evidence package."""
    user_msg = _build_user_message(package.render(), known_refs)
    raw = _call_with_fallback(SYSTEM_PROMPT, user_msg, max_tokens=4096)
    result = _parse_json(raw)
    if not isinstance(result.get("experiments"), list):
        # Try salvage
        exps = _recover_experiments(raw)
        result = {"reasoning_summary": result.get("reasoning_summary", ""), "experiments": exps}
    return result


# ─── Pass 2 — verification ────────────────────────────────────────────────────

def _verify_low_confidence(
    low_conf_items: list,
    package_text: str,
    known_refs: set,
) -> list:
    if not low_conf_items:
        return []
    items_json = json.dumps(low_conf_items, indent=2)
    user_msg = (
        f"VALID docling_item_ref values:\n"
        + "\n".join(f"  - {r}" for r in sorted(known_refs))
        + f"\n\n{package_text}\n\n"
        f"Verify these {len(low_conf_items)} low-confidence measurements:\n{items_json}"
    )
    try:
        raw = _call_with_fallback(VERIFY_SYSTEM_PROMPT, user_msg, max_tokens=2048)
        result = _parse_json(raw)
        return result.get("verified", [])
    except Exception as exc:
        logger.warning("Pass 2 verification failed (non-fatal): %s", exc)
        return []


def _apply_corrections(experiments: list, corrections: list) -> list:
    """Merge pass-2 corrections back by flat measurement index."""
    flat = []
    for ei, exp in enumerate(experiments):
        for mi, meas in enumerate(exp.get("measurements", [])):
            flat.append((ei, mi))
    for corr in corrections:
        idx = corr.get("original_index")
        if idx is None or idx >= len(flat):
            continue
        ei, mi = flat[idx]
        status = corr.get("status")
        if status == "corrected" and corr.get("corrected_value") is not None:
            experiments[ei]["measurements"][mi]["indicator_value"] = corr["corrected_value"]
            experiments[ei]["measurements"][mi]["evidence"] = corr.get("evidence", [])
            experiments[ei]["measurements"][mi]["_corrected_by_pass2"] = True
        elif status == "confirmed":
            ev = corr.get("evidence")
            if ev:
                experiments[ei]["measurements"][mi]["evidence"] = ev
        elif status == "unverifiable":
            experiments[ei]["measurements"][mi]["_unverifiable"] = True
    return experiments


# ─── Public interface ──────────────────────────────────────────────────────────

def extract_food_data(
    evidence_packages: list,
    known_item_refs: set,
    model: Optional[str] = None,
    enable_verification: bool = True,
    *,
    user_id: Optional[int] = None,
    project_id: Optional[int] = None,
    paper_id: Optional[int] = None,
) -> dict:
    """
    Extract food-safety data from evidence packages.

    Parameters
    ----------
    evidence_packages : List[EvidencePackage] — from evidence_package.build_packages()
    known_item_refs   : Set[str]              — from DoclingResult.known_item_refs
    model             : deprecated, ignored — each provider tier in the
                        OpenAI → Groq → Gemini fallback chain uses its own
                        configured model (see _call_with_fallback).
    enable_verification: run Pass 2 for low-confidence items
    user_id/project_id/paper_id: attribution for the LLM usage log (app.services.llm_usage)
                        — optional; a caller without a user in scope (e.g. the
                        compare-mode engine wrapper) can omit user_id.

    Returns
    -------
    dict with keys:
      reasoning_summary : str
      experiments       : list[dict]
      low_confidence_count : int
      provider_fallback : list[dict] — non-empty only if a configured
                          provider was exhausted/failed during this run and
                          extraction fell back to the next one; each entry is
                          {"from_provider", "to_provider", "reason"}.
    """
    if not evidence_packages:
        return {"reasoning_summary": "No relevant evidence found.", "experiments": [], "low_confidence_count": 0,
                "provider_fallback": []}

    all_experiments: list = []
    all_reasoning: list = []
    low_conf_items: list = []
    fallback_events: list = []

    # ── Pass 1: extract from each evidence package ────────────────────────────
    with usage_context(feature="llm_extraction", user_id=user_id, project_id=project_id, paper_id=paper_id) as ctx1:
        for pkg in evidence_packages:
            logger.info("Extracting from package %d/%d (~%d tokens) …",
                        pkg.index, len(evidence_packages), pkg.token_estimate)
            try:
                result = _extract_package(pkg, known_item_refs)
            except Exception as exc:
                logger.error("Package %d extraction failed: %s", pkg.index, exc)
                continue

            exps = result.get("experiments", [])
            if result.get("reasoning_summary"):
                all_reasoning.append(result["reasoning_summary"])

            # Validate docling_item_ref citations
            exps = _validate_refs(exps, known_item_refs)

            # Tag chart-derived measurements
            for exp in exps:
                for meas in exp.get("measurements", []):
                    if any(ev.get("source_type") == "chart_csv"
                           for ev in meas.get("evidence", [])):
                        meas["value_is_approximate"] = True

            all_experiments.extend(exps)
    fallback_events.extend(ctx1.fallback_events)

    # ── Collect low-confidence items for Pass 2 ───────────────────────────────
    if enable_verification:
        idx = 0
        for exp in all_experiments:
            for meas in exp.get("measurements", []):
                ev_list = meas.get("evidence", [])
                min_conf = min((e.get("confidence", 1.0) for e in ev_list), default=1.0)
                # 0.6, not the prior 0.75: the prompt's own exemplars are 1.0/0.7/0.4
                # for exact/inferred/chart-estimate, so 0.75 was routing "inferred"
                # values into Pass-2 verification unconditionally — only true chart
                # estimates and below should need a second pass.
                if min_conf < 0.6:
                    low_conf_items.append({
                        "original_index": idx,
                        "experiment_treatment": exp.get("treatment"),
                        "day": meas.get("day"),
                        "indicator_type": meas.get("indicator_type"),
                        "indicator_value": meas.get("indicator_value"),
                        "original_evidence": ev_list,
                    })
                idx += 1

    # ── Pass 2: verify low-confidence items ───────────────────────────────────
    if enable_verification and low_conf_items and evidence_packages:
        logger.info("Pass 2: verifying %d low-confidence measurements", len(low_conf_items))
        # Use the combined content of all packages as context
        combined_text = "\n\n".join(pkg.render() for pkg in evidence_packages)
        with usage_context(feature="llm_verification", user_id=user_id, project_id=project_id, paper_id=paper_id) as ctx2:
            corrections = _verify_low_confidence(
                low_conf_items, combined_text[:8000], known_item_refs
            )
        fallback_events.extend(ctx2.fallback_events)
        all_experiments = _apply_corrections(all_experiments, corrections)

    return {
        "reasoning_summary": " | ".join(all_reasoning) if all_reasoning else "",
        "experiments": all_experiments,
        "low_confidence_count": len(low_conf_items),
        "provider_fallback": fallback_events,
    }
