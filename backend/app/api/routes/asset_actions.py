"""
asset_actions.py — instant, single-asset actions.

Table-first extraction means a user shouldn't have to wait for a whole-paper
LLM run to get value out of one native table: this module exposes a
synchronous "convert this one table to rows" action (reusing the existing
deterministic rule-based table parser — no LLM call, no new engine, no job)
and per-asset CSV/XLSX/JSON export, available the moment Docling has
extracted the asset.

Kept as a separate router rather than growing extraction_workspace.py
further, importing its guard helpers to stay consistent with the existing
convention (extraction_engines.py already does the same).
"""
import io
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.extraction_workspace import _get_paper, _require_project
from app.db.database import get_db
from app.db.models import ExtractionAsset, User
from app.extraction.rules.tables import convert_table_asset

router = APIRouter(tags=["asset-actions"])


def _get_asset_or_404(project_id: int, paper_id: int, asset_id: int, db: Session) -> ExtractionAsset:
    asset = db.query(ExtractionAsset).filter(
        ExtractionAsset.id == asset_id,
        ExtractionAsset.paper_id == paper_id,
        ExtractionAsset.project_id == project_id,
    ).first()
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


def _flatten_rows(experiments, unmapped) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    for exp in experiments:
        for obs in exp.observations:
            prov = obs.provenance[0] if obs.provenance else None
            rows.append({
                "cheese_product": exp.cheese_product,
                "treatment": exp.treatment,
                "day": obs.day,
                "indicator_type": obs.indicator_type,
                "indicator_unit": obs.indicator_unit,
                "indicator_value": obs.indicator_value,
                "value_is_approximate": obs.value_is_approximate,
                "confidence": prov.confidence if prov else None,
                "confidence_reason": prov.confidence_reason if prov else "",
                "table_row_header": prov.table_row_header if prov else None,
                "table_col_header": prov.table_col_header if prov else None,
            })
    unmapped_out = [
        {
            "predicate": u.predicate, "value_raw": u.value_raw,
            "value_normalized": u.value_normalized, "unit_raw": u.unit_raw,
            "unit_normalized": u.unit_normalized, "category": u.category,
            "confidence": u.confidence, "confidence_reason": u.confidence_reason,
        }
        for u in unmapped
    ]
    return rows, unmapped_out


@router.post("/projects/{project_id}/papers/{paper_id}/assets/{asset_id}/extract-rows")
def extract_asset_rows(
    project_id: int,
    paper_id: int,
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Instant, deterministic table -> rows conversion for ONE native table — no
    LLM call, no whole-paper job. Reuses the same rule-based table parser the
    whole-paper Rules engine uses, so results are identical either way.

    Does not persist: persist_paper_extraction() replaces a whole paper's
    engine-scoped rows at once today, so persisting a single asset here would
    wipe the rest of the paper's rule-engine rows. Whole-paper persistence is
    already covered by POST .../extract?engine=rules.
    """
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    asset = _get_asset_or_404(project_id, paper_id, asset_id, db)

    if asset.asset_type != "native_table" or not asset.csv_path:
        raise HTTPException(400, "This asset is not a native table with an extracted CSV")

    experiments, unmapped = convert_table_asset(asset, db)
    rows, unmapped_out = _flatten_rows(experiments, unmapped)

    return {
        "asset_id": asset_id,
        "experiment_count": len(experiments),
        "row_count": len(rows),
        "rows": rows,
        "unmapped": unmapped_out,
    }


@router.get("/projects/{project_id}/papers/{paper_id}/assets/{asset_id}/export")
def export_asset(
    project_id: int,
    paper_id: int,
    asset_id: int,
    format: str = Query("csv", pattern="^(csv|xlsx|json)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Instant per-asset export in CSV, XLSX, or JSON — available as soon as
    Docling has extracted the table, no whole-paper extraction required."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    asset = _get_asset_or_404(project_id, paper_id, asset_id, db)

    if not asset.csv_path:
        raise HTTPException(404, "No table data available for this asset")

    slug = f"p{paper_id}_page{asset.page_number or 0}_asset{asset_id}"

    if format == "csv":
        return FileResponse(asset.csv_path, media_type="text/csv", filename=f"{slug}.csv")

    try:
        df = pd.read_csv(asset.csv_path)
    except Exception:
        raise HTTPException(500, "Could not read table CSV")

    rows: list[dict] = []
    unmapped_out: list[dict] = []
    if asset.asset_type == "native_table":
        experiments, unmapped = convert_table_asset(asset, db)
        rows, unmapped_out = _flatten_rows(experiments, unmapped)

    if format == "json":
        # NaN (blank CSV cells, very common in real tables) is not valid
        # JSON — FastAPI's encoder raises ValueError: Out of range float
        # values are not JSON compliant, 500ing the whole request. Blank
        # cells become null instead of being invented as 0 or dropped.
        # astype(object) first is required: .where() alone on a still-numeric
        # column silently re-coerces None back to NaN (pandas has no "empty"
        # representation in a float64 column), so the substitution is a no-op
        # without it — confirmed live against a real table with a blank cell.
        table = df.astype(object).where(pd.notnull(df), None).to_dict("records")
        return {
            "asset_id": asset_id,
            "table": table,
            "rows": rows,
            "unmapped": unmapped_out,
        }

    # xlsx — raw table + extracted rows (native tables only) as separate sheets
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Table")
        if rows:
            pd.DataFrame(rows).to_excel(writer, index=False, sheet_name="Rows")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{slug}.xlsx"'},
    )
