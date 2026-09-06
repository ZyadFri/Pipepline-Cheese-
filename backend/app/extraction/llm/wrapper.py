"""
Thin wrapper around the existing app/services/food_extractor.py LLM pipeline,
adapted to the shared ExtractionEngine interface. Used by `compare` mode (P1) to
invoke LLM extraction through the same uniform interface as Rules/ML.

The production single-engine LLM flow (`_run_llm_validation` in
app/api/routes/extraction_workspace.py) does NOT go through this wrapper for its
extraction call — that call is untouched. It DOES reuse `adapters.llm_dict_to_ir`
directly to route its persistence through the same shared
`persist_paper_extraction()` this wrapper's callers also use, so persistence
logic exists exactly once either way.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import ExtractionAsset
from app.extraction.common.adapters import llm_dict_to_ir
from app.extraction.common.asset_selection import select_assets_for_extraction
from app.extraction.common.base import ExtractionEngine
from app.extraction.common.models import PaperExtractionResult
from app.services.food_extractor import extract_food_data


class LLMExtractionEngine(ExtractionEngine):
    name = "llm"
    version = "1.0.0"

    def extract_document(self, paper_id: int, project_id: int, db: Session) -> PaperExtractionResult:
        from app.api.routes.extraction_workspace import _build_packages_from_db_assets

        selected: list[ExtractionAsset] = select_assets_for_extraction(paper_id, db)
        packages, known_refs = _build_packages_from_db_assets(selected, db)

        if not packages:
            return PaperExtractionResult(
                paper_id=paper_id, project_id=project_id, engine="llm",
                reasoning_summary="No relevant evidence found in the selected assets.",
            )

        result = extract_food_data(evidence_packages=packages, known_item_refs=known_refs, enable_verification=True)
        ir = llm_dict_to_ir(result, paper_id, project_id)
        ir.warnings = []
        return ir
