"""
Lazy, process-wide singleton GLiNER model loader.

Loading takes anywhere from ~1s (already cached locally) to ~70s (first run,
downloading the checkpoint from Hugging Face) — this must happen once per
process, not once per paper. Never raises: per the fail-soft contract in
app/extraction/common/base.py, an engine with an optional sub-component that
isn't available must degrade gracefully, not abort the whole extraction.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

_model = None
_lock = threading.Lock()
_load_failed_reason: Optional[str] = None


def get_gliner_model():
    """Returns the shared GLiNER model instance, or None if it could not be
    loaded (e.g. no cached checkpoint and no network on first run)."""
    global _model, _load_failed_reason
    if _model is not None:
        return _model
    if _load_failed_reason is not None:
        return None

    with _lock:
        if _model is not None:
            return _model
        if _load_failed_reason is not None:
            return None
        try:
            from gliner import GLiNER
            from app.core.config import settings

            logger.info("Loading GLiNER model %s ...", settings.GLINER_MODEL_NAME)
            _model = GLiNER.from_pretrained(settings.GLINER_MODEL_NAME)
            logger.info("GLiNER model loaded.")
        except Exception as exc:
            _load_failed_reason = str(exc)
            logger.error("GLiNER model failed to load: %s", exc, exc_info=True)
            return None
    return _model


def gliner_load_error() -> Optional[str]:
    """The reason the model failed to load, if it did — for surfacing an
    honest error to the user instead of a silent empty result."""
    return _load_failed_reason


def reset_for_tests() -> None:
    """Test-only hook to force a fresh load attempt in the next call."""
    global _model, _load_failed_reason
    _model = None
    _load_failed_reason = None
