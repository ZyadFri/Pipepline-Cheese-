"""
chart_converter.py — chart figure -> data table, via a vision LLM call.

For every extracted figure PNG:
  1. Skip immediately if it's already classified as decorative (logo/license/etc.)
     — no need to spend an LLM call on something we already know isn't data.
  2. Ask a vision-capable Groq model to read the chart and return either a
     Markdown table of the underlying data points, or the literal string
     NOT_A_CHART if the image isn't a data chart.
  3. Parse the Markdown table to a pandas DataFrame.
  4. Validate the DataFrame — reject if it does not look like numeric chart data.
  5. Save the validated CSV alongside the original PNG.

Both the original PNG and the CSV (when valid) are preserved.
The CSV is NOT automatically the source of truth — it is approximate unless
the same value is confirmed in text or a native table.

Previously used PP-Chart2Table (paddleocr's ChartParsing, a 24B-parameter local
vision-language model): on CPU-only hardware it took minutes per figure, which
wasn't viable. A vision LLM call takes well under a second per figure and needs
no local model — see chart-extraction test notes for the comparison.
"""
import base64
import hashlib
import logging
import re
import time
from io import StringIO
from pathlib import Path
from typing import Optional

import pandas as pd

from app.core.config import settings
from app.services.docling_extractor import DoclingFigure
from app.services.food_extractor import _groq_call, _groq_client

logger = logging.getLogger(__name__)


# ─── Validation rules ─────────────────────────────────────────────────────────

# Below this in either dimension, treat as a layout-detection fragment, not a
# figure — see the size check in convert_charts() for why this matters.
_MIN_IMAGE_DIM = 50

# A valid chart CSV must have at least this many data rows (excluding header).
_MIN_ROWS = 2
# A valid chart CSV must have at least this many columns.
_MIN_COLS = 2
# Reject if there are more columns than this (likely a multi-panel confusion).
_MAX_COLS = 20


def _validate_dataframe(df: pd.DataFrame) -> tuple:
    """
    Decide whether a DataFrame produced by PP-Chart2Table is usable.

    Returns (valid: bool, reject_reason: str | None).
    """
    if df is None or df.empty:
        return False, "empty dataframe"
    if len(df) < _MIN_ROWS:
        return False, f"too few rows ({len(df)} < {_MIN_ROWS})"
    if len(df.columns) < _MIN_COLS:
        return False, f"too few columns ({len(df.columns)} < {_MIN_COLS})"
    if len(df.columns) > _MAX_COLS:
        return False, f"too many columns ({len(df.columns)} > {_MAX_COLS}) — likely multi-panel confusion"

    # At least one column must contain numeric values
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

    # Reject if all cells are null/whitespace
    all_null = df.map(lambda v: v is None or (isinstance(v, str) and not v.strip())).all(axis=None)
    if all_null:
        return False, "all cells are null or whitespace"

    return True, None


def _parse_markdown_table(md_table: str) -> Optional[pd.DataFrame]:
    """
    Parse a Markdown pipe table produced by PP-Chart2Table.
    Drops the |---|---| alignment row that causes read_csv confusion.
    Returns None on failure.
    """
    if not md_table or not md_table.strip():
        return None
    try:
        lines = [ln for ln in md_table.splitlines() if ln.strip()]
        # Drop alignment row: a line whose non-pipe content is only dashes/colons/spaces
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
        # Strip whitespace from string columns
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


# ─── Result dataclass ─────────────────────────────────────────────────────────

from dataclasses import dataclass


@dataclass
class ChartResult:
    item_ref: str
    figure_index: int
    image_path: str
    image_hash: Optional[str]
    csv_path: Optional[str]          # None when rejected or on error
    status: str                      # 'valid' | 'rejected' | 'error' | 'skipped'
    reject_reason: Optional[str]
    row_count: int = 0
    col_count: int = 0


# ─── Main conversion entry point ──────────────────────────────────────────────

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
            item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
            image_hash=_image_hash(fig.image_path) if fig.image_path else None,
            csv_path=None, status="skipped", reject_reason=reason,
        )
        for idx, fig in enumerate(figures, start=1)
    ]


