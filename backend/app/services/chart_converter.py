"""
chart_converter.py — chart figure -> data table, via a vision LLM call.

For every extracted figure PNG:
  1. Ask a vision-capable provider to read the chart and return either a
     Markdown table of the underlying data points, or NOT_A_CHART.
  2. Parse and validate the returned table.
  3. Save a validated CSV beside the original figure.

The original figure is always preserved. Chart digitization is an optional,
best-effort enrichment step: a temporary provider outage must never make the
whole paper extraction look failed.
"""
import base64
import hashlib
import logging
import re
import time
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from typing import Optional

import pandas as pd

from app.core.config import settings
from app.services.docling_extractor import DoclingFigure
from app.services.food_extractor import _call_with_fallback

logger = logging.getLogger(__name__)

_MIN_IMAGE_DIM = 50
_MIN_ROWS = 2
_MIN_COLS = 2
_MAX_COLS = 20

_TEMP_PROVIDER_MARKERS = (
    "429",
    "503",
    "rate limit",
    "rate_limit",
    "resource_exhausted",
    "quota",
    "overloaded",
    "temporarily unavailable",
    "service unavailable",
    "timeout",
    "timed out",
)


def _validate_dataframe(df: pd.DataFrame) -> tuple:
    if df is None or df.empty:
        return False, "empty dataframe"
    if len(df) < _MIN_ROWS:
        return False, f"too few rows ({len(df)} < {_MIN_ROWS})"
    if len(df.columns) < _MIN_COLS:
        return False, f"too few columns ({len(df.columns)} < {_MIN_COLS})"
    if len(df.columns) > _MAX_COLS:
        return False, f"too many columns ({len(df.columns)} > {_MAX_COLS}) — likely multi-panel confusion"

    has_numeric = False
    for col in df.columns:
        try:
            numeric = pd.to_numeric(df[col], errors="coerce")
            if numeric.notna().any():
                has_numeric = True
                break
        except Exception:
            pass
    if not has_numeric:
        return False, "no numeric columns — likely a photograph or diagram, not a chart"

    all_null = df.map(lambda v: v is None or (isinstance(v, str) and not v.strip())).all(axis=None)
    if all_null:
        return False, "all cells are null or whitespace"

    return True, None


def _parse_markdown_table(md_table: str) -> Optional[pd.DataFrame]:
    if not md_table or not md_table.strip():
        return None
    try:
        lines = [ln for ln in md_table.splitlines() if ln.strip()]
        kept = [
            ln for ln in lines
            if not re.match(r"^\s*\|?[\s\-:]+(\|[\s\-:]+)*\|?\s*$", ln)
        ]
        if len(kept) < 2:
            return None
        df = pd.read_csv(StringIO("\n".join(kept)), sep="|", engine="python")
        df = df.dropna(axis=1, how="all")
        df.columns = [str(c).strip() for c in df.columns]
        df = df.dropna(how="all")
        for col in df.select_dtypes(include="object").columns:
            df[col] = df[col].str.strip()
        return df if not df.empty else None
    except Exception as exc:
        logger.debug("Markdown table parse failed: %s", exc)
        return None


_CHART_EXTRACTION_PROMPT = """\
This is a figure from a scientific paper. If it contains plotted data (a bar, \
line, or scatter chart with numeric axes), extract the underlying data points as \
a Markdown table: one column for the x-axis variable, one column per data series, \
using the series/legend labels as column headers. Read approximate values from \
the plotted points or bars.

If this is NOT a data chart (a photograph, diagram, chemical structure, logo, or \
similar), respond with exactly: NOT_A_CHART

Return ONLY the Markdown table or NOT_A_CHART — no other text, no explanation."""


@dataclass
class ChartResult:
    item_ref: str
    figure_index: int
    image_path: str
    image_hash: Optional[str]
    csv_path: Optional[str]
    status: str                      # valid | rejected | error | skipped
    reject_reason: Optional[str]
    row_count: int = 0
    col_count: int = 0


def _image_hash(image_path: str) -> Optional[str]:
    try:
        sha = hashlib.sha256()
        with open(image_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                sha.update(chunk)
        return sha.hexdigest()
    except Exception:
        return None


def _image_to_data_url(image_path: str) -> Optional[str]:
    try:
        data = Path(image_path).read_bytes()
    except Exception:
        return None
    ext = Path(image_path).suffix.lstrip(".").lower() or "png"
    return f"data:image/{ext};base64,{base64.b64encode(data).decode()}"


def _skip_all(figures: list, reason: str) -> list:
    return [
        ChartResult(
            item_ref=fig.item_ref,
            figure_index=idx,
            image_path=fig.image_path,
            image_hash=_image_hash(fig.image_path) if fig.image_path else None,
            csv_path=None,
            status="skipped",
            reject_reason=reason,
        )
        for idx, fig in enumerate(figures, start=1)
    ]


def _is_temporary_provider_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _TEMP_PROVIDER_MARKERS)


def _call_vision(user_content) -> str:
    """Reads one chart image via the same OpenAI -> Groq -> Gemini fallback
    chain text extraction uses, with the vision-capable model for each tier
    (Groq's text model can't read images, so that tier needs its own
    GROQ_VISION_MODEL override; OpenAI's gpt-4o-mini and Gemini's
    gemini-2.5-flash are already vision-capable as their normal models)."""
    return _call_with_fallback(
        system=None, user_content=user_content, max_tokens=1500, json_mode=False,
        groq_model=settings.GROQ_VISION_MODEL,
    ).strip()


