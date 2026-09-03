"""
Promote extraction results to the canonical scientific data hierarchy:
  Study → Experiment → TreatmentArm → Observation

Two independent promoters share this module:
  - promote_paper_to_canonical()      — legacy ExtractedRow source (Gen 1/2 pipelines)
  - promote_ext_paper_to_canonical()  — active Ext* staging schema (Gen 3 pipeline)

Both run automatically at the end of their respective extraction job so canonical
pages (Experiments, Dataset, Review) are populated immediately, with no manual
promotion step required. Both are idempotent: they check for existing records
before creating, and never overwrite an Observation a human has already approved.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Experiment, ExtEvidence, ExtExperiment, ExtExperimentIngredient,
    ExtIndicator, ExtIngredient, ExtMeasurement, ExtractedRow, ExtractionAsset,
    Observation, Paper, ProvenanceRecord, Study, TreatmentArm,
)


def _safe_float(val) -> Optional[float]:
    try:
        return float(val) if val not in (None, "", "N/A", "n/a", "NR") else None
    except (ValueError, TypeError):
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
    """Heuristic food-category classifier shared by both promoters."""
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
]


def _infer_measurement_type(indicator_type: Optional[str]) -> str:
    """
    Heuristic measurement-type classifier. Short/ambiguous abbreviations (pH, aw,
    TBA) are matched with word boundaries to avoid false positives inside longer
    words (e.g. "morphology" contains "ph"); ambiguous indicator types fall back
    to "other" rather than guessing.
    """
    if not indicator_type:
        return "other"
    it = indicator_type.lower()
    for keywords, mtype in _MEASUREMENT_TYPE_KEYWORDS:
        for kw in keywords:
            is_regex = "\\" in kw
            if (re.search(kw, it) if is_regex else kw in it):
                return mtype
    return "other"


def _ext_condition_signature(paper_id: int, cheese_product: str, treatment: str) -> str:
    """Deterministic dedup/re-run key for one (paper, cheese_product, treatment)."""
    raw = f"{paper_id}|{(cheese_product or '').strip().lower()}|{(treatment or '').strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _get_or_create_study(paper: Paper, project_id: int, db: Session) -> Study:
    """One Study per paper — idempotent."""
    existing = db.query(Study).filter(Study.paper_id == paper.id).first()
    if existing:
        return existing
    # Derive a readable title from the filename
    raw = paper.original_name.rsplit(".", 1)[0]
    title = raw.replace("_", " ").replace("-", " ").strip() or f"Study from {paper.original_name}"
    study = Study(
        project_id=project_id,
        paper_id=paper.id,
        title=title,
        authors_json="[]",
        notes="Auto-promoted from extracted PDF rows. Review and update metadata.",
        review_status="extracted",
    )
    db.add(study)
    db.flush()
    return study


def _get_or_create_experiment(
    study_id: int,
    product_type: Optional[str],
    temperature_c: Optional[float],
    db: Session,
) -> Experiment:
    """One Experiment per unique (study, product_type, temperature_c) — idempotent."""
    q = db.query(Experiment).filter(Experiment.study_id == study_id)
    if product_type:
        q = q.filter(Experiment.product_name_original == product_type)
    else:
        q = q.filter(Experiment.product_name_original == None)
    if temperature_c is not None:
        q = q.filter(Experiment.storage_temperature_c == temperature_c)
    else:
        q = q.filter(Experiment.storage_temperature_c == None)
    existing = q.first()
    if existing:
        return existing

    exp = Experiment(
        study_id=study_id,
        product_name_original=product_type,
        food_category=_infer_food_category(product_type),
        storage_temperature_c=temperature_c,
        gas_composition_json="{}",
        extra_conditions_json="{}",
        review_status="extracted",
    )
    db.add(exp)
    db.flush()
    return exp


def _get_or_create_arm(
    experiment_id: int,
    ingredient: Optional[str],
    concentration: Optional[float],
    conc_unit: Optional[str],
    db: Session,
) -> TreatmentArm:
    """One TreatmentArm per unique (experiment, ingredient, concentration) — idempotent."""
    q = db.query(TreatmentArm).filter(TreatmentArm.experiment_id == experiment_id)
    if ingredient:
        q = q.filter(TreatmentArm.ingredient_name_original == ingredient)
    else:
        q = q.filter(TreatmentArm.ingredient_name_original == None)
    if concentration is not None:
        q = q.filter(TreatmentArm.concentration_value_original == concentration)
    else:
        q = q.filter(TreatmentArm.concentration_value_original == None)
    existing = q.first()
    if existing:
        return existing

    is_ctrl = (
        not ingredient
        or ingredient.lower() in ("control", "untreated", "none", "water", "vehicle")
    )

    arm = TreatmentArm(
        experiment_id=experiment_id,
        ingredient_name_original=ingredient,
        ingredient_name_normalized=ingredient,
        concentration_value_original=concentration,
        concentration_unit_original=conc_unit,
        is_control=is_ctrl,
        treatment_type="antimicrobial" if ingredient and not is_ctrl else "untreated_control",
        combination_treatments_json="[]",
        extra_treatment_json="{}",
        review_status="extracted",
    )
    db.add(arm)
    db.flush()
    return arm


def promote_paper_to_canonical(paper_id: int, project_id: int, db: Session) -> dict:
    """
    Convert all ExtractedRow records for a paper into canonical entities.
    Returns counts of created records.
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        return {"error": "paper not found"}

    rows = db.query(ExtractedRow).filter(
        ExtractedRow.paper_id == paper_id
    ).all()

    if not rows:
        # Still create a stub Study so the paper appears in Studies page
        study = _get_or_create_study(paper, project_id, db)
        db.commit()
        return {"studies": 1, "experiments": 0, "arms": 0, "observations": 0}

    study = _get_or_create_study(paper, project_id, db)
    created = {"studies": 1, "experiments": 0, "arms": 0, "observations": 0}
    _seen_exps: set[int] = set()
    _seen_arms: set[int] = set()

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
        if experiment.id not in _seen_exps:
            _seen_exps.add(experiment.id)
            created["experiments"] += 1
        if arm.id not in _seen_arms:
            _seen_arms.add(arm.id)
            created["arms"] += 1

        # Initial count observation (time = 0)
        if initial_count is not None:
            db.add(Observation(
                treatment_arm_id=arm.id,
                measurement_type="microbial_count",
                measurement_subtype=microbial_indicator,
                time_value_original=0.0,
                time_unit_original="days",
                time_days=0.0,
                numeric_value_original=initial_count,
                numeric_value_normalized=initial_count,
                unit_original="log CFU/g",
                unit_normalized="log CFU/g",
                value_origin="reported_table",
                review_status="extracted",
                is_imputed=False,
                is_derived=False,
                censoring_type="none",
            ))
            created["observations"] += 1

        # Final count observation (time = treatment_day)
        if final_count is not None and treatment_day is not None:
            db.add(Observation(
                treatment_arm_id=arm.id,
                measurement_type="microbial_count",
                measurement_subtype=microbial_indicator,
                time_value_original=treatment_day,
                time_unit_original="days",
                time_days=treatment_day,
                numeric_value_original=final_count,
                numeric_value_normalized=final_count,
                unit_original="log CFU/g",
                unit_normalized="log CFU/g",
                value_origin="reported_table",
                review_status="extracted",
                is_imputed=False,
                is_derived=False,
                censoring_type="none",
            ))
            created["observations"] += 1

    db.commit()
    return created


