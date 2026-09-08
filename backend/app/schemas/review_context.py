from __future__ import annotations

from typing import Any, Optional
from pydantic import Field

from app.schemas.canonical import ObservationReviewOut


class RichObservationReviewOut(ObservationReviewOut):
    """Observation plus all optional experiment/treatment context used by the
    scientific database. Every field is optional so paper-specific views can
    simply omit columns that have no values."""
    product_family: Optional[str] = None
    matrix_description: Optional[str] = None
    milk_species: Optional[str] = None
    milk_treatment: Optional[str] = None
    fat_content_class: Optional[str] = None
    sampling_location: Optional[str] = None
    storage_temperature_value: Optional[float] = None
    storage_temperature_unit_original: Optional[str] = None
    storage_relative_humidity: Optional[float] = None
    packaging_type: Optional[str] = None
    atmosphere_type: Optional[str] = None
    gas_composition: dict[str, Any] = Field(default_factory=dict)
    light_condition: Optional[str] = None
    storage_duration_value: Optional[float] = None
    storage_duration_unit_original: Optional[str] = None
    storage_duration_days: Optional[float] = None
    study_design: Optional[str] = None
    replicate_design: Optional[str] = None
    artificial_inoculation: Optional[bool] = None
    initial_ph: Optional[float] = None
    initial_water_activity: Optional[float] = None
    initial_salt_pct: Optional[float] = None
    initial_moisture_pct: Optional[float] = None
    application_method: Optional[str] = None
    treatment_timing: Optional[str] = None
    treatment_type: Optional[str] = None
    microorganism_name: Optional[str] = None