def convert_charts(figures: list, cache_dir: str) -> list:
    """
    Ask a vision-capable Groq model (settings.GROQ_VISION_MODEL) to read each
    figure and return its underlying data, if any.

    Parameters
    ----------
    figures  : list[DoclingFigure]   — figures from docling_extractor.extract_pdf()
    cache_dir: str                   — unused; kept for call-site compatibility

    Returns list[ChartResult] — one per figure, with status valid/rejected/error/skipped.
    """
    if not settings.GROQ_API_KEY:
        return _skip_all(figures, "GROQ_API_KEY not set")

    client = _groq_client()
    results: list = []
    called_api = False

    for idx, fig in enumerate(figures, start=1):
        if not fig.image_path or not Path(fig.image_path).exists():
            results.append(ChartResult(
                item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                image_hash=None, csv_path=None, status="error",
                reject_reason="image file missing",
            ))
            continue

        img_hash = _image_hash(fig.image_path)
        img_p = Path(fig.image_path)

        # Docling's layout detector occasionally emits tiny (~20px) fragments —
        # bullet glyphs, icons — misdetected as "picture" elements. These can't
        # contain a readable chart, and sending them to the vision API returns a
        # generic 503 rather than a clean validation error, so filter them here
        # instead of spending a call (and retries) discovering that the hard way.
        try:
            from PIL import Image
            with Image.open(fig.image_path) as im:
                w, h = im.size
            if w < _MIN_IMAGE_DIM or h < _MIN_IMAGE_DIM:
                results.append(ChartResult(
                    item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                    image_hash=img_hash, csv_path=None, status="rejected",
                    reject_reason=f"image too small ({w}x{h}px) to be a readable chart",
                ))
                continue
        except Exception:
            pass  # if PIL can't read it, let the normal flow below try/fail cleanly

        if called_api:
            # Firing figures back-to-back with no gap reliably tripped 429s in
            # testing against this model. A small gap between calls is cheaper
            # than paying for it in retries.
            time.sleep(1.5)

        # Reuse a validated CSV from a prior run (same file, same convention).
        csv_candidate = img_p.parent / f"{img_p.stem}_data.csv"
        if csv_candidate.exists():
            try:
                df = pd.read_csv(str(csv_candidate))
                valid, _ = _validate_dataframe(df)
                if valid:
                    results.append(ChartResult(
                        item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                        image_hash=img_hash, csv_path=str(csv_candidate), status="valid",
                        reject_reason=None, row_count=len(df), col_count=len(df.columns),
                    ))
                    continue
            except Exception:
                pass  # corrupt cached CSV — re-run below

        data_url = _image_to_data_url(fig.image_path)
        if data_url is None:
            results.append(ChartResult(
                item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                image_hash=img_hash, csv_path=None, status="error",
                reject_reason="could not read image file",
            ))
            continue

        logger.info("Reading chart %d/%d with %s: %s",
                     idx, len(figures), settings.GROQ_VISION_MODEL, img_p.name)
        called_api = True
        try:
            user_content = [
                {"type": "text", "text": _CHART_EXTRACTION_PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]
            raw = _groq_call(
                client, settings.GROQ_VISION_MODEL, system=None, user_content=user_content,
                max_tokens=1500, json_mode=False,
            ).strip()

            if raw.upper().startswith("NOT_A_CHART"):
                results.append(ChartResult(
                    item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                    image_hash=img_hash, csv_path=None, status="rejected",
                    reject_reason="model reports this is not a data chart",
                ))
                continue

            df = _parse_markdown_table(raw)
            if df is None:
                results.append(ChartResult(
                    item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                    image_hash=img_hash, csv_path=None, status="rejected",
                    reject_reason="markdown table parse failed",
                ))
                continue

            valid, reason = _validate_dataframe(df)
            if not valid:
                results.append(ChartResult(
                    item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                    image_hash=img_hash, csv_path=None, status="rejected",
                    reject_reason=reason,
                ))
                continue

            csv_path = img_p.parent / f"{img_p.stem}_data.csv"
            df.to_csv(str(csv_path), index=False)
            results.append(ChartResult(
                item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                image_hash=img_hash, csv_path=str(csv_path), status="valid",
                reject_reason=None, row_count=len(df), col_count=len(df.columns),
            ))

        except Exception as exc:
            logger.warning("Chart extraction error for %s: %s", img_p.name, exc)
            results.append(ChartResult(
                item_ref=fig.item_ref, figure_index=idx, image_path=fig.image_path,
                image_hash=img_hash, csv_path=None, status="error",
                reject_reason=str(exc)[:200],
            ))

    valid_count = sum(1 for r in results if r.status == "valid")
    rejected_count = sum(1 for r in results if r.status == "rejected")
    logger.info(
        "Chart extraction: %d valid, %d rejected, %d error/skipped",
        valid_count, rejected_count, len(results) - valid_count - rejected_count,
    )
    return results
