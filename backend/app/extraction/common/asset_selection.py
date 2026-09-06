"""
Which ExtractionAsset rows are "in scope" for extraction — the same auto-include
heuristic `_run_llm_validation` uses (explicitly selected always included;
decorative always excluded; high-relevance tables/charts auto-included; if
nothing qualifies, fall back to everything non-decorative). Factored out here so
Rules (and later ML) select assets the same way the LLM flow already does,
without duplicating the heuristic a third time.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.db.models import ExtractionAsset

NON_SCIENTIFIC = frozenset({"publisher_logo", "license_icon", "decorative_asset"})
AUTO_SCORE = 3.0
AUTO_TABLE_SCORE = 1.0


def select_assets_for_extraction(paper_id: int, db: Session) -> list[ExtractionAsset]:
    all_assets = db.query(ExtractionAsset).filter(ExtractionAsset.paper_id == paper_id).all()

    selected = []
    for a in all_assets:
        if a.classification in NON_SCIENTIFIC:
            continue
        if a.selected_for_llm:
            selected.append(a)
            continue
        if a.asset_type == "native_table" and a.relevance_score >= AUTO_TABLE_SCORE:
            selected.append(a)
        elif a.classification == "chart" and a.csv_path and Path(a.csv_path).exists():
            selected.append(a)
        elif a.relevance_score >= AUTO_SCORE:
            selected.append(a)

    if not selected:
        selected = [a for a in all_assets if a.classification not in NON_SCIENTIFIC]

    return selected
