"""
insights.py — read-only, computed-on-the-fly analysis over the canonical
scientific model: extraction quality score, missing-expected-field
detection, and near-duplicate experiment detection.

Nothing here writes to the database or introduces new stored state — every
endpoint is a pure aggregation/comparison over Study/Experiment/TreatmentArm/
Observation/ProvenanceRecord, computed per request. Kept as its own router
(mirrors asset_actions.py's convention) rather than growing review_queue.py.
"""
import itertools
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, project_scope
from app.db.database import get_db
from app.db.models import (
    Experiment, Observation, Paper, Project, ProvenanceRecord, Study,
    TreatmentArm, User,
)

router = APIRouter(prefix="/projects/{project_id}", tags=["insights"])


def _require_project(project_id: int, user: User, db: Session) -> Project:
    return project_scope(project_id, user, db)


def _round(x: float) -> float:
    return round(x, 3)


# ══════════════════════════════════════════════════════════════════════════
# Extraction quality score — one aggregate number per paper
# ══════════════════════════════════════════════════════════════════════════

@router.get("/papers/{paper_id}/quality-score")
def get_quality_score(
    project_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)

    studies = db.query(Study).filter(
        Study.project_id == project_id, Study.paper_id == paper_id,
    ).all()
    if not studies:
        return {
            "paper_id": paper_id, "has_data": False, "overall_score": 0.0,
            "experiment_count": 0, "observation_count": 0, "breakdown": {},
        }

    study_ids = [s.id for s in studies]
    experiments = db.query(Experiment).filter(Experiment.study_id.in_(study_ids)).all()
    exp_ids = [e.id for e in experiments]
    arms = db.query(TreatmentArm).filter(TreatmentArm.experiment_id.in_(exp_ids)).all() if exp_ids else []
    arm_ids = [a.id for a in arms]
    observations = db.query(Observation).filter(Observation.treatment_arm_id.in_(arm_ids)).all() if arm_ids else []
    obs_ids = [o.id for o in observations]

    if not experiments:
        return {
            "paper_id": paper_id, "has_data": False, "overall_score": 0.0,
            "experiment_count": 0, "observation_count": 0, "breakdown": {},
        }

    # ── Populated-field ratio (Experiment + TreatmentArm key fields) ───────
    exp_fields = ["storage_temperature_c", "storage_duration_days", "packaging_type", "product_name_original"]
    arm_fields = ["ingredient_name_original", "concentration_value_original", "concentration_unit_original"]
    total_slots = len(experiments) * len(exp_fields) + len(arms) * len(arm_fields)
    filled_slots = sum(1 for e in experiments for f in exp_fields if getattr(e, f) is not None)
    filled_slots += sum(1 for a in arms for f in arm_fields if getattr(a, f) is not None)
    populated_field_ratio = filled_slots / total_slots if total_slots else 0.0

    # ── Average observation confidence (Observation.quality_score) ─────────
    scored = [o.quality_score for o in observations if o.quality_score is not None]
    avg_confidence = sum(scored) / len(scored) if scored else 0.0

    # ── Evidence coverage (observations with >=1 ProvenanceRecord) ─────────
    evidence_coverage = 0.0
    if obs_ids:
        with_evidence = {
            pid for (pid,) in db.query(ProvenanceRecord.observation_id)
            .filter(ProvenanceRecord.observation_id.in_(obs_ids)).distinct()
        }
        evidence_coverage = len(with_evidence) / len(obs_ids)

    # ── Review progress (observations approved) ─────────────────────────────
    approved = sum(1 for o in observations if o.review_status == "approved")
    review_progress = approved / len(observations) if observations else 0.0

    weights = {
        "populated_field_ratio": 0.30,
        "avg_confidence": 0.30,
        "evidence_coverage": 0.25,
        "review_progress": 0.15,
    }
    overall = (
        populated_field_ratio * weights["populated_field_ratio"]
        + avg_confidence * weights["avg_confidence"]
        + evidence_coverage * weights["evidence_coverage"]
        + review_progress * weights["review_progress"]
    )

    return {
        "paper_id": paper_id,
        "has_data": True,
        "overall_score": round(overall * 100, 1),
        "experiment_count": len(experiments),
        "treatment_arm_count": len(arms),
        "observation_count": len(observations),
        "breakdown": {
            "populated_field_ratio": _round(populated_field_ratio),
            "avg_confidence": _round(avg_confidence),
            "evidence_coverage": _round(evidence_coverage),
            "review_progress": _round(review_progress),
        },
        "weights": weights,
    }


# ══════════════════════════════════════════════════════════════════════════
# Missing-data detector — expected fields that were never populated
# ══════════════════════════════════════════════════════════════════════════

_EXPERIMENT_CHECKS = [
    ("storage_temperature_c", "Storage temperature"),
    ("storage_duration_days", "Storage duration"),
    ("packaging_type", "Packaging"),
    ("initial_ph", "Initial pH"),
]
_ARM_CHECKS = [
    ("ingredient_name_original", "Treatment/ingredient name"),
    ("concentration_value_original", "Concentration value"),
    ("concentration_unit_original", "Concentration unit"),
]


