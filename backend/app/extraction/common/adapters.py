"""
Pure functions converting an engine's native output into the shared
PaperExtractionResult IR. No I/O, no database access — safe to unit test in
isolation.
"""
from __future__ import annotations

from app.extraction.common.models import (
    ExtractedExperiment, ExtractedIngredientLink, ExtractedObservation,
    PaperExtractionResult, Provenance,
)


def _evidence_to_provenance(ev: dict) -> Provenance:
    return Provenance(
        source_type=ev.get("source_type", "text"),
        docling_item_ref=ev.get("docling_item_ref"),
        page_number=ev.get("page_number"),
        source_label=ev.get("source_label"),
        exact_text=ev.get("exact_text"),
        confidence=ev.get("confidence", 0.5) or 0.0,
        confidence_reason="Reported by the LLM extraction model.",
        value_is_approximate=bool(ev.get("value_is_approximate", False)),
    )


def llm_dict_to_ir(result: dict, paper_id: int, project_id: int) -> PaperExtractionResult:
    """Convert app.services.food_extractor.extract_food_data()'s raw dict output
    into the shared IR. `result` is unchanged/unvalidated here — food_extractor.py
    already does ref validation, chart-approximate tagging, and pass-2 verification
    before this is called."""
    experiments = []
    for exp_dict in result.get("experiments", []):
        cheese_product = exp_dict.get("cheese_product") or ""
        treatment = exp_dict.get("treatment") or ""

        ingredients = []
        for ing_dict in exp_dict.get("ingredients", []):
            ingredients.append(ExtractedIngredientLink(
                ingredient_name=ing_dict.get("ingredient_name") or "",
                functional_class=ing_dict.get("functional_class", "unknown"),
                source=ing_dict.get("source", ""),
                concentration=ing_dict.get("concentration"),
                concentration_unit=ing_dict.get("concentration_unit"),
                provenance=[_evidence_to_provenance(ev) for ev in ing_dict.get("evidence", [])],
            ))

        observations = []
        for meas_dict in exp_dict.get("measurements", []):
            observations.append(ExtractedObservation(
                day=meas_dict.get("day"),
                indicator_type=meas_dict.get("indicator_type") or "",
                indicator_unit=meas_dict.get("indicator_unit") or "",
                indicator_value=meas_dict.get("indicator_value"),
                indicator_threshold=meas_dict.get("indicator_threshold"),
                value_is_approximate=bool(meas_dict.get("value_is_approximate", False)),
                provenance=[_evidence_to_provenance(ev) for ev in meas_dict.get("evidence", [])],
            ))

        experiments.append(ExtractedExperiment(
            cheese_product=cheese_product,
            treatment=treatment,
            ingredients=ingredients,
            observations=observations,
            provenance=[_evidence_to_provenance(ev) for ev in exp_dict.get("experiment_evidence", [])],
        ))

    return PaperExtractionResult(
        paper_id=paper_id,
        project_id=project_id,
        engine="llm",
        experiments=experiments,
        reasoning_summary=result.get("reasoning_summary", ""),
    )