def promote_ext_paper_to_canonical(paper_id: int, project_id: int, db: Session) -> dict:
    """
    Convert not-yet-promoted ExtExperiment/ExtMeasurement/ExtEvidence rows for a paper
    (the active Ext* staging schema written by extraction_workspace.py) into canonical
    Study/Experiment/TreatmentArm/Observation/ProvenanceRecord.

    One ExtExperiment maps to exactly one canonical Experiment and one primary
    TreatmentArm — not merged by product+temperature like promote_paper_to_canonical,
    and not split per ingredient — so the canonical Experiment count always matches
    what extraction reported. Ingredients beyond the first fold into the arm's
    combination_treatments_json.

    Idempotent: ExtExperiment.promoted_experiment_id makes Experiment creation
    idempotent across retries; Observations are matched by
    (treatment_arm_id, measurement_type, measurement_subtype, time_days) and an
    Observation with review_status == "approved" is never overwritten.
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        return {"error": "paper not found"}

    ext_experiments = db.query(ExtExperiment).filter(ExtExperiment.paper_id == paper_id).all()

    counts = {
        "experiments_created": 0, "experiments_updated": 0, "arms_created": 0,
        "observations_created": 0, "observations_updated": 0,
        "observations_skipped_approved": 0, "provenance_created": 0,
    }
    if not ext_experiments:
        return counts

    study = _get_or_create_study(paper, project_id, db)

    # Index ExtEvidence for this paper by (entity_type, sorted key items) for exact
    # O(1) lookup — avoids the substring-containment matching the legacy read API
    # used, which could false-match e.g. experiment_id 5 against 51.
    evidence_index: dict[tuple, list[ExtEvidence]] = {}
    for ev in db.query(ExtEvidence).filter(ExtEvidence.paper_id == paper_id).all():
        try:
            key = json.loads(ev.entity_key)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        idx_key = (ev.entity_type, tuple(sorted(key.items())))
        evidence_index.setdefault(idx_key, []).append(ev)

    def _evidence_for(entity_type: str, key: dict) -> list[ExtEvidence]:
        return evidence_index.get((entity_type, tuple(sorted(key.items()))), [])

    assets_by_ref = {
        a.docling_item_ref: a
        for a in db.query(ExtractionAsset).filter(
            ExtractionAsset.paper_id == paper_id,
            ExtractionAsset.docling_item_ref.isnot(None),
        ).all()
    }

    def _make_provenance(entity_type: str, entity_id: int, ev: ExtEvidence,
                          observation_id: Optional[int] = None) -> None:
        asset = assets_by_ref.get(ev.docling_item_ref) if ev.docling_item_ref else None
        db.add(ProvenanceRecord(
            entity_type=entity_type,
            entity_id=entity_id,
            study_id=study.id,
            observation_id=observation_id,
            paper_id=paper_id,
            page_number=ev.page_number,
            source_snippet=ev.exact_text,
            # ExtEvidence: bbox_x1=left,y1=top,x2=right,y2=bottom.
            # ProvenanceRecord: bbox_x0/y0=top-left, bbox_x1/y1=bottom-right.
            # Mapped positionally, not by name — the two schemas' x1 fields mean
            # opposite edges.
            bbox_x0=ev.bbox_x1, bbox_y0=ev.bbox_y1,
            bbox_x1=ev.bbox_x2, bbox_y1=ev.bbox_y2,
            extraction_provider="groq",
            extraction_model=settings.GROQ_FOOD_MODEL,
            prompt_version="food_extractor_v1",
            docling_item_ref=ev.docling_item_ref,
            extraction_asset_id=asset.id if asset else None,
            confidence=ev.confidence,
            evidence_image_path=ev.evidence_image_path,
            evidence_thumbnail_path=ev.evidence_thumbnail_path,
        ))
        counts["provenance_created"] += 1

    for ext_exp in ext_experiments:
        # ── Experiment (1:1 with ExtExperiment) ─────────────────────────────────
        food_category = _infer_food_category(ext_exp.cheese_product)
        signature = _ext_condition_signature(paper_id, ext_exp.cheese_product, ext_exp.treatment)

        # Matched by condition_signature, NOT promoted_experiment_id: ExtExperiment
        # rows are deleted and rebuilt on every re-extraction (fresh ids each time),
        # so promoted_experiment_id on THIS row is never populated across a re-run —
        # condition_signature is the key that survives the staging wipe and lets a
        # re-run update the same canonical Experiment instead of duplicating it.
        # promoted_experiment_id is still set below for same-run retry-after-failure.
        experiment = db.query(Experiment).filter(
            Experiment.study_id == study.id,
            Experiment.condition_signature == signature,
        ).first()

        if experiment:
            experiment.product_name_original = ext_exp.cheese_product
            experiment.product_name_normalized = ext_exp.cheese_product
            experiment.experiment_label = ext_exp.treatment
            experiment.food_category = food_category
            counts["experiments_updated"] += 1
        else:
            experiment = Experiment(
                study_id=study.id,
                experiment_label=ext_exp.treatment,
                food_category=food_category,
                product_name_original=ext_exp.cheese_product,
                product_name_normalized=ext_exp.cheese_product,
                condition_signature=signature,
                gas_composition_json="{}",
                extra_conditions_json="{}",
                review_status="extracted",
            )
            db.add(experiment)
            db.flush()
            counts["experiments_created"] += 1

        ext_exp.promoted_experiment_id = experiment.id
        ext_exp.promoted_at = datetime.utcnow()

        for ev in _evidence_for("experiment", {"experiment_id": ext_exp.id}):
            _make_provenance("experiment", experiment.id, ev)

        # ── Primary treatment arm (one per ExtExperiment — see docstring) ──────────
        ing_links = (
            db.query(ExtIngredient, ExtExperimentIngredient)
            .join(ExtExperimentIngredient, ExtIngredient.id == ExtExperimentIngredient.ingredient_id)
            .filter(ExtExperimentIngredient.experiment_id == ext_exp.id)
            .all()
        )
        primary = ing_links[0] if ing_links else None
        combo = [
            {
                "ingredient_name": ing.ingredient_name,
                "functional_class": ing.functional_class,
                "concentration": junc.concentration,
                "concentration_unit": junc.concentration_unit,
            }
            for ing, junc in ing_links[1:]
        ]

        arm = db.query(TreatmentArm).filter(TreatmentArm.experiment_id == experiment.id).first()
        arm_fields = dict(
            arm_label=ext_exp.treatment,
            is_control=(primary is None),
            treatment_type=("combination" if len(ing_links) > 1
                             else "antimicrobial" if primary else "untreated_control"),
            ingredient_name_original=primary[0].ingredient_name if primary else None,
            ingredient_name_normalized=primary[0].ingredient_name if primary else None,
            ingredient_family=primary[0].functional_class if primary else None,
            ingredient_source=primary[0].source if primary else None,
            concentration_value_original=primary[1].concentration if primary else None,
            concentration_unit_original=primary[1].concentration_unit if primary else None,
            combination_treatments_json=json.dumps(combo),
        )
        if arm:
            for k, v in arm_fields.items():
                setattr(arm, k, v)
        else:
            arm = TreatmentArm(
                experiment_id=experiment.id, extra_treatment_json="{}",
                review_status="extracted", **arm_fields,
            )
            db.add(arm)
            db.flush()
            counts["arms_created"] += 1

        if primary:
            ing_row, _junc_row = primary
            for ev in _evidence_for("ingredient_link",
                                     {"experiment_id": ext_exp.id, "ingredient_id": ing_row.id}):
                _make_provenance("treatment_arm", arm.id, ev)

        # ── Measurements → Observations ─────────────────────────────────────────
        meas_rows = (
            db.query(ExtMeasurement, ExtIndicator)
            .join(ExtIndicator, ExtMeasurement.indicator_id == ExtIndicator.id)
            .filter(ExtMeasurement.experiment_id == ext_exp.id)
            .all()
        )
        for meas, ind in meas_rows:
            mtype = _infer_measurement_type(ind.indicator_type)
            evs = _evidence_for(
                "measurement",
                {"experiment_id": ext_exp.id, "day": meas.day, "indicator_id": ind.id},
            )
            confidences = [e.confidence for e in evs if e.confidence is not None]
            quality_score = min(confidences) if confidences else None
            value_origin = "graph_estimated" if meas.value_is_approximate else "reported_table"

            existing_obs = db.query(Observation).filter(
                Observation.treatment_arm_id == arm.id,
                Observation.measurement_type == mtype,
                Observation.measurement_subtype == ind.indicator_type,
                Observation.time_days == float(meas.day),
            ).first()

            if existing_obs and existing_obs.review_status == "approved":
                counts["observations_skipped_approved"] += 1
                continue

            if existing_obs:
                existing_obs.numeric_value_original = meas.indicator_value
                existing_obs.numeric_value_normalized = meas.indicator_value
                existing_obs.unit_original = ind.indicator_unit
                existing_obs.unit_normalized = ind.indicator_unit
                existing_obs.value_origin = value_origin
                existing_obs.quality_score = quality_score
                existing_obs.version = (existing_obs.version or 1) + 1
                obs = existing_obs
                counts["observations_updated"] += 1
            else:
                obs = Observation(
                    treatment_arm_id=arm.id,
                    measurement_type=mtype,
                    measurement_subtype=ind.indicator_type,
                    time_value_original=float(meas.day),
                    time_unit_original="days",
                    time_days=float(meas.day),
                    numeric_value_original=meas.indicator_value,
                    numeric_value_normalized=meas.indicator_value,
                    unit_original=ind.indicator_unit,
                    unit_normalized=ind.indicator_unit,
                    value_origin=value_origin,
                    quality_score=quality_score,
                    review_status="needs_review",
                    is_imputed=False,
                    is_derived=False,
                    censoring_type="none",
                )
                db.add(obs)
                db.flush()
                counts["observations_created"] += 1

            for ev in evs:
                _make_provenance("observation", obs.id, ev, observation_id=obs.id)

    db.commit()
    return counts