def convert_charts(figures: list, cache_dir: str):
    """Best-effort chart digitization generator.

    Provider-capacity/rate-limit failures are returned as ``skipped`` rather
    than ``error``. The caller can still classify and show the original figure,
    and the paper extraction remains usable instead of being marked partial
    failure for an optional enrichment step.
    """
    if not settings.OPENAI_API_KEY and not settings.GROQ_API_KEY and not settings.GOOGLE_API_KEY:
        yield from _skip_all(figures, "No vision provider API key configured")
        return

    called_api = False

    for idx, fig in enumerate(figures, start=1):
        if not fig.image_path or not Path(fig.image_path).exists():
            yield ChartResult(
                item_ref=fig.item_ref,
                figure_index=idx,
                image_path=fig.image_path,
                image_hash=None,
                csv_path=None,
                status="error",
                reject_reason="image file missing",
            )
            continue

        img_hash = _image_hash(fig.image_path)
        img_p = Path(fig.image_path)

        try:
            from PIL import Image
            with Image.open(fig.image_path) as im:
                w, h = im.size
            if w < _MIN_IMAGE_DIM or h < _MIN_IMAGE_DIM:
                yield ChartResult(
                    item_ref=fig.item_ref,
                    figure_index=idx,
                    image_path=fig.image_path,
                    image_hash=img_hash,
                    csv_path=None,
                    status="rejected",
                    reject_reason=f"image too small ({w}x{h}px) to be a readable chart",
                )
                continue
        except Exception:
            pass

        if called_api:
            time.sleep(1.5)

        csv_candidate = img_p.parent / f"{img_p.stem}_data.csv"
        if csv_candidate.exists():
            try:
                df = pd.read_csv(str(csv_candidate))
                valid, _ = _validate_dataframe(df)
                if valid:
                    yield ChartResult(
                        item_ref=fig.item_ref,
                        figure_index=idx,
                        image_path=fig.image_path,
                        image_hash=img_hash,
                        csv_path=str(csv_candidate),
                        status="valid",
                        reject_reason=None,
                        row_count=len(df),
                        col_count=len(df.columns),
                    )
                    continue
            except Exception:
                pass

        data_url = _image_to_data_url(fig.image_path)
        if data_url is None:
            yield ChartResult(
                item_ref=fig.item_ref,
                figure_index=idx,
                image_path=fig.image_path,
                image_hash=img_hash,
                csv_path=None,
                status="error",
                reject_reason="could not read image file",
            )
            continue

        logger.info(
            "Reading chart %d/%d with configured vision provider: %s",
            idx,
            len(figures),
            img_p.name,
        )
        called_api = True

        try:
            user_content = [
                {"type": "text", "text": _CHART_EXTRACTION_PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]
            raw = _call_vision(user_content)

            if raw.upper().startswith("NOT_A_CHART"):
                yield ChartResult(
                    item_ref=fig.item_ref,
                    figure_index=idx,
                    image_path=fig.image_path,
                    image_hash=img_hash,
                    csv_path=None,
                    status="rejected",
                    reject_reason="model reports this is not a data chart",
                )
                continue

            df = _parse_markdown_table(raw)
            if df is None:
                yield ChartResult(
                    item_ref=fig.item_ref,
                    figure_index=idx,
                    image_path=fig.image_path,
                    image_hash=img_hash,
                    csv_path=None,
                    status="rejected",
                    reject_reason="markdown table parse failed",
                )
                continue

            valid, reason = _validate_dataframe(df)
            if not valid:
                yield ChartResult(
                    item_ref=fig.item_ref,
                    figure_index=idx,
                    image_path=fig.image_path,
                    image_hash=img_hash,
                    csv_path=None,
                    status="rejected",
                    reject_reason=reason,
                )
                continue

            csv_path = img_p.parent / f"{img_p.stem}_data.csv"
            df.to_csv(str(csv_path), index=False)
            yield ChartResult(
                item_ref=fig.item_ref,
                figure_index=idx,
                image_path=fig.image_path,
                image_hash=img_hash,
                csv_path=str(csv_path),
                status="valid",
                reject_reason=None,
                row_count=len(df),
                col_count=len(df.columns),
            )

        except Exception as exc:
            temporary = _is_temporary_provider_error(exc)
            if temporary:
                logger.warning(
                    "Chart digitization temporarily unavailable for %s: %s",
                    img_p.name,
                    exc,
                )
                yield ChartResult(
                    item_ref=fig.item_ref,
                    figure_index=idx,
                    image_path=fig.image_path,
                    image_hash=img_hash,
                    csv_path=None,
                    status="skipped",
                    reject_reason="chart reader temporarily unavailable; original figure preserved",
                )
            else:
                logger.warning("Chart extraction error for %s: %s", img_p.name, exc)
                yield ChartResult(
                    item_ref=fig.item_ref,
                    figure_index=idx,
                    image_path=fig.image_path,
                    image_hash=img_hash,
                    csv_path=None,
                    status="error",
                    reject_reason=str(exc)[:200],
                )