@router.get("/papers/{paper_id}/missing-fields")
def get_missing_fields(
    project_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)

    studies = db.query(Study).filter(
        Study.project_id == project_id, Study.paper_id == paper_id,
    ).all()
    study_ids = [s.id for s in studies]
    experiments = db.query(Experiment).filter(Experiment.study_id.in_(study_ids)).all() if study_ids else []

    missing: list[dict] = []
    for exp in experiments:
        for field, label in _EXPERIMENT_CHECKS:
            if getattr(exp, field) is None:
                missing.append({
                    "scope": "experiment", "experiment_id": exp.id,
                    "experiment_label": exp.experiment_label or exp.product_name_original,
                    "field": field, "label": label,
                })

        arms = db.query(TreatmentArm).filter(TreatmentArm.experiment_id == exp.id).all()
        if arms and not any(a.is_control for a in arms):
            missing.append({
                "scope": "experiment", "experiment_id": exp.id,
                "experiment_label": exp.experiment_label or exp.product_name_original,
                "field": "control_arm", "label": "Control condition (no arm marked as control)",
            })
        for arm in arms:
            for field, label in _ARM_CHECKS:
                if getattr(arm, field) is None:
                    missing.append({
                        "scope": "treatment_arm", "experiment_id": exp.id,
                        "experiment_label": exp.experiment_label or exp.product_name_original,
                        "arm_id": arm.id, "arm_label": arm.arm_label,
                        "field": field, "label": label,
                    })

    return {
        "paper_id": paper_id,
        "experiments_checked": len(experiments),
        "total_missing": len(missing),
        "missing": missing,
    }


# ══════════════════════════════════════════════════════════════════════════
# Duplicate experiment detection — fuzzy signature match across a project
# ══════════════════════════════════════════════════════════════════════════

_MAX_EXPERIMENTS_SCANNED = 400  # O(n^2) pairwise comparison — plenty for one project's scale


def _experiment_signature(exp: Experiment, arms: list[TreatmentArm]) -> str:
    """
    Real-paper testing (project 43/paper 30) found that relying only on
    product_name + ingredient_name collapses every experiment in a paper to
    the same signature whenever the paper reports one product name overall
    and treatment arms are identified by a short code (C1g, EXo, ...) rather
    than a populated ingredient_name_original — every one of that paper's 21
    experiments came back "100% duplicate" of every other. experiment_label
    and arm_label carry the real distinguishing identity in that case (and
    are always populated, unlike ingredient_name_original), so both are
    folded in as a second signal alongside product/ingredient rather than
    replacing them — a paper that DOES populate ingredient names still
    benefits from matching on those too.
    """
    product = (exp.product_name_normalized or exp.product_name_original or "").strip().lower()
    label = (exp.experiment_label or "").strip().lower()
    ingredients = sorted(
        (a.ingredient_name_normalized or a.ingredient_name_original or a.arm_label or "").strip().lower()
        for a in arms
    )
    temp = f"{exp.storage_temperature_c:g}" if exp.storage_temperature_c is not None else ""
    duration = f"{exp.storage_duration_days:g}" if exp.storage_duration_days is not None else ""
    return f"{product} {label} | {' '.join(ingredients)} | {temp}c | {duration}d"


@router.get("/experiments/duplicates")
def get_duplicate_experiments(
    project_id: int,
    paper_id: Optional[int] = Query(None),
    threshold: float = Query(85.0, ge=50.0, le=100.0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)

    q = db.query(Experiment, Study).join(Study, Experiment.study_id == Study.id).filter(
        Study.project_id == project_id,
    )
    if paper_id is not None:
        q = q.filter(Study.paper_id == paper_id)
    rows = q.limit(_MAX_EXPERIMENTS_SCANNED).all()
    if len(rows) < 2:
        return {"pairs": [], "experiments_scanned": len(rows), "threshold": threshold}

    exp_ids = [e.id for e, _ in rows]
    arms_by_exp: dict[int, list[TreatmentArm]] = {eid: [] for eid in exp_ids}
    for arm in db.query(TreatmentArm).filter(TreatmentArm.experiment_id.in_(exp_ids)).all():
        arms_by_exp[arm.experiment_id].append(arm)

    paper_ids = {s.paper_id for _, s in rows if s.paper_id}
    papers = {p.id: p for p in db.query(Paper).filter(Paper.id.in_(paper_ids)).all()}

    items = [
        (exp, study, _experiment_signature(exp, arms_by_exp[exp.id]))
        for exp, study in rows
    ]

    pairs = []
    for (exp_a, study_a, sig_a), (exp_b, study_b, sig_b) in itertools.combinations(items, 2):
        if not sig_a.strip(" |cd") or not sig_b.strip(" |cd"):
            continue  # nothing meaningful to compare (both fields empty)
        similarity = fuzz.token_sort_ratio(sig_a, sig_b)
        if similarity >= threshold:
            pairs.append({
                "similarity": round(similarity, 1),
                "experiment_a": {
                    "id": exp_a.id, "label": exp_a.experiment_label or exp_a.product_name_original,
                    "product_name": exp_a.product_name_original,
                    "paper_id": study_a.paper_id,
                    "paper_name": papers.get(study_a.paper_id).original_name if papers.get(study_a.paper_id) else None,
                },
                "experiment_b": {
                    "id": exp_b.id, "label": exp_b.experiment_label or exp_b.product_name_original,
                    "product_name": exp_b.product_name_original,
                    "paper_id": study_b.paper_id,
                    "paper_name": papers.get(study_b.paper_id).original_name if papers.get(study_b.paper_id) else None,
                },
            })

    pairs.sort(key=lambda p: p["similarity"], reverse=True)
    return {"pairs": pairs, "experiments_scanned": len(rows), "threshold": threshold}
