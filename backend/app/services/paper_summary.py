"""
LLM-backed paper summary card: objective, product, treatments, variables,
main findings — shown right after a paper is extracted, before the user
opens any structured data. Cached on Paper.summary_json (generated once per
paper; `regenerate=True` forces a refresh). Experiment/observation counts are
NEVER cached with the rest — they're cheap canonical-DB aggregates and must
stay live even when the free-text summary is served from cache.
"""
import json
import logging
import re
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import Experiment, Observation, Paper, Study, TreatmentArm
from app.services.llm_qa import ask_llm
from app.services.llm_usage import usage_context
from app.services.paper_context import gather_paper_text_spans

logger = logging.getLogger(__name__)

_MAX_CONTEXT_CHARS = 6000

_SYSTEM_PROMPT = (
    "You are a food science research assistant. Summarize ONE scientific paper "
    "about food preservation/shelf-life using ONLY the text excerpts given below. "
    "Never invent facts not present in the excerpts — if something isn't stated, "
    "use \"Not stated in the extracted text.\" for that field. "
    "Return ONLY a JSON object with exactly these keys: "
    '"objective" (string, 1-2 sentences), "product" (string, the food/product studied), '
    '"treatments" (array of short strings — treatments/interventions tested), '
    '"variables" (array of short strings — measured variables/indicators), '
    '"main_findings" (array of 2-4 short strings — the key results). '
    "No markdown fences, no prose outside the JSON object."
)


def _build_context(paper_id: int, db: Session) -> str:
    spans = gather_paper_text_spans(paper_id, db)
    # Longer spans first — full paragraphs carry more summary value than
    # short captions/fragments, and the char budget is tight for a
    # free-tier model.
    spans.sort(key=lambda s: len(s["text"]), reverse=True)
    parts: list[str] = []
    total = 0
    for s in spans:
        if total >= _MAX_CONTEXT_CHARS:
            break
        chunk = s["text"][: _MAX_CONTEXT_CHARS - total]
        parts.append(chunk)
        total += len(chunk)
    return "\n\n".join(parts)


def _structured_counts(paper_id: int, project_id: int, db: Session) -> dict:
    studies = db.query(Study).filter(Study.project_id == project_id, Study.paper_id == paper_id).all()
    study_ids = [s.id for s in studies]
    experiments = db.query(Experiment).filter(Experiment.study_id.in_(study_ids)).all() if study_ids else []
    exp_ids = [e.id for e in experiments]
    arm_ids = [a.id for a in db.query(TreatmentArm.id).filter(TreatmentArm.experiment_id.in_(exp_ids)).all()] if exp_ids else []
    obs_count = db.query(Observation).filter(Observation.treatment_arm_id.in_(arm_ids)).count() if arm_ids else 0
    return {"experiment_count": len(experiments), "observation_count": obs_count}


def _parse_summary_json(raw: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        data = json.loads(m.group()) if m else {}
    return {
        "objective": data.get("objective") or "Not stated in the extracted text.",
        "product": data.get("product") or "Not stated in the extracted text.",
        "treatments": [t for t in (data.get("treatments") or []) if isinstance(t, str)][:8],
        "variables": [v for v in (data.get("variables") or []) if isinstance(v, str)][:8],
        "main_findings": [f for f in (data.get("main_findings") or []) if isinstance(f, str)][:6],
    }


def get_or_generate_summary(
    paper: Paper, project_id: int, db: Session, *, regenerate: bool = False, user_id: int | None = None,
) -> dict:
    provider_fallback: list = []
    if paper.summary_json and not regenerate:
        result = json.loads(paper.summary_json)
        result["cached"] = True
    else:
        context = _build_context(paper.id, db)
        if not context.strip():
            raise RuntimeError("No extracted text is available for this paper yet — run extraction first.")

        with usage_context(feature="paper_summary", user_id=user_id, project_id=project_id, paper_id=paper.id) as ctx:
            raw = ask_llm(_SYSTEM_PROMPT, f"PAPER TEXT EXCERPTS:\n{context}", max_tokens=700)
        provider_fallback = ctx.fallback_events
        result = _parse_summary_json(raw)

        # Cached verbatim — provider_fallback is per-run, not cached, so it's
        # added back in below regardless of which branch produced `result`.
        paper.summary_json = json.dumps(result)
        paper.summary_generated_at = datetime.utcnow()
        db.commit()
        result["cached"] = False

    result["provider_fallback"] = provider_fallback

    result["counts"] = _structured_counts(paper.id, project_id, db)
    result["generated_at"] = paper.summary_generated_at.isoformat() if paper.summary_generated_at else None
    return result
