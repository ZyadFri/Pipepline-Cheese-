"""
Tests for app/services/llm_usage.py (recording + aggregation) and the
GET /auth/me/llm-usage endpoint. Most tests seed LLMUsageEvent rows directly
(fast, deterministic) — one end-to-end test mocks the OpenAI client at the
lowest level to prove ask_llm() -> _ask_groq() actually records a real event,
which is the same pattern food_extractor.py's _provider_call() uses.
"""
from unittest.mock import MagicMock, patch

import pytest

from app.db.models import LLMUsageEvent, User
from app.core.security import create_access_token, hash_password
from app.services.llm_usage import (
    record_usage, summarize_usage_for_user, usage_context,
)


class _NonClosingSession:
    """record_usage() opens its own SessionLocal() and closes it when done —
    correct in production (a separate session from the caller's), but tests
    need that redirected at the shared in-memory test session, whose .close()
    must be a no-op or it tears down the test's own fixture too. Same pattern
    used by test_engine_scoped_staging.py / test_gliner_engine_integration.py."""
    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def close(self):
        pass


def _seed_event(db, **overrides):
    defaults = dict(
        user_id=1, project_id=None, paper_id=None,
        feature="llm_extraction", provider="groq", model="test-model",
        prompt_tokens=100, completion_tokens=50, total_tokens=150,
        latency_ms=250, success=True,
    )
    defaults.update(overrides)
    event = LLMUsageEvent(**defaults)
    db.add(event)
    db.commit()
    return event


# ── record_usage / usage_context ────────────────────────────────────────

def test_record_usage_without_context_still_writes_a_row(db, test_user, monkeypatch):
    # record_usage opens its own SessionLocal(); point that at the test DB.
    import app.services.llm_usage as llm_usage_module
    monkeypatch.setattr(llm_usage_module, "SessionLocal", lambda: _NonClosingSession(db))

    record_usage(provider="groq", model="m", prompt_tokens=1, completion_tokens=2, total_tokens=3, success=True)
    row = db.query(LLMUsageEvent).order_by(LLMUsageEvent.id.desc()).first()
    assert row is not None
    assert row.feature == "unknown"
    assert row.user_id is None


def test_record_usage_inside_context_is_attributed(db, test_user, monkeypatch):
    import app.services.llm_usage as llm_usage_module
    monkeypatch.setattr(llm_usage_module, "SessionLocal", lambda: _NonClosingSession(db))

    with usage_context(feature="ask_paper", user_id=test_user.id, project_id=5, paper_id=9):
        record_usage(provider="groq", model="m", prompt_tokens=10, completion_tokens=20, total_tokens=30, success=True)

    row = db.query(LLMUsageEvent).order_by(LLMUsageEvent.id.desc()).first()
    assert row.feature == "ask_paper"
    assert row.user_id == test_user.id
    assert row.project_id == 5
    assert row.paper_id == 9
    assert row.total_tokens == 30


def test_record_usage_never_raises_on_db_failure(db, test_user, monkeypatch):
    import app.services.llm_usage as llm_usage_module

    def _broken_session():
        raise RuntimeError("db is down")

    monkeypatch.setattr(llm_usage_module, "SessionLocal", _broken_session)
    # Must not raise — a logging failure must never break a real LLM call.
    record_usage(provider="groq", model="m", success=True)


def test_context_is_restored_after_exit(db, test_user, monkeypatch):
    import app.services.llm_usage as llm_usage_module
    monkeypatch.setattr(llm_usage_module, "SessionLocal", lambda: _NonClosingSession(db))

    with usage_context(feature="paper_summary", user_id=test_user.id):
        pass
    # Outside the block, a bare record_usage() should NOT inherit "paper_summary".
    record_usage(provider="groq", model="m", success=True)
    row = db.query(LLMUsageEvent).order_by(LLMUsageEvent.id.desc()).first()
    assert row.feature == "unknown"


# ── summarize_usage_for_user ────────────────────────────────────────────

