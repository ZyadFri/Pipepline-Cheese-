"""
Promote extraction results to the canonical scientific data hierarchy:
  Study → Experiment → TreatmentArm → Observation

The active Ext* staging schema is intentionally narrow. Rich experiment,
treatment and observation fields travel through it as hidden canonical-bridge
facts (see app.extraction.common.canonical_bridge) and are applied here.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Experiment, ExperimentMicroorganism, ExtEvidence, ExtExperiment,
    ExtExperimentIngredient, ExtIndicator, ExtIngredient, ExtMeasurement,
    ExtractedRow, ExtractionAsset, Microorganism, Observation, Paper,
    ProvenanceRecord, Study, TreatmentArm,
)
from app.extraction.common.canonical_bridge import (
    experiment_subject, load_bridge_map, mark_bridge_promoted,
    observation_subject,
)


def _safe_float(val) -> Optional[float]:
    try:
        return float(val) if val not in (None, "", "N/A", "n/a", "NR") else None
    except (ValueError, TypeError):
        return None


def _json_obj(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _json_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _to_celsius(value: Any, unit: Any) -> Optional[float]:
    v = _safe_float(value)
    if v is None:
        return None
    u = str(unit or "°C").strip().lower().replace(" ", "")
    if u in {"°c", "c", "degc", "celsius"}:
        return v
    if u in {"°f", "f", "degf", "fahrenheit"}:
        return (v - 32.0) * 5.0 / 9.0
    if u in {"k", "kelvin"}:
        return v - 273.15
    return None


_FOOD_CATEGORY_KEYWORDS = [
    ("gouda", "cheese"), ("cheddar", "cheese"), ("brie", "cheese"),
    ("mozzarella", "cheese"), ("camembert", "cheese"), ("feta", "cheese"),
    ("parmesan", "cheese"), ("emmental", "cheese"), ("halloumi", "cheese"),
    ("ricotta", "cheese"), ("blue cheese", "cheese"), ("cottage cheese", "cheese"),
    ("cheese", "cheese"), ("meat", "meat"), ("beef", "meat"), ("pork", "meat"),
    ("poultry", "poultry"), ("chicken", "poultry"), ("turkey", "poultry"),
    ("fish", "seafood"), ("seafood", "seafood"), ("shrimp", "seafood"),
    ("milk", "dairy"), ("dairy", "dairy"), ("yogurt", "dairy"),
    ("vegetable", "produce"), ("fruit", "produce"), ("salad", "produce"),
    ("bread", "bakery"), ("bakery", "bakery"),
    ("juice", "beverage"), ("drink", "beverage"),
]


def _infer_food_category(product_type: Optional[str]) -> str:
    if not product_type:
        return "other"
    pt = product_type.lower()
    for keyword, category in _FOOD_CATEGORY_KEYWORDS:
        if keyword in pt:
            return category
    return "other"


_MEASUREMENT_TYPE_KEYWORDS = [
    (("total viable count", "aerobic plate count", "coliform", "listeria",
      "salmonella", "yeast", "mold", "mould", "lactic acid bacteria",
      "psychrotroph", "tvc", "cfu"), "microbial_count"),
    ((r"\bph\b",), "ph"),
    (("water activity", r"\baw\b"), "water_activity"),
    (("moisture",), "moisture"),
    (("tbars", r"\btba\b"), "TBARS"),
    (("tvb-n", "tvb_n", "total volatile basic nitrogen"), "TVB_N"),
    (("texture",), "texture"),
    (("sensory",), "sensory"),
    (("weight loss",), "weight_loss"),
    (("shelf life", "shelf-life"), "shelf_life"),
]


def _infer_measurement_type(indicator_type: Optional[str]) -> str:
    if not indicator_type:
        return "other"
    it = indicator_type.lower()
    for keywords, mtype in _MEASUREMENT_TYPE_KEYWORDS:
        for kw in keywords:
            is_regex = "\\" in kw
            if (re.search(kw, it) if is_regex else kw in it):
                return mtype
    return "other"


def _legacy_condition_signature(paper_id: int, cheese_product: str, treatment: str) -> str:
    raw = f"{paper_id}|{(cheese_product or '').strip().lower()}|{(treatment or '').strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _rich_condition_signature(paper_id: int, cheese_product: str, treatment: str, fields: dict) -> str:
    identifying = {
        k: fields.get(k) for k in (
            "product_family", "milk_species", "milk_treatment", "fat_content_class",
            "sampling_location", "storage_temperature_c", "storage_relative_humidity",
            "packaging_type", "atmosphere_type", "gas_composition", "light_condition",
            "storage_duration_days", "study_design", "artificial_inoculation",
            "application_method", "treatment_timing",
        ) if fields.get(k) not in (None, "", {}, [])
    }
    raw = json.dumps({
        "paper_id": paper_id,
        "product": (cheese_product or "").strip().lower(),
        "treatment": (treatment or "").strip().lower(),
        "conditions": identifying,
    }, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _get_or_create_study(paper: Paper, project_id: int, db: Session) -> Study:
    existing = db.query(Study).filter(Study.paper_id == paper.id).first()
    if existing:
        return existing
    raw = paper.original_name.rsplit(".", 1)[0]
    title = raw.replace("_", " ").replace("-", " ").strip() or f"Study from {paper.original_name}"
    study = Study(
        project_id=project_id, paper_id=paper.id, title=title, authors_json="[]",
        notes="Auto-promoted from extracted PDF data. Review and update metadata.",
        review_status="extracted",
    )
    db.add(study)
    db.flush()
    return study


def _get_or_create_experiment(study_id: int, product_type: Optional[str],
                              temperature_c: Optional[float], db: Session) -> Experiment:
    q = db.query(Experiment).filter(Experiment.study_id == study_id)
    q = q.filter(Experiment.product_name_original == product_type) if product_type else q.filter(Experiment.product_name_original == None)
    q = q.filter(Experiment.storage_temperature_c == temperature_c) if temperature_c is not None else q.filter(Experiment.storage_temperature_c == None)
    existing = q.first()
    if existing:
        return existing
    exp = Experiment(
        study_id=study_id, product_name_original=product_type,
        food_category=_infer_food_category(product_type), storage_temperature_c=temperature_c,
        gas_composition_json="{}", extra_conditions_json="{}", review_status="extracted",
    )
    db.add(exp)
    db.flush()
    return exp


def _get_or_create_arm(experiment_id: int, ingredient: Optional[str], concentration: Optional[float],
                       conc_unit: Optional[str], db: Session) -> TreatmentArm:
    q = db.query(TreatmentArm).filter(TreatmentArm.experiment_id == experiment_id)
    q = q.filter(TreatmentArm.ingredient_name_original == ingredient) if ingredient else q.filter(TreatmentArm.ingredient_name_original == None)
    q = q.filter(TreatmentArm.concentration_value_original == concentration) if concentration is not None else q.filter(TreatmentArm.concentration_value_original == None)
    existing = q.first()
    if existing:
        return existing
    is_ctrl = not ingredient or ingredient.lower() in ("control", "untreated", "none", "water", "vehicle")
    arm = TreatmentArm(
        experiment_id=experiment_id, ingredient_name_original=ingredient,
        ingredient_name_normalized=ingredient, concentration_value_original=concentration,
        concentration_unit_original=conc_unit, is_control=is_ctrl,
        treatment_type="antimicrobial" if ingredient and not is_ctrl else "untreated_control",
        combination_treatments_json="[]", extra_treatment_json="{}", review_status="extracted",
    )
    db.add(arm)
    db.flush()
    return arm


def promote_paper_to_canonical(paper_id: int, project_id: int, db: Session) -> dict:
    """Legacy ExtractedRow promoter, kept for older imports."""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        return {"error": "paper not found"}
    rows = db.query(ExtractedRow).filter(ExtractedRow.paper_id == paper_id).all()
    if not rows:
        _get_or_create_study(paper, project_id, db)
        db.commit()
        return {"studies": 1, "experiments": 0, "arms": 0, "observations": 0}

    study = _get_or_create_study(paper, project_id, db)
    created = {"studies": 1, "experiments": 0, "arms": 0, "observations": 0}
    seen_exps: set[int] = set()
    seen_arms: set[int] = set()
    for row in rows:
        data = row.data
        if not isinstance(data, dict):
            continue
        product_type = data.get("product_type") or None
        temperature_c = _safe_float(data.get("temperature_c"))
        ingredient = data.get("ingredient_name") or None
        concentration = _safe_float(data.get("concentration"))
        conc_unit = data.get("concentration_unit") or None
        microbial_indicator = data.get("microbial_indicator") or None
        initial_count = _safe_float(data.get("initial_count_log_cfu_g"))
        treatment_day = _safe_float(data.get("treatment_day"))
        final_count = _safe_float(data.get("final_count_log_cfu_g"))
        doi = data.get("doi")
        if doi and not study.doi_original:
            study.doi_original = doi

        experiment = _get_or_create_experiment(study.id, product_type, temperature_c, db)
        arm = _get_or_create_arm(experiment.id, ingredient, concentration, conc_unit, db)
        if experiment.id not in seen_exps:
            seen_exps.add(experiment.id); created["experiments"] += 1
        if arm.id not in seen_arms:
            seen_arms.add(arm.id); created["arms"] += 1

        if initial_count is not None:
            db.add(Observation(
                treatment_arm_id=arm.id, measurement_type="microbial_count",
                measurement_subtype=microbial_indicator, time_value_original=0.0,
                time_unit_original="days", time_days=0.0,
                numeric_value_original=initial_count, numeric_value_normalized=initial_count,
                unit_original="log CFU/g", unit_normalized="log CFU/g",
                value_origin="reported_table", review_status="extracted",
                is_imputed=False, is_derived=False, censoring_type="none",
            ))
            created["observations"] += 1
        if final_count is not None and treatment_day is not None:
            db.add(Observation(
                treatment_arm_id=arm.id, measurement_type="microbial_count",
                measurement_subtype=microbial_indicator, time_value_original=treatment_day,
                time_unit_original="days", time_days=treatment_day,
                numeric_value_original=final_count, numeric_value_normalized=final_count,
                unit_original="log CFU/g", unit_normalized="log CFU/g",
                value_origin="reported_table", review_status="extracted",
                is_imputed=False, is_derived=False, censoring_type="none",
            ))
            created["observations"] += 1
    db.commit()
    return created


def _get_or_create_microorganism(name: str, project_id: int, db: Session) -> Optional[Microorganism]:
    raw = (name or "").strip()
    if not raw:
        return None
    existing = db.query(Microorganism).filter(
        Microorganism.project_id == project_id,
        Microorganism.canonical_name == raw,
    ).first()
    if existing:
        return existing
    parts = raw.split()
    genus = parts[0] if parts else raw
    species = parts[1] if len(parts) > 1 and re.match(r"^[a-z]", parts[1]) else None
    m = Microorganism(
        project_id=project_id, genus=genus, species=species,
        original_text=raw, canonical_name=raw, organism_role="unknown",
        synonyms_json="[]", notes="Auto-extracted; taxonomy requires review.",
    )
    db.add(m)
    db.flush()
    return m


def promote_ext_paper_to_canonical(paper_id: int, project_id: int, db: Session,
                                    engine: str = "llm") -> dict:
    """Promote active Ext* staging rows plus all rich optional bridge fields."""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        return {"error": "paper not found"}

    ext_experiments = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper_id, ExtExperiment.engine == engine,
    ).all()
    counts = {
        "experiments_created": 0, "experiments_updated": 0, "arms_created": 0,
        "observations_created": 0, "observations_updated": 0,
        "observations_skipped_approved": 0, "provenance_created": 0,
    }
    if not ext_experiments:
        return counts

    study = _get_or_create_study(paper, project_id, db)
    bridge = load_bridge_map(db, paper_id, engine)

    evidence_index: dict[tuple, list[ExtEvidence]] = {}
    for ev in db.query(ExtEvidence).filter(
        ExtEvidence.paper_id == paper_id, ExtEvidence.engine == engine,
    ).all():
        try:
            key = json.loads(ev.entity_key)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        evidence_index.setdefault((ev.entity_type, tuple(sorted(key.items()))), []).append(ev)

    def _evidence_for(entity_type: str, key: dict) -> list[ExtEvidence]:
        return evidence_index.get((entity_type, tuple(sorted(key.items()))), [])

    assets_by_ref = {
        a.docling_item_ref: a for a in db.query(ExtractionAsset).filter(
            ExtractionAsset.paper_id == paper_id,
            ExtractionAsset.docling_item_ref.isnot(None),
        ).all()
    }

    def _make_provenance(entity_type: str, entity_id: int, ev: ExtEvidence,
                         observation_id: Optional[int] = None, field_name: Optional[str] = None) -> None:
        asset = assets_by_ref.get(ev.docling_item_ref) if ev.docling_item_ref else None
        provider = "local" if engine in {"rules", "gliner", "ml"} else "groq"
        model = engine if provider == "local" else settings.GROQ_FOOD_MODEL
        db.add(ProvenanceRecord(
            entity_type=entity_type, entity_id=entity_id, study_id=study.id,
            observation_id=observation_id, field_name=field_name or ev.field_name,
            paper_id=paper_id, page_number=ev.page_number,
            source_snippet=ev.exact_text,
            bbox_x0=ev.bbox_x1, bbox_y0=ev.bbox_y1,
            bbox_x1=ev.bbox_x2, bbox_y1=ev.bbox_y2,
            extraction_provider=provider, extraction_model=model,
            prompt_version="rich_extraction_v2", docling_item_ref=ev.docling_item_ref,
            extraction_asset_id=asset.id if asset else None, confidence=ev.confidence,
            evidence_image_path=ev.evidence_image_path,
            evidence_thumbnail_path=ev.evidence_thumbnail_path,
        ))
        counts["provenance_created"] += 1

    for ext_exp in ext_experiments:
        b = bridge.get(experiment_subject(ext_exp.id), {})
        if b.get("storage_temperature_c") is None and b.get("storage_temperature_value") is not None:
            c = _to_celsius(b.get("storage_temperature_value"), b.get("storage_temperature_unit_original"))
            if c is not None:
                b["storage_temperature_c"] = c

        if b.get("storage_duration_days") is None and b.get("storage_duration_value") is not None:
            dur = _safe_float(b.get("storage_duration_value"))
            unit = str(b.get("storage_duration_unit_original") or "days").lower()
            if dur is not None:
                if unit.startswith("h"):
                    dur /= 24.0
                elif unit.startswith("week"):
                    dur *= 7.0
                elif unit.startswith("month"):
                    dur *= 30.4375
                b["storage_duration_days"] = dur

        food_category = b.get("food_category") or _infer_food_category(ext_exp.cheese_product)
        signature = _rich_condition_signature(paper_id, ext_exp.cheese_product, ext_exp.treatment, b)
        legacy_signature = _legacy_condition_signature(paper_id, ext_exp.cheese_product, ext_exp.treatment)
        experiment = db.query(Experiment).filter(
            Experiment.study_id == study.id,
            Experiment.condition_signature.in_([signature, legacy_signature]),
        ).first()

        exp_fields = dict(
            experiment_label=ext_exp.treatment,
            food_category=food_category,
            product_name_original=ext_exp.cheese_product,
            product_name_normalized=ext_exp.cheese_product,
            product_family=b.get("product_family"),
            matrix_description=b.get("matrix_description"),
            milk_species=b.get("milk_species"),
            milk_treatment=b.get("milk_treatment"),
            fat_content_class=b.get("fat_content_class"),
            sampling_location=b.get("sampling_location"),
            storage_temperature_value=_safe_float(b.get("storage_temperature_value")),
            storage_temperature_unit_original=b.get("storage_temperature_unit_original"),
            storage_temperature_c=_safe_float(b.get("storage_temperature_c")),
            storage_relative_humidity=_safe_float(b.get("storage_relative_humidity")),
            packaging_type=b.get("packaging_type"),
            atmosphere_type=b.get("atmosphere_type"),
            gas_composition_json=json.dumps(_json_obj(b.get("gas_composition"))),
            light_condition=b.get("light_condition"),
            storage_duration_value=_safe_float(b.get("storage_duration_value")),
            storage_duration_unit_original=b.get("storage_duration_unit_original"),
            storage_duration_days=_safe_float(b.get("storage_duration_days")),
            study_design=b.get("study_design"),
            replicate_design=b.get("replicate_design"),
            artificial_inoculation=b.get("artificial_inoculation"),
            initial_ph=_safe_float(b.get("initial_ph")),
            initial_water_activity=_safe_float(b.get("initial_water_activity")),
            initial_salt_pct=_safe_float(b.get("initial_salt_pct")),
            initial_moisture_pct=_safe_float(b.get("initial_moisture_pct")),
            extra_conditions_json=json.dumps(_json_obj(b.get("extra_conditions"))),
            condition_signature=signature,
        )
        if experiment:
            for k, v in exp_fields.items():
                setattr(experiment, k, v)
            counts["experiments_updated"] += 1
        else:
            experiment = Experiment(review_status="extracted", study_id=study.id, **exp_fields)
            db.add(experiment); db.flush(); counts["experiments_created"] += 1

        ext_exp.promoted_experiment_id = experiment.id
        ext_exp.promoted_at = datetime.utcnow()
        for ev in _evidence_for("experiment", {"experiment_id": ext_exp.id}):
            _make_provenance("experiment", experiment.id, ev)

        ing_links = (
            db.query(ExtIngredient, ExtExperimentIngredient)
            .join(ExtExperimentIngredient, ExtIngredient.id == ExtExperimentIngredient.ingredient_id)
            .filter(ExtExperimentIngredient.experiment_id == ext_exp.id).all()
        )
        primary = ing_links[0] if ing_links else None
        combo = [
            {"ingredient_name": ing.ingredient_name, "functional_class": ing.functional_class,
             "concentration": j.concentration, "concentration_unit": j.concentration_unit}
            for ing, j in ing_links[1:]
        ]
        fallback_control = primary is None or bool(re.search(r"\b(control|untreated|vehicle)\b", ext_exp.treatment, re.IGNORECASE))
        arm_fields = dict(
            arm_label=ext_exp.treatment,
            is_control=b.get("is_control") if isinstance(b.get("is_control"), bool) else fallback_control,
            treatment_type=b.get("treatment_type") or (
                "combination" if len(ing_links) > 1 else "antimicrobial" if primary else "untreated_control"
            ),
            ingredient_name_original=primary[0].ingredient_name if primary else None,
            ingredient_name_normalized=primary[0].ingredient_name if primary else None,
            ingredient_family=primary[0].functional_class if primary else None,
            ingredient_source=primary[0].source if primary else None,
            concentration_value_original=primary[1].concentration if primary else None,
            concentration_unit_original=primary[1].concentration_unit if primary else None,
            application_method=b.get("application_method"),
            treatment_timing=b.get("treatment_timing"),
            combination_treatments_json=json.dumps(combo),
            extra_treatment_json=json.dumps(_json_obj(b.get("extra_treatment"))),
        )
        arm = db.query(TreatmentArm).filter(TreatmentArm.experiment_id == experiment.id).first()
        if arm:
            for k, v in arm_fields.items():
                setattr(arm, k, v)
        else:
            arm = TreatmentArm(experiment_id=experiment.id, review_status="extracted", **arm_fields)
            db.add(arm); db.flush(); counts["arms_created"] += 1

        if primary:
            ing_row, _ = primary
            for ev in _evidence_for("ingredient_link", {"experiment_id": ext_exp.id, "ingredient_id": ing_row.id}):
                _make_provenance("treatment_arm", arm.id, ev)

        meas_rows = (
            db.query(ExtMeasurement, ExtIndicator)
            .join(ExtIndicator, ExtMeasurement.indicator_id == ExtIndicator.id)
            .filter(ExtMeasurement.experiment_id == ext_exp.id).all()
        )
        for meas, ind in meas_rows:
            ob = bridge.get(observation_subject(ext_exp.id, meas.day, ind.id), {})
            mtype = _infer_measurement_type(ind.indicator_type)
            evs = _evidence_for("measurement", {"experiment_id": ext_exp.id, "day": meas.day, "indicator_id": ind.id})
            confidences = [e.confidence for e in evs if e.confidence is not None]
            quality_score = min(confidences) if confidences else None
            value_origin = ob.get("value_origin") or ("graph_estimated" if meas.value_is_approximate else "reported_table")

            microorganism = _get_or_create_microorganism(ob.get("microorganism_name") or "", project_id, db)
            if microorganism:
                link = db.query(ExperimentMicroorganism).filter(
                    ExperimentMicroorganism.experiment_id == experiment.id,
                    ExperimentMicroorganism.microorganism_id == microorganism.id,
                ).first()
                if not link:
                    db.add(ExperimentMicroorganism(
                        experiment_id=experiment.id, microorganism_id=microorganism.id,
                        role_in_study="indicator",
                    ))

            existing_obs = db.query(Observation).filter(
                Observation.treatment_arm_id == arm.id,
                Observation.measurement_type == mtype,
                Observation.measurement_subtype == ind.indicator_type,
                Observation.time_days == float(meas.day),
            ).first()
            if existing_obs and existing_obs.review_status == "approved":
                counts["observations_skipped_approved"] += 1
                continue

            obs_fields = dict(
                microorganism_id=microorganism.id if microorganism else None,
                measurement_type=mtype,
                measurement_subtype=ind.indicator_type,
                measurement_unit_normalized=ob.get("measurement_unit_normalized") or ind.indicator_unit,
                time_value_original=_safe_float(ob.get("time_value_original")) if ob.get("time_value_original") is not None else float(meas.day),
                time_unit_original=ob.get("time_unit_original") or "days",
                time_days=float(meas.day),
                value_original_text=ob.get("value_original_text"),
                numeric_value_original=meas.indicator_value,
                unit_original=ind.indicator_unit,
                numeric_value_normalized=meas.indicator_value,
                unit_normalized=ind.indicator_unit,
                mean_value=_safe_float(ob.get("mean_value")),
                standard_deviation=_safe_float(ob.get("standard_deviation")),
                standard_error=_safe_float(ob.get("standard_error")),
                minimum_value=_safe_float(ob.get("minimum_value")),
                maximum_value=_safe_float(ob.get("maximum_value")),
                replicate_count=int(ob["replicate_count"]) if ob.get("replicate_count") is not None else None,
                detection_limit=_safe_float(ob.get("detection_limit")),
                detection_limit_unit=ob.get("detection_limit_unit"),
                censoring_type=ob.get("censoring_type") or "none",
                missing_reason=ob.get("missing_reason"),
                significance_letter=ob.get("significance_letter"),
                value_origin=value_origin,
                quality_score=quality_score,
                extraction_engine=engine,
                is_imputed=False,
                is_derived=False,
            )
            if existing_obs:
                for k, v in obs_fields.items():
                    setattr(existing_obs, k, v)
                existing_obs.version = (existing_obs.version or 1) + 1
                obs = existing_obs; counts["observations_updated"] += 1
            else:
                obs = Observation(review_status="needs_review", **obs_fields)
                obs.treatment_arm_id = arm.id
                db.add(obs); db.flush(); counts["observations_created"] += 1

            for ev in evs:
                _make_provenance("observation", obs.id, ev, observation_id=obs.id)

    mark_bridge_promoted(db, paper_id, engine)
    db.commit()
    return counts
