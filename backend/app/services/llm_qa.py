"""
Generic single-turn LLM text completion — "prompt in, text out", no JSON-row
extraction contract. Shared by the paper-summary and ask-this-paper features
so they don't each hand-roll provider dispatch; reuses the same
AI_PROVIDER/API-key configuration app/services/ai_extractor.py already uses,
kept as a separate module since that one is tightly coupled to its
schema-row extraction prompt and response parsing.

Every provider call records a usage event (app.services.llm_usage) — callers
should wrap ask_llm() in a `with usage_context(feature=..., user_id=..., ...)`
block so the event is attributed correctly (see paper_summary.py /
paper_chat.py for the pattern).
"""
import logging
import time

from app.core.config import settings
from app.services.llm_usage import (
    note_fallback, parse_openai_style_rate_limit_headers, record_usage,
)

logger = logging.getLogger(__name__)

# OpenAI is the primary provider for these two features (paper summary,
# ask-this-paper); Groq is the automatic fallback when OpenAI is exhausted
# or fails, same OpenAI -> Groq order as the main extraction pipeline
# (food_extractor._call_with_fallback). Anthropic/Google AI/Vertex remain
# available as direct functions (e.g. for a future explicit provider
# choice) but aren't part of this automatic chain. The _ask_* functions are
# defined further down in this module — referencing them by name here is
# fine since Python resolves module-level names at call time, not at
# def-time, and ask_llm() is never called until the module has fully loaded.


def ask_llm(system_prompt: str, user_prompt: str, max_tokens: int = 900) -> str:
    """Tries OpenAI first, falling back to Groq if OpenAI is exhausted/fails
    (note_fallback() records this against the ambient usage_context() so
    callers can tell the user which provider actually answered). Raises only
    if every configured tier fails — callers decide how to present that
    (these are optional, LLM-enhanced features, not the core extraction
    pipeline)."""
    tiers = [
        ("openai", settings.OPENAI_API_KEY, _ask_openai),
        ("groq", settings.GROQ_API_KEY, _ask_groq),
    ]
    available = [t for t in tiers if t[1]]
    if not available:
        # No OpenAI/Groq key configured — fall back to whatever AI_PROVIDER
        # names, for anthropic/google_ai/vertexai setups.
        provider = settings.AI_PROVIDER.lower()
        dispatch = {
            "groq": _ask_groq, "openai": _ask_openai, "anthropic": _ask_anthropic,
            "google_ai": _ask_google_ai, "vertexai": _ask_vertexai,
        }
        if provider not in dispatch:
            raise RuntimeError(f"Unknown AI_PROVIDER '{provider}'.")
        return dispatch[provider](system_prompt, user_prompt, max_tokens)

    last_error = None
    for i, (provider_key, _api_key, fn) in enumerate(available):
        try:
            return fn(system_prompt, user_prompt, max_tokens)
        except Exception as exc:
            last_error = str(exc)
            is_last_tier = i == len(available) - 1
            logger.error("ask_llm: %s failed: %s", provider_key, last_error, exc_info=not is_last_tier)
            if is_last_tier:
                raise
            next_provider = available[i + 1][0]
            note_fallback(from_provider=provider_key, to_provider=next_provider, reason=last_error)
    raise RuntimeError(f"All configured providers failed. Last error: {last_error}")


