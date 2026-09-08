"""
review_queue.py — joined Observation + product/treatment/study context read API.

Backs the Review and Scientific Database pages. This endpoint intentionally
returns the rich experiment/treatment context as optional fields so each paper
can display only the scientific dimensions that actually exist in that paper.
"""
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, project_scope
from app.db.database import get_db
from app.db.models import (
    Experiment, Observation, Paper, Project, ProvenanceRecord, Study,
    TreatmentArm, User,
)
from app.schemas.canonical import ProvenanceRecordOut
from app.schemas.review_context import RichObservationReviewOut

router = APIRouter(prefix="/projects/{project_id}", tags=["review-queue"])


def _require_project(project_id: int, user: User, db: Session) -> Project:
    return project_scope(project_id, user, db)


@router.get("/observations", response_model=list[RichObservationReviewOut])
def list_observations_with_context(
    project_id: int,
    paper_id: Optional[int] = Query(None),
    review_status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)

    q = (
        db.query(Observation, TreatmentArm, Experiment, Study)
        .join(TreatmentArm, Observation.treatment_arm_id == TreatmentArm.id)
        .join(Experiment, TreatmentArm.experiment_id == Experiment.id)
        .join(Study, Experiment.study_id == Study.id)
        .filter(Study.project_id == project_id)
    )
    if paper_id is not None:
        q = q.filter(Study.paper_id == paper_id)
    if review_status:
        q = q.filter(Observation.review_status == review_status)

    rows = q.order_by(Observation.id.desc()).offset(skip).limit(limit).all()
    if not rows:
        return []

    obs_ids = [o.id for o, _, _, _ in rows]
    paper_ids = {s.paper_id for _, _, _, s in rows}
    papers = {p.id: p for p in db.query(Paper).filter(Paper.id.in_(paper_ids)).all()}

    evidence_by_obs: dict[int, list[ProvenanceRecord]] = {}
    for prov in db.query(ProvenanceRecord).filter(
        ProvenanceRecord.observation_id.in_(obs_ids)
    ).all():
        evidence_by_obs.setdefault(prov.observation_id, []).append(prov)

    out = []
    for obs, arm, exp, study in rows:
        paper = papers.get(study.paper_id)
        evidence = [
            ProvenanceRecordOut(
                id=p.id, entity_type=p.entity_type, entity_id=p.entity_id,
                field_name=p.field_name, paper_id=p.paper_id, page_number=p.page_number,
                section_name=p.section_name, table_number=p.table_number,
                figure_number=p.figure_number, source_snippet=p.source_snippet,
                confidence=p.confidence, manually_verified=p.manually_verified,
                docling_item_ref=p.docling_item_ref, extraction_asset_id=p.extraction_asset_id,
                has_image=bool(p.evidence_image_path), created_at=p.created_at,
            )
            for p in evidence_by_obs.get(obs.id, [])
        ]
        out.append(RichObservationReviewOut(
            **{c.key: getattr(obs, c.key) for c in obs.__table__.columns},
            paper_id=study.paper_id,
            paper_name=paper.original_name if paper else None,
            study_id=study.id,
            study_title=study.title,
            experiment_id=exp.id,
            experiment_label=exp.experiment_label,
            product_name=exp.product_name_original,
            food_category=exp.food_category,
            treatment_label=arm.arm_label,
            is_control=arm.is_control,
            ingredient_name=arm.ingredient_name_original,
            concentration_value=arm.concentration_value_original,
            concentration_unit=arm.concentration_unit_original,
            storage_temperature_c=exp.storage_temperature_c,
            product_family=exp.product_family,
            matrix_description=exp.matrix_description,
            milk_species=exp.milk_species,
            milk_treatment=exp.milk_treatment,
            fat_content_class=exp.fat_content_class,
            sampling_location=exp.sampling_location,
            storage_temperature_value=exp.storage_temperature_value,
            storage_temperature_unit_original=exp.storage_temperature_unit_original,
            storage_relative_humidity=exp.storage_relative_humidity,
            packaging_type=exp.packaging_type,
            atmosphere_type=exp.atmosphere_type,
            gas_composition=exp.gas_composition,
            light_condition=exp.light_condition,
            storage_duration_value=exp.storage_duration_value,
            storage_duration_unit_original=exp.storage_duration_unit_original,
            storage_duration_days=exp.storage_duration_days,
            study_design=exp.study_design,
            replicate_design=exp.replicate_design,
            artificial_inoculation=exp.artificial_inoculation,
            initial_ph=exp.initial_ph,
            initial_water_activity=exp.initial_water_activity,
            initial_salt_pct=exp.initial_salt_pct,
            initial_moisture_pct=exp.initial_moisture_pct,
            application_method=arm.application_method,
            treatment_timing=arm.treatment_timing,
            treatment_type=arm.treatment_type,
            microorganism_name=obs.microorganism.canonical_name if obs.microorganism else None,
            evidence=evidence,
        ))
    return out


def _get_provenance_or_404(project_id: int, provenance_id: int, user: User, db: Session) -> ProvenanceRecord:
    _require_project(project_id, user, db)
    prov = (
        db.query(ProvenanceRecord)
        .join(Study, ProvenanceRecord.study_id == Study.id)
        .filter(ProvenanceRecord.id == provenance_id, Study.project_id == project_id)
        .first()
    )
    if not prov:
        raise HTTPException(404, "Provenance record not found")
    return prov


@router.get("/provenance/{provenance_id}/image")
def get_provenance_image(
    project_id: int, provenance_id: int,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    prov = _get_provenance_or_404(project_id, provenance_id, user, db)
    if not prov.evidence_image_path:
        raise HTTPException(404, "No evidence image for this record")
    p = Path(prov.evidence_image_path)
    if not p.exists():
        raise HTTPException(404, "Evidence image file not found on disk")
    return FileResponse(str(p), media_type="image/png", headers={"Cache-Control": "max-age=3600"})


@router.get("/provenance/{provenance_id}/thumbnail")
def get_provenance_thumbnail(
    project_id: int, provenance_id: int,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    prov = _get_provenance_or_404(project_id, provenance_id, user, db)
    if not prov.evidence_thumbnail_path:
        raise HTTPException(404, "No evidence thumbnail for this record")
    p = Path(prov.evidence_thumbnail_path)
    if not p.exists():
        raise HTTPException(404, "Evidence thumbnail file not found on disk")
    return FileResponse(str(p), media_type="image/png", headers={"Cache-Control": "max-age=3600"})
