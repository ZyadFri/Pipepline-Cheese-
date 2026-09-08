"""
Central LLM usage recorder — one row per provider API call, regardless of
success or failure, so the profile page can show real consumption instead of
a guess.

Two things this deliberately does NOT claim:
  - A total account credit/quota balance. No provider exposes that on the
    same chat-completions endpoint this app calls; it lives behind a
    separate billing API this app has no key for. Surfacing a fabricated
    number here would be worse than surfacing none.
  - Anything for Anthropic/native-Gemini calls beyond token counts. Only
    OpenAI-SDK-shaped providers (Groq, OpenAI, Gemini's OpenAI-compat
    endpoint) return rate-limit headers on every response; those are the
    only real "how much is left" signal available, and only as of the last
    call made, for the current per-minute/per-day window — not a running
    balance either.

Usage:
    with usage_context(feature="llm_extraction", user_id=7, project_id=3, paper_id=12):
        ...
        record_usage(provider="groq", model="...", prompt_tokens=.., ...)

`usage_context` is a plain contextvar, safe across the sync call chains this
app uses it in (FastAPI BackgroundTasks run sync functions via a threadpool
that propagates the current context, and nothing here spawns a new thread or
async task of its own) — it lets deeply-nested provider-call helpers log
against the right user/project/paper without threading those three IDs
through every intermediate function signature.
"""
from __future__ import annotations

import contextvars
import logging
from dataclasses import dataclass
from typing import Optional

from app.db.database import SessionLocal
from app.db.models import LLMUsageEvent

logger = logging.getLogger(__name__)

_context: contextvars.ContextVar[dict] = contextvars.ContextVar("llm_usage_context", default={})


class usage_context:
    """Context manager that sets (and restores) the ambient feature/user/
    project/paper attribution for any record_usage() call made inside it.
    Also collects provider-fallback notices (note_fallback()) raised inside
    the block, on `self.fallback_events` — a plain instance attribute, so
    it's still readable after the `with` block exits and the contextvar
    itself has been reset."""

    def __init__(
        self,
        *,
        feature: str,
        user_id: Optional[int] = None,
        project_id: Optional[int] = None,
        paper_id: Optional[int] = None,
    ):
        self.fallback_events: list[dict] = []
        self._values = {
            "feature": feature, "user_id": user_id,
            "project_id": project_id, "paper_id": paper_id,
            "fallback_events": self.fallback_events,
        }
        self._token = None

    def __enter__(self):
        self._token = _context.set(self._values)
        return self

    def __exit__(self, exc_type, exc, tb):
        _context.reset(self._token)
        return False


def current_context() -> dict:
    return _context.get()


def note_fallback(*, from_provider: str, to_provider: str, reason: str) -> None:
    """Called by a provider-fallback chain (food_extractor._call_with_fallback,
    llm_qa.ask_llm) the moment it actually falls back to a lower-priority
    provider, so the ambient usage_context() can report it to the UI —
    "OpenAI is exhausted, this ran on the backup provider instead" — rather
    than that only being visible by cross-referencing the usage log."""
    ctx = current_context()
    events = ctx.get("fallback_events") if ctx else None
    if events is not None:
        events.append({"from_provider": from_provider, "to_provider": to_provider, "reason": reason[:300]})
    logger.warning("Provider fallback: %s -> %s (%s)", from_provider, to_provider, reason[:200])


@dataclass
class RateLimitSnapshot:
    limit_requests: Optional[int] = None
    remaining_requests: Optional[int] = None
    limit_tokens: Optional[int] = None
    remaining_tokens: Optional[int] = None