def _ask_groq(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set in backend/.env")
    from openai import OpenAI
    client = OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
    kwargs = dict(
        model=settings.GROQ_MODEL, max_tokens=max_tokens, temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    start = time.monotonic()
    try:
        raw_response = client.chat.completions.with_raw_response.create(**kwargs)
    except Exception as exc:
        record_usage(provider="groq", model=settings.GROQ_MODEL,
                      latency_ms=int((time.monotonic() - start) * 1000),
                      success=False, error_message=str(exc))
        raise
    resp = raw_response.parse()
    usage = resp.usage
    record_usage(
        provider="groq", model=settings.GROQ_MODEL,
        prompt_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
        completion_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
        total_tokens=getattr(usage, "total_tokens", 0) if usage else 0,
        latency_ms=int((time.monotonic() - start) * 1000), success=True,
        rate_limit=parse_openai_style_rate_limit_headers(raw_response.headers),
    )
    return (resp.choices[0].message.content or "").strip()


def _ask_openai(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set in backend/.env")
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    kwargs = dict(
        model=settings.OPENAI_MODEL, max_tokens=max_tokens, temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    start = time.monotonic()
    try:
        raw_response = client.chat.completions.with_raw_response.create(**kwargs)
    except Exception as exc:
        record_usage(provider="openai", model=settings.OPENAI_MODEL,
                      latency_ms=int((time.monotonic() - start) * 1000),
                      success=False, error_message=str(exc))
        raise
    resp = raw_response.parse()
    usage = resp.usage
    record_usage(
        provider="openai", model=settings.OPENAI_MODEL,
        prompt_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
        completion_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
        total_tokens=getattr(usage, "total_tokens", 0) if usage else 0,
        latency_ms=int((time.monotonic() - start) * 1000), success=True,
        rate_limit=parse_openai_style_rate_limit_headers(raw_response.headers),
    )
    return (resp.choices[0].message.content or "").strip()


def _ask_anthropic(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in backend/.env")
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = "claude-sonnet-4-6"
    start = time.monotonic()
    try:
        msg = client.messages.create(
            model=model, max_tokens=max_tokens, system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except Exception as exc:
        record_usage(provider="anthropic", model=model,
                      latency_ms=int((time.monotonic() - start) * 1000),
                      success=False, error_message=str(exc))
        raise
    usage = msg.usage
    record_usage(
        provider="anthropic", model=model,
        prompt_tokens=getattr(usage, "input_tokens", 0) if usage else 0,
        completion_tokens=getattr(usage, "output_tokens", 0) if usage else 0,
        total_tokens=(getattr(usage, "input_tokens", 0) + getattr(usage, "output_tokens", 0)) if usage else 0,
        latency_ms=int((time.monotonic() - start) * 1000), success=True,
    )
    return msg.content[0].text.strip() if msg.content else ""


def _ask_google_ai(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not set in backend/.env")
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    config = types.GenerateContentConfig(max_output_tokens=max_tokens, temperature=0.2,
                                          system_instruction=system_prompt)
    start = time.monotonic()
    try:
        resp = client.models.generate_content(model=settings.GOOGLE_AI_MODEL, contents=user_prompt, config=config)
    except Exception as exc:
        record_usage(provider="google_ai", model=settings.GOOGLE_AI_MODEL,
                      latency_ms=int((time.monotonic() - start) * 1000),
                      success=False, error_message=str(exc))
        raise
    usage = getattr(resp, "usage_metadata", None)
    record_usage(
        provider="google_ai", model=settings.GOOGLE_AI_MODEL,
        prompt_tokens=getattr(usage, "prompt_token_count", 0) if usage else 0,
        completion_tokens=getattr(usage, "candidates_token_count", 0) if usage else 0,
        total_tokens=getattr(usage, "total_token_count", 0) if usage else 0,
        latency_ms=int((time.monotonic() - start) * 1000), success=True,
    )
    return (resp.text or "").strip()


def _ask_vertexai(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    from google import genai
    from google.genai import types
    client = genai.Client(vertexai=True, project=settings.VERTEX_PROJECT, location=settings.VERTEX_LOCATION)
    config = types.GenerateContentConfig(max_output_tokens=max_tokens, temperature=0.2,
                                          system_instruction=system_prompt)
    start = time.monotonic()
    try:
        resp = client.models.generate_content(model=settings.VERTEX_MODEL, contents=user_prompt, config=config)
    except Exception as exc:
        record_usage(provider="vertexai", model=settings.VERTEX_MODEL,
                      latency_ms=int((time.monotonic() - start) * 1000),
                      success=False, error_message=str(exc))
        raise
    usage = getattr(resp, "usage_metadata", None)
    record_usage(
        provider="vertexai", model=settings.VERTEX_MODEL,
        prompt_tokens=getattr(usage, "prompt_token_count", 0) if usage else 0,
        completion_tokens=getattr(usage, "candidates_token_count", 0) if usage else 0,
        total_tokens=getattr(usage, "total_token_count", 0) if usage else 0,
        latency_ms=int((time.monotonic() - start) * 1000), success=True,
    )
    return (resp.text or "").strip()
