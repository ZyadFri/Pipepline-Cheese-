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
        table_row_header=ev.get("table_row_header"),
        table_col_header=ev.get("table_col_header"),
        bbox=ev.get("bbox"),
        confidence=ev.get("confidence", 0.5) or 0.0,
        confidence_reason=ev.get("confidence_reason") or "Reported by the extraction model.",
        value_is_approximate=bool(ev.get("value_is_approximate", False)),
    )


def _pick(d: dict, key: str, *aliases: str):
    if key in d:
        return d.get(key)
    for alias in aliases:
        if alias in d:
            return d.get(alias)
    return None


def llm_dict_to_ir(result: dict, paper_id: int, project_id: int) -> PaperExtractionResult:
    """Convert food_extractor's raw dict into the shared IR.

    Backward compatible with the old narrow schema, while also accepting any of
    the richer optional experiment/treatment/observation fields when an engine
    returns them. Missing keys remain None and are never fabricated.
    """
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
                ingredient_family=ing_dict.get("ingredient_family"),
                application_method=ing_dict.get("application_method"),
                treatment_timing=ing_dict.get("treatment_timing"),
                extra=ing_dict.get("extra") if isinstance(ing_dict.get("extra"), dict) else {},
                provenance=[_evidence_to_provenance(ev) for ev in ing_dict.get("evidence", [])],
            ))

        observations = []
        for meas_dict in exp_dict.get("measurements", []):
            observations.append(ExtractedObservation(
                day=_pick(meas_dict, "day", "time_days"),
                indicator_type=meas_dict.get("indicator_type") or "",
                indicator_unit=meas_dict.get("indicator_unit") or "",
                indicator_value=meas_dict.get("indicator_value"),
                indicator_threshold=meas_dict.get("indicator_threshold"),
                value_is_approximate=bool(meas_dict.get("value_is_approximate", False)),
                microorganism_name=_pick(meas_dict, "microorganism_name", "microorganism"),
                time_value_original=meas_dict.get("time_value_original"),
                time_unit_original=meas_dict.get("time_unit_original"),
                measurement_unit_normalized=meas_dict.get("measurement_unit_normalized"),
                value_original_text=meas_dict.get("value_original_text"),
                mean_value=meas_dict.get("mean_value"),
                standard_deviation=_pick(meas_dict, "standard_deviation", "sd"),
                standard_error=_pick(meas_dict, "standard_error", "se"),
                minimum_value=meas_dict.get("minimum_value"),
                maximum_value=meas_dict.get("maximum_value"),
                replicate_count=_pick(meas_dict, "replicate_count", "n"),
                detection_limit=meas_dict.get("detection_limit"),
                detection_limit_unit=meas_dict.get("detection_limit_unit"),
                censoring_type=meas_dict.get("censoring_type"),
                missing_reason=meas_dict.get("missing_reason"),
                significance_letter=meas_dict.get("significance_letter"),
                value_origin=meas_dict.get("value_origin"),
                extra=meas_dict.get("extra") if isinstance(meas_dict.get("extra"), dict) else {},
                provenance=[_evidence_to_provenance(ev) for ev in meas_dict.get("evidence", [])],
            ))

        experiments.append(ExtractedExperiment(
            cheese_product=cheese_product,
            treatment=treatment,
            food_category=exp_dict.get("food_category"),
            product_family=exp_dict.get("product_family"),
            matrix_description=exp_dict.get("matrix_description"),
            milk_species=exp_dict.get("milk_species"),
            milk_treatment=exp_dict.get("milk_treatment"),
            fat_content_class=exp_dict.get("fat_content_class"),
            sampling_location=exp_dict.get("sampling_location"),
            storage_temperature_value=exp_dict.get("storage_temperature_value"),
            storage_temperature_unit_original=_pick(exp_dict, "storage_temperature_unit_original", "storage_temperature_unit"),
            storage_temperature_c=exp_dict.get("storage_temperature_c"),
            storage_relative_humidity=exp_dict.get("storage_relative_humidity"),
            packaging_type=exp_dict.get("packaging_type"),
            atmosphere_type=exp_dict.get("atmosphere_type"),
            gas_composition=exp_dict.get("gas_composition") if isinstance(exp_dict.get("gas_composition"), dict) else {},
            light_condition=exp_dict.get("light_condition"),
            storage_duration_value=exp_dict.get("storage_duration_value"),
            storage_duration_unit_original=_pick(exp_dict, "storage_duration_unit_original", "storage_duration_unit"),
            storage_duration_days=exp_dict.get("storage_duration_days"),
            study_design=exp_dict.get("study_design"),
            replicate_design=exp_dict.get("replicate_design"),
            artificial_inoculation=exp_dict.get("artificial_inoculation"),
            initial_ph=exp_dict.get("initial_ph"),
            initial_water_activity=exp_dict.get("initial_water_activity"),
            initial_salt_pct=exp_dict.get("initial_salt_pct"),
            initial_moisture_pct=exp_dict.get("initial_moisture_pct"),
            is_control=exp_dict.get("is_control"),
            treatment_type=exp_dict.get("treatment_type"),
            application_method=exp_dict.get("application_method"),
            treatment_timing=exp_dict.get("treatment_timing"),
            extra_conditions=exp_dict.get("extra_conditions") if isinstance(exp_dict.get("extra_conditions"), dict) else {},
            extra_treatment=exp_dict.get("extra_treatment") if isinstance(exp_dict.get("extra_treatment"), dict) else {},
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
