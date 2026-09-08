"""
Bridge rich IR fields through the legacy Ext* staging schema without widening the
staging tables every time the canonical scientific model grows.

Known canonical fields are temporarily serialized as hidden ExtUnmappedFact rows
with category='canonical_bridge'. The canonical promoter consumes them immediately
and marks them promoted. The public unmapped-facts API filters these bridge rows,
so users only see genuinely unmapped science facts.
"""
from __future__ import annotations

import json
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.db.models import ExtUnmappedFact

BRIDGE_CATEGORY = "canonical_bridge"
BRIDGE_PREFIX = "__canonical__"

EXPERIMENT_FIELDS = (
    "food_category",
    "product_family",
    "matrix_description",
    "milk_species",
    "milk_treatment",
    "fat_content_class",
    "sampling_location",
    "storage_temperature_value",
    "storage_temperature_unit_original",
    "storage_temperature_c",
    "storage_relative_humidity",
    "packaging_type",
    "atmosphere_type",
    "gas_composition",
    "light_condition",
    "storage_duration_value",
    "storage_duration_unit_original",
    "storage_duration_days",
    "study_design",
    "replicate_design",
    "artificial_inoculation",
    "initial_ph",
    "initial_water_activity",
    "initial_salt_pct",
    "initial_moisture_pct",
    "extra_conditions",
)

TREATMENT_FIELDS = (
    "is_control",
    "treatment_type",
    "application_method",
    "treatment_timing",
    "extra_treatment",
)

OBSERVATION_FIELDS = (
    "microorganism_name",
    "time_value_original",
    "time_unit_original",
    "measurement_unit_normalized",
    "value_original_text",
    "mean_value",
    "standard_deviation",
    "standard_error",
    "minimum_value",
    "maximum_value",
    "replicate_count",
    "detection_limit",
    "detection_limit_unit",
    "censoring_type",
    "missing_reason",
    "significance_letter",
    "value_origin",
    "extra",
)


def _present(value: Any) -> bool:
    return value is not None and value != "" and value != {} and value != []


def _encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def decode_bridge_value(raw: str | None) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return raw


def experiment_subject(ext_experiment_id: int) -> str:
    return f"{BRIDGE_PREFIX}:experiment:{ext_experiment_id}"


def observation_subject(ext_experiment_id: int, day: int | float, indicator_id: int) -> str:
    return f"{BRIDGE_PREFIX}:observation:{ext_experiment_id}:{float(day):g}:{indicator_id}"


def _field_category(field_name: str) -> str:
    if field_name.startswith("storage_") or field_name in {"packaging_type", "atmosphere_type", "gas_composition", "light_condition"}:
        return "storage"
    if field_name.startswith("initial_") or field_name in {"milk_species", "milk_treatment", "fat_content_class", "product_family", "matrix_description"}:
        return "composition"
    if field_name in {"application_method", "treatment_timing", "treatment_type", "study_design", "replicate_design", "artificial_inoculation"}:
        return "processing"
    return "unknown"


def write_bridge_fields(
    db: Session,
    *,
    project_id: int,
    paper_id: int,
    engine: str,
    subject: str,
    source_obj: Any,
    field_names: Iterable[str],
    provenance=None,
) -> int:
    """Persist non-empty attributes from an IR object as hidden bridge facts."""
    count = 0
    for field_name in field_names:
        value = getattr(source_obj, field_name, None)
        if not _present(value):
            continue
        numeric = None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            numeric = float(value)
        prov = provenance
        raw_text = getattr(prov, "exact_text", None) if prov else None
        db.add(ExtUnmappedFact(
            project_id=project_id,
            paper_id=paper_id,
            engine=engine,
            subject=subject,
            predicate=field_name,
            value_raw=_encode(value),
            value_normalized=numeric,
            unit_raw=None,
            unit_normalized=None,
            category=BRIDGE_CATEGORY,
            confidence=getattr(prov, "confidence", None) if prov else None,
            confidence_reason=(getattr(prov, "confidence_reason", "") if prov else "") or "Structured field carried through staging.",
            raw_text=raw_text,
            context=_field_category(field_name),
            page_number=getattr(prov, "page_number", None) if prov else None,
            docling_item_ref=getattr(prov, "docling_item_ref", None) if prov else None,
            source_type=getattr(prov, "source_type", None) if prov else None,
            review_status="needs_review",
        ))
        count += 1
    return count


def load_bridge_map(db: Session, paper_id: int, engine: str) -> dict[str, dict[str, Any]]:
    rows = db.query(ExtUnmappedFact).filter(
        ExtUnmappedFact.paper_id == paper_id,
        ExtUnmappedFact.engine == engine,
        ExtUnmappedFact.category == BRIDGE_CATEGORY,
    ).all()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not row.subject:
            continue
        out.setdefault(row.subject, {})[row.predicate] = decode_bridge_value(row.value_raw)
    return out


def mark_bridge_promoted(db: Session, paper_id: int, engine: str) -> None:
    db.query(ExtUnmappedFact).filter(
        ExtUnmappedFact.paper_id == paper_id,
        ExtUnmappedFact.engine == engine,
        ExtUnmappedFact.category == BRIDGE_CATEGORY,
    ).update({ExtUnmappedFact.review_status: "promoted"}, synchronize_session=False)


__all__ = [
    "BRIDGE_CATEGORY", "EXPERIMENT_FIELDS", "TREATMENT_FIELDS", "OBSERVATION_FIELDS",
    "experiment_subject", "observation_subject", "write_bridge_fields", "load_bridge_map",
    "mark_bridge_promoted", "decode_bridge_value",
]