def test_summarize_usage_totals_and_breakdowns(db, test_user):
    _seed_event(db, user_id=test_user.id, provider="groq", model="model-a", feature="llm_extraction", total_tokens=100)
    _seed_event(db, user_id=test_user.id, provider="groq", model="model-a", feature="llm_extraction", total_tokens=50)
    _seed_event(db, user_id=test_user.id, provider="openai", model="model-b", feature="ask_paper", total_tokens=25, success=False)
    other = User(email="other-usage@example.com", full_name="Other", hashed_password=hash_password("x"), is_active=True)
    db.add(other)
    db.commit()
    _seed_event(db, user_id=other.id, provider="groq", model="model-a", total_tokens=999)  # must not leak into test_user's summary

    summary = summarize_usage_for_user(db, test_user.id)
    assert summary["total_calls"] == 3
    assert summary["successful_calls"] == 2
    assert summary["failed_calls"] == 1
    assert summary["total_tokens"] == 175

    by_model = {(m["provider"], m["model"]): m for m in summary["by_model"]}
    assert by_model[("groq", "model-a")]["calls"] == 2
    assert by_model[("groq", "model-a")]["total_tokens"] == 150
    assert by_model[("openai", "model-b")]["calls"] == 1

    by_feature = {f["feature"]: f for f in summary["by_feature"]}
    assert by_feature["llm_extraction"]["calls"] == 2
    assert by_feature["ask_paper"]["calls"] == 1

    assert len(summary["recent"]) == 3
    assert summary["recent"][0]["total_tokens"] in (100, 50, 25)  # most recent first


def test_summarize_usage_with_no_events_is_all_zeroes(db, test_user):
    summary = summarize_usage_for_user(db, test_user.id)
    assert summary["total_calls"] == 0
    assert summary["total_tokens"] == 0
    assert summary["by_model"] == []
    assert summary["by_feature"] == []
    assert summary["recent"] == []
    assert summary["rate_limits"] == []


def test_summarize_usage_surfaces_latest_rate_limit_per_provider(db, test_user):
    _seed_event(
        db, user_id=test_user.id, provider="groq", model="m1",
        rl_limit_requests=100, rl_remaining_requests=80,
        rl_limit_tokens=10000, rl_remaining_tokens=9000,
    )
    _seed_event(
        db, user_id=test_user.id, provider="groq", model="m1",
        rl_limit_requests=100, rl_remaining_requests=60,  # more recent -> should win
        rl_limit_tokens=10000, rl_remaining_tokens=7000,
    )
    summary = summarize_usage_for_user(db, test_user.id)
    assert len(summary["rate_limits"]) == 1
    assert summary["rate_limits"][0]["remaining_requests"] == 60


# ── GET /auth/me/llm-usage ───────────────────────────────────────────────

