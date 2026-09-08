"""
Shared intermediate representation (IR) produced by every extraction engine
(LLM, Rules, local ML). None of these classes touch the database — they're pure
data built by an engine and consumed by the shared persistence layer.

The IR intentionally mirrors the useful parts of the canonical scientific model
rather than forcing every paper into a tiny Product/Treatment/Day/Value shape.
Every field below is OPTIONAL unless it is part of the minimum identity of an
object. Engines must leave a field as None/empty when the paper does not report
it — never invent placeholders just to fill the schema. Unknown useful facts are
still preserved as UnmappedFact.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Provenance:
    """Where one extracted value came from."""
    source_type: str                       # text|table|chart|figure|caption|supplementary_material
    docling_item_ref: Optional[str] = None
    page_number: Optional[int] = None
    source_label: Optional[str] = None
    exact_text: Optional[str] = None
    table_row_header: Optional[str] = None
    table_col_header: Optional[str] = None
    bbox: Optional[dict] = None
    confidence: float = 0.5
    confidence_reason: str = ""
    value_is_approximate: bool = False


@dataclass
class ExtractedIngredientLink:
    ingredient_name: str
    functional_class: str = "unknown"
    source: str = ""
    concentration: Optional[float] = None
    concentration_unit: Optional[str] = None
    ingredient_family: Optional[str] = None
    application_method: Optional[str] = None
    treatment_timing: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)
    provenance: list[Provenance] = field(default_factory=list)


@dataclass
class ExtractedObservation:
    # Minimum observation identity/value. Existing engines can keep using these
    # four fields exactly as before; everything else is optional enrichment.
    day: Optional[float] = None
    indicator_type: str = ""
    indicator_unit: str = ""
    indicator_value: Optional[float] = None

    indicator_threshold: Optional[float] = None
    value_is_approximate: bool = False
    microorganism_name: Optional[str] = None

    time_value_original: Optional[float] = None
    time_unit_original: Optional[str] = None
    measurement_unit_normalized: Optional[str] = None
    value_original_text: Optional[str] = None
    mean_value: Optional[float] = None
    standard_deviation: Optional[float] = None
    standard_error: Optional[float] = None
    minimum_value: Optional[float] = None
    maximum_value: Optional[float] = None
    replicate_count: Optional[int] = None
    detection_limit: Optional[float] = None
    detection_limit_unit: Optional[str] = None
    censoring_type: Optional[str] = None
    missing_reason: Optional[str] = None
    significance_letter: Optional[str] = None
    value_origin: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)
    provenance: list[Provenance] = field(default_factory=list)


@dataclass
class ExtractedExperiment:
    # Minimum experiment identity retained for backward compatibility.
    cheese_product: str
    treatment: str

    # Product / matrix description.
    food_category: Optional[str] = None
    product_family: Optional[str] = None
    matrix_description: Optional[str] = None
    milk_species: Optional[str] = None
    milk_treatment: Optional[str] = None
    fat_content_class: Optional[str] = None
    sampling_location: Optional[str] = None

    # Storage and environmental conditions.
    storage_temperature_value: Optional[float] = None
    storage_temperature_unit_original: Optional[str] = None
    storage_temperature_c: Optional[float] = None
    storage_relative_humidity: Optional[float] = None
    packaging_type: Optional[str] = None
    atmosphere_type: Optional[str] = None
    gas_composition: dict[str, float] = field(default_factory=dict)
    light_condition: Optional[str] = None
    storage_duration_value: Optional[float] = None
    storage_duration_unit_original: Optional[str] = None
    storage_duration_days: Optional[float] = None

    # Experimental design / starting composition.
    study_design: Optional[str] = None
    replicate_design: Optional[str] = None
    artificial_inoculation: Optional[bool] = None
    initial_ph: Optional[float] = None
    initial_water_activity: Optional[float] = None
    initial_salt_pct: Optional[float] = None
    initial_moisture_pct: Optional[float] = None

    # Treatment-arm context that belongs to the experiment's primary arm.
    is_control: Optional[bool] = None
    treatment_type: Optional[str] = None
    application_method: Optional[str] = None
    treatment_timing: Optional[str] = None

    # Escape hatches for scientifically useful conditions not anticipated by
    # the canonical schema. They are persisted, never silently discarded.
    extra_conditions: dict[str, Any] = field(default_factory=dict)
    extra_treatment: dict[str, Any] = field(default_factory=dict)

    ingredients: list[ExtractedIngredientLink] = field(default_factory=list)
    observations: list[ExtractedObservation] = field(default_factory=list)
    provenance: list[Provenance] = field(default_factory=list)


@dataclass
class UnmappedFact:
    """Scientifically meaningful fact that cannot yet map to a canonical field."""
    predicate: str
    value_raw: Optional[str] = None
    value_normalized: Optional[float] = None
    unit_raw: Optional[str] = None
    unit_normalized: Optional[str] = None
    subject: Optional[str] = None
    category: str = "unknown"
    raw_text: Optional[str] = None
    context: Optional[str] = None
    confidence: Optional[float] = None
    confidence_reason: str = ""
    provenance: Optional[Provenance] = None


@dataclass
class QualitativeObservation:
    subject: str
    indicator: Optional[str] = None
    direction: Optional[str] = None
    significance: Optional[str] = None
    comparison: Optional[str] = None
    raw_text: str = ""
    provenance: Optional[Provenance] = None


@dataclass
class PaperExtractionResult:
    """Top-level output of any ExtractionEngine.extract_document() call."""
    paper_id: int
    project_id: int
    engine: str
    engine_version: str = "0.2.0"
    experiments: list[ExtractedExperiment] = field(default_factory=list)
    unmapped_facts: list[UnmappedFact] = field(default_factory=list)
    qualitative_observations: list[QualitativeObservation] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    reasoning_summary: str = ""
