"""
Central classification of external-provider errors (LLM APIs: Groq, Gemini,
OpenAI, Anthropic; local model downloads: GLiNER/Hugging Face) into safe,
honest, user-facing messages.

Users must never see a raw provider error: JSON error bodies, stack traces,
HTTP status codes, or anything that could contain an API key. The real
exception should always still be logged server-side (callers do this
themselves via `logger.error(..., exc_info=True)` — this module only decides
what the USER sees, never suppresses the real detail from logs).

This consolidates what used to be a chart_converter.py-only check
(_TEMP_PROVIDER_MARKERS/_is_temporary_provider_error) into one place so
every provider call site — food extraction, chart digitization, and any
future one — classifies errors the same way.
"""
from __future__ import annotations

import re

QUOTA_MESSAGE = (
    "The current API key has reached its usage limit. Please update the API key and try again."
)
AUTH_MESSAGE = (
    "The configured API key is no longer valid. Please update the API key and try again."
)
UNAVAILABLE_MESSAGE = (
    "The extraction service is temporarily unavailable. Please try again shortly."
)
GENERIC_MESSAGE = (
    "The extraction service encountered an unexpected error. Please try again; "
    "if this keeps happening, contact an administrator."
)

# Order matters: quota/rate-limit checked before generic "unavailable" markers
# since a 429 can otherwise also read like a transient outage.
_QUOTA_PATTERNS = (
    r"\b429\b",
    r"\bquota\b",
    r"rate[\s_-]?limit",
    r"insufficient[\s_-]?quota",
    r"credits?\s+exhausted",
    r"resource[_\s-]?exhausted",
    r"too many requests",
)
_AUTH_PATTERNS = (
    r"invalid[\s_-]?api[\s_-]?key",
    r"api[\s_-]?key.{0,20}(?:expired|revoked|invalid)",
    r"incorrect api key",
    r"\bunauthorized\b",
    r"authentication[\s_-]?fail",
    r"\b401\b",
    r"\b403\b",
    r"permission[\s_-]?denied",
)
_UNAVAILABLE_PATTERNS = (
    r"\b502\b",
    r"\b503\b",
    r"\b504\b",
    r"service[\s_-]?unavailable",
    r"\btimeout\b",
    r"timed out",
    r"connection\s+(?:error|refused|reset|aborted)",
    r"temporarily unavailable",
    r"\boverloaded\b",
    r"model[\s_-]?overloaded",
)


def _matches(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def _status_code_of(exc: BaseException) -> "int | None":
    """Best-effort extraction of an HTTP status code from whatever shape the
    SDK in use (openai, google-genai, anthropic, httpx, requests) attaches it
    in — they don't agree on an attribute name."""
    for attr in ("status_code", "code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    if response is not None:
        value = getattr(response, "status_code", None)
        if isinstance(value, int):
            return value
    return None


def classify_provider_error(exc: BaseException) -> str:
    """Map any exception from an external provider call (or a local model
    load, e.g. GLiNER fetching its checkpoint from Hugging Face) to one
    honest, safe, user-facing sentence. Never returns provider internals."""
    text = f"{type(exc).__name__}: {exc}"
    status_code = _status_code_of(exc)

    if status_code == 429 or _matches(text, _QUOTA_PATTERNS):
        return QUOTA_MESSAGE
    if status_code in (401, 403) or _matches(text, _AUTH_PATTERNS):
        return AUTH_MESSAGE
    if status_code in (502, 503, 504) or _matches(text, _UNAVAILABLE_PATTERNS):
        return UNAVAILABLE_MESSAGE
    return GENERIC_MESSAGE


def is_temporary_provider_error(exc: BaseException) -> bool:
    """True for errors worth a lightweight retry/skip-and-continue rather
    than failing outright (rate limit, overload, transient network issue) —
    kept as its own predicate for callers like chart_converter.py that need
    a yes/no decision, not just a display string."""
    text = f"{type(exc).__name__}: {exc}"
    status_code = _status_code_of(exc)
    return (
        status_code in (429, 503)
        or _matches(text, _QUOTA_PATTERNS)
        or _matches(text, _UNAVAILABLE_PATTERNS)
    )


# Alias — used by extraction job error paths so call sites read clearly
# ("classify_extraction_error" at a Job.error_message assignment) while
# sharing one implementation.
classify_extraction_error = classify_provider_error
