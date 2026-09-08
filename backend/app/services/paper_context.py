"""
Shared Docling-text gathering for LLM-backed paper features (summary card,
ask-this-paper chat). Reads the SAME already-persisted text the deterministic
Rules engine reads (AssetContextLink, via select_assets_for_extraction) —
deliberately not a second PDF-parsing path.
"""
from sqlalchemy.orm import Session

from app.db.models import AssetContextLink
from app.extraction.common.asset_selection import select_assets_for_extraction


def gather_paper_text_spans(paper_id: int, db: Session) -> list[dict]:
    """Unique text passages for a paper as [{text, page_number, item_ref}, ...]."""
    assets = select_assets_for_extraction(paper_id, db)
    seen: dict[str, dict] = {}
    for asset in assets:
        links = db.query(AssetContextLink).filter(AssetContextLink.asset_id == asset.id).all()
        for link in links:
            if link.text and link.text.strip() and link.text not in seen:
                seen[link.text] = {
                    "text": link.text.strip(),
                    "page_number": link.page_number,
                    "item_ref": link.item_ref or asset.docling_item_ref,
                }
    return list(seen.values())