def test_llm_usage_endpoint_returns_current_users_summary(client, auth_headers, db, test_user):
    _seed_event(db, user_id=test_user.id, total_tokens=42)
    resp = client.get("/api/auth/me/llm-usage", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_calls"] == 1
    assert body["total_tokens"] == 42


def test_llm_usage_endpoint_requires_auth(client, db, test_user):
    resp = client.get("/api/auth/me/llm-usage")
    assert resp.status_code == 401


# ── End-to-end: ask_llm() -> OpenAI (primary) actually records a usage event ──

def _fake_openai_completion(text: str, prompt_tokens=12, completion_tokens=8, total_tokens=20, headers=None):
    fake_message = MagicMock()
    fake_message.content = text
    fake_choice = MagicMock()
    fake_choice.message = fake_message
    fake_usage = MagicMock()
    fake_usage.prompt_tokens = prompt_tokens
    fake_usage.completion_tokens = completion_tokens
    fake_usage.total_tokens = total_tokens
    fake_completion = MagicMock()
    fake_completion.choices = [fake_choice]
    fake_completion.usage = fake_usage
    fake_raw_response = MagicMock()
    fake_raw_response.headers = headers or {}
    fake_raw_response.parse.return_value = fake_completion
    fake_client = MagicMock()
    fake_client.chat.completions.with_raw_response.create.return_value = fake_raw_response
    return fake_client


def test_ask_llm_openai_primary_path_records_a_real_usage_event(db, test_user, monkeypatch):
    import app.services.llm_usage as llm_usage_module
    from app.core.config import settings

    monkeypatch.setattr(llm_usage_module, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "fake-openai-key")
    monkeypatch.setattr(settings, "OPENAI_MODEL", "openai-test-model")

    fake_client = _fake_openai_completion(
        "the answer",
        headers={
            "x-ratelimit-limit-requests": "1000",
            "x-ratelimit-remaining-requests": "997",
            "x-ratelimit-limit-tokens": "100000",
            "x-ratelimit-remaining-tokens": "98000",
        },
    )

    with patch("openai.OpenAI", return_value=fake_client):
        from app.services.llm_qa import ask_llm
        with usage_context(feature="ask_paper", user_id=test_user.id, project_id=1, paper_id=2) as ctx:
            answer = ask_llm("system prompt", "user prompt", max_tokens=100)

    assert answer == "the answer"
    assert ctx.fallback_events == []
    row = db.query(LLMUsageEvent).order_by(LLMUsageEvent.id.desc()).first()
    assert row.provider == "openai"
    assert row.model == "openai-test-model"
    assert row.total_tokens == 20
    assert row.feature == "ask_paper"
    assert row.user_id == test_user.id
    assert row.rl_remaining_requests == 997
    assert row.rl_remaining_tokens == 98000


def test_ask_llm_falls_back_to_groq_when_openai_is_exhausted(db, test_user, monkeypatch):
    import app.services.llm_usage as llm_usage_module
    from app.core.config import settings

    monkeypatch.setattr(llm_usage_module, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "fake-openai-key")
    monkeypatch.setattr(settings, "OPENAI_MODEL", "openai-test-model")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-groq-key")
    monkeypatch.setattr(settings, "GROQ_MODEL", "groq-test-model")

    failing_openai_client = MagicMock()
    failing_openai_client.chat.completions.with_raw_response.create.side_effect = RuntimeError(
        "Error code: 429 - insufficient_quota: You exceeded your current quota"
    )
    working_groq_client = _fake_openai_completion("groq answer")

    with patch("openai.OpenAI", side_effect=[failing_openai_client, working_groq_client]):
        from app.services.llm_qa import ask_llm
        with usage_context(feature="ask_paper", user_id=test_user.id) as ctx:
            answer = ask_llm("system prompt", "user prompt", max_tokens=100)

    assert answer == "groq answer"
    assert len(ctx.fallback_events) == 1
    assert ctx.fallback_events[0]["from_provider"] == "openai"
    assert ctx.fallback_events[0]["to_provider"] == "groq"
    assert "insufficient_quota" in ctx.fallback_events[0]["reason"]

    rows = db.query(LLMUsageEvent).order_by(LLMUsageEvent.id.asc()).all()
    assert len(rows) == 2
    assert rows[0].provider == "openai" and rows[0].success is False
    assert rows[1].provider == "groq" and rows[1].success is True
    assert rows[1].total_tokens == 20


# ── food_extractor._call_with_fallback: same OpenAI -> Groq -> Gemini chain ──

def test_food_extractor_falls_back_from_openai_to_groq(db, test_user, monkeypatch):
    import app.services.llm_usage as llm_usage_module
    from app.core.config import settings

    monkeypatch.setattr(llm_usage_module, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "fake-openai-key")
    monkeypatch.setattr(settings, "OPENAI_MODEL", "openai-test-model")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-groq-key")
    monkeypatch.setattr(settings, "GROQ_FOOD_MODEL", "groq-food-test-model")
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "")

    failing_openai_client = MagicMock()
    failing_openai_client.chat.completions.with_raw_response.create.side_effect = RuntimeError(
        "insufficient_quota: account has no remaining credit"
    )
    working_groq_client = _fake_openai_completion('{"experiments": []}')

    with patch("openai.OpenAI", side_effect=[failing_openai_client, working_groq_client]):
        from app.services.food_extractor import _call_with_fallback
        with usage_context(feature="llm_extraction", user_id=test_user.id, project_id=1, paper_id=2) as ctx:
            raw = _call_with_fallback(system="sys", user_content="extract this", max_tokens=100)

    assert raw == '{"experiments": []}'
    assert len(ctx.fallback_events) == 1
    assert ctx.fallback_events[0]["from_provider"] == "openai"
    assert ctx.fallback_events[0]["to_provider"] == "groq"
    assert "insufficient_quota" in ctx.fallback_events[0]["reason"]

    rows = db.query(LLMUsageEvent).order_by(LLMUsageEvent.id.asc()).all()
    assert [r.provider for r in rows] == ["openai", "groq"]
    assert rows[1].model == "groq-food-test-model"


def test_food_extractor_raises_when_every_tier_fails(db, test_user, monkeypatch):
    import app.services.llm_usage as llm_usage_module
    from app.core.config import settings

    monkeypatch.setattr(llm_usage_module, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "fake-openai-key")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "")

    failing_client = MagicMock()
    failing_client.chat.completions.with_raw_response.create.side_effect = RuntimeError("boom")

    with patch("openai.OpenAI", return_value=failing_client):
        from app.services.food_extractor import _call_with_fallback
        with usage_context(feature="llm_extraction", user_id=test_user.id):
            with pytest.raises(RuntimeError):
                _call_with_fallback(system="sys", user_content="extract this", max_tokens=100)


def test_food_extractor_raises_with_no_provider_configured(db, test_user, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "")

    from app.services.food_extractor import _call_with_fallback
    with pytest.raises(RuntimeError, match="No LLM provider is configured"):
        _call_with_fallback(system="sys", user_content="extract this", max_tokens=100)
