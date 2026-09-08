"""
Tests for the shared provider-error normalization layer
(app/core/errors.py) — users must never see a raw provider error (JSON
body, stack trace, status code, API key), only one of a small set of
honest, actionable sentences. The real exception is still available to
whatever logs it; this module only decides what the user sees.
"""
import pytest

from app.core.errors import (
    AUTH_MESSAGE,
    GENERIC_MESSAGE,
    QUOTA_MESSAGE,
    UNAVAILABLE_MESSAGE,
    classify_provider_error,
    is_temporary_provider_error,
)


class FakeHTTPError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


@pytest.mark.parametrize("message", [
    "Error code: 429 - {'error': {'message': 'Rate limit reached'}}",
    "openai.RateLimitError: You exceeded your current quota",
    "google.api_core.exceptions.ResourceExhausted: 429 Quota exceeded",
    "insufficient_quota: You have run out of credits",
])
def test_classifies_quota_errors(message):
    assert classify_provider_error(Exception(message)) == QUOTA_MESSAGE


def test_classifies_quota_by_status_code_even_with_opaque_message():
    assert classify_provider_error(FakeHTTPError("something went wrong", status_code=429)) == QUOTA_MESSAGE


@pytest.mark.parametrize("message", [
    "Error code: 401 - Incorrect API key provided",
    "AuthenticationError: Invalid API key",
    "403 Forbidden: permission denied for this resource",
])
def test_classifies_auth_errors(message):
    assert classify_provider_error(Exception(message)) == AUTH_MESSAGE


def test_classifies_auth_by_status_code():
    assert classify_provider_error(FakeHTTPError("nope", status_code=401)) == AUTH_MESSAGE
    assert classify_provider_error(FakeHTTPError("nope", status_code=403)) == AUTH_MESSAGE


@pytest.mark.parametrize("message", [
    "503 Service Unavailable",
    "The model is currently overloaded, please try again later",
    "Connection timed out while waiting for a response",
    "httpx.ConnectError: Connection refused",
])
def test_classifies_unavailable_errors(message):
    assert classify_provider_error(Exception(message)) == UNAVAILABLE_MESSAGE


def test_classifies_unavailable_by_status_code():
    for code in (502, 503, 504):
        assert classify_provider_error(FakeHTTPError("x", status_code=code)) == UNAVAILABLE_MESSAGE


def test_unrecognized_errors_get_the_generic_honest_message():
    assert classify_provider_error(ValueError("some totally unrelated bug")) == GENERIC_MESSAGE


def test_never_leaks_raw_exception_text():
    secret_bearing_error = Exception("Bearer sk-super-secret-key-123 rejected: 401 unauthorized")
    result = classify_provider_error(secret_bearing_error)
    assert "sk-super-secret-key-123" not in result
    assert result == AUTH_MESSAGE


class TestIsTemporaryProviderError:
    def test_quota_and_unavailable_are_temporary(self):
        assert is_temporary_provider_error(Exception("429 rate limit exceeded"))
        assert is_temporary_provider_error(Exception("503 service unavailable"))

    def test_auth_errors_are_not_temporary(self):
        assert not is_temporary_provider_error(Exception("401 invalid api key"))

    def test_unrelated_errors_are_not_temporary(self):
        assert not is_temporary_provider_error(ValueError("bad input"))