def parse_openai_style_rate_limit_headers(headers) -> RateLimitSnapshot:
    """Groq, OpenAI, and Gemini's OpenAI-compat endpoint all return these
    headers (values are strings; missing headers are silently left null
    rather than defaulted to 0, since 0 would falsely read as "exhausted")."""
    def _int(name: str) -> Optional[int]:
        try:
            raw = headers.get(name)
            return int(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None

    return RateLimitSnapshot(
        limit_requests=_int("x-ratelimit-limit-requests"),
        remaining_requests=_int("x-ratelimit-remaining-requests"),
        limit_tokens=_int("x-ratelimit-limit-tokens"),
        remaining_tokens=_int("x-ratelimit-remaining-tokens"),
    )


def record_usage(
    *,
    provider: str,
    model: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    latency_ms: Optional[int] = None,
    success: bool = True,
    error_message: Optional[str] = None,
    rate_limit: Optional[RateLimitSnapshot] = None,
) -> None:
    """Writes one usage row using the ambient usage_context(). Never raises —
    a logging failure must never break a real extraction or chat call; on
    error this just logs and moves on."""
    ctx = current_context()
    if not ctx:
        logger.warning(
            "record_usage() called outside any usage_context() — dropping "
            "attribution-less event for %s/%s", provider, model,
        )
        feature = "unknown"
        user_id = project_id = paper_id = None
    else:
        feature = ctx.get("feature", "unknown")
        user_id = ctx.get("user_id")
        project_id = ctx.get("project_id")
        paper_id = ctx.get("paper_id")

    db = None
    try:
        db = SessionLocal()
        db.add(LLMUsageEvent(
            user_id=user_id, project_id=project_id, paper_id=paper_id,
            feature=feature, provider=provider, model=model,
            prompt_tokens=prompt_tokens or 0, completion_tokens=completion_tokens or 0,
            total_tokens=total_tokens or 0, latency_ms=latency_ms,
            success=success, error_message=(error_message or "")[:2000] if error_message else None,
            rl_limit_requests=rate_limit.limit_requests if rate_limit else None,
            rl_remaining_requests=rate_limit.remaining_requests if rate_limit else None,
            rl_limit_tokens=rate_limit.limit_tokens if rate_limit else None,
            rl_remaining_tokens=rate_limit.remaining_tokens if rate_limit else None,
        ))
        db.commit()
    except Exception:
        logger.error("Failed to record LLM usage event", exc_info=True)
    finally:
        if db is not None:
            db.close()


def summarize_usage_for_user(db, user_id: int, *, recent_limit: int = 30) -> dict:
    """Everything the profile page's usage panel needs, in one call:
    totals, a per-model breakdown, a per-feature breakdown, the most recent
    events, and — where the provider actually returns it — the rate-limit
    snapshot from each provider's most recent call (the only real "how much
    is left" signal available; see this module's docstring for why a total
    account balance can't be shown)."""
    from sqlalchemy import func

    events = db.query(LLMUsageEvent).filter(LLMUsageEvent.user_id == user_id)

    total_calls = events.count()
    successful_calls = events.filter(LLMUsageEvent.success.is_(True)).count()
    totals_row = db.query(
        func.coalesce(func.sum(LLMUsageEvent.prompt_tokens), 0),
        func.coalesce(func.sum(LLMUsageEvent.completion_tokens), 0),
        func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0),
    ).filter(LLMUsageEvent.user_id == user_id).first()
    total_prompt_tokens, total_completion_tokens, total_tokens = totals_row or (0, 0, 0)

    by_model_rows = (
        db.query(
            LLMUsageEvent.provider, LLMUsageEvent.model,
            func.count(LLMUsageEvent.id), func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0),
        )
        .filter(LLMUsageEvent.user_id == user_id)
        .group_by(LLMUsageEvent.provider, LLMUsageEvent.model)
        .order_by(func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0).desc())
        .all()
    )
    by_model = [
        {"provider": provider, "model": model, "calls": calls, "total_tokens": tokens}
        for provider, model, calls, tokens in by_model_rows
    ]

    by_feature_rows = (
        db.query(
            LLMUsageEvent.feature,
            func.count(LLMUsageEvent.id), func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0),
        )
        .filter(LLMUsageEvent.user_id == user_id)
        .group_by(LLMUsageEvent.feature)
        .order_by(func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0).desc())
        .all()
    )
    by_feature = [
        {"feature": feature, "calls": calls, "total_tokens": tokens}
        for feature, calls, tokens in by_feature_rows
    ]

    recent = (
        events.order_by(LLMUsageEvent.created_at.desc()).limit(recent_limit).all()
    )
    recent_out = [
        {
            "id": e.id, "feature": e.feature, "provider": e.provider, "model": e.model,
            "total_tokens": e.total_tokens, "latency_ms": e.latency_ms,
            "success": e.success, "error_message": e.error_message,
            "project_id": e.project_id, "paper_id": e.paper_id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in recent
    ]

    # Latest rate-limit snapshot per provider, most recent call first.
    rate_limits: dict = {}
    for e in (
        events.filter(LLMUsageEvent.rl_remaining_requests.isnot(None))
        .order_by(LLMUsageEvent.created_at.desc())
        .limit(200)
        .all()
    ):
        if e.provider in rate_limits:
            continue
        rate_limits[e.provider] = {
            "provider": e.provider, "model": e.model,
            "limit_requests": e.rl_limit_requests, "remaining_requests": e.rl_remaining_requests,
            "limit_tokens": e.rl_limit_tokens, "remaining_tokens": e.rl_remaining_tokens,
            "as_of": e.created_at.isoformat() if e.created_at else None,
        }

    return {
        "total_calls": total_calls,
        "successful_calls": successful_calls,
        "failed_calls": total_calls - successful_calls,
        "total_prompt_tokens": int(total_prompt_tokens),
        "total_completion_tokens": int(total_completion_tokens),
        "total_tokens": int(total_tokens),
        "by_model": by_model,
        "by_feature": by_feature,
        "recent": recent_out,
        "rate_limits": list(rate_limits.values()),
    }
