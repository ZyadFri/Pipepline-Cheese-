"""Threshold definitions CRUD + shelf-life analysis."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import accessible_project_ids, get_current_user, project_scope
from app.db.database import get_db
from app.db.models import ThresholdDefinition, User
from app.schemas.canonical import ThresholdCreate, ThresholdOut, ThresholdUpdate

router = APIRouter(prefix="/thresholds", tags=["thresholds"])


def _get_or_404(threshold_id: int, user: User, db: Session) -> ThresholdDefinition:
    t = db.query(ThresholdDefinition).filter(
        ThresholdDefinition.id == threshold_id,
        ThresholdDefinition.project_id.in_(accessible_project_ids(user, db)),
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Threshold not found")
    return t


@router.get("", response_model=list[ThresholdOut])
def list_thresholds(
    project_id: Optional[int] = Query(None),
    measurement_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if project_id:
        project_scope(project_id, current_user, db)
        q = db.query(ThresholdDefinition).filter(ThresholdDefinition.project_id == project_id)
    else:
        q = db.query(ThresholdDefinition).filter(
            ThresholdDefinition.project_id.in_(accessible_project_ids(current_user, db))
        )
    if measurement_type:
        q = q.filter(ThresholdDefinition.measurement_type == measurement_type)
    if is_active is not None:
        q = q.filter(ThresholdDefinition.is_active == is_active)
    return q.order_by(ThresholdDefinition.measurement_type, ThresholdDefinition.name).all()


@router.post("", response_model=ThresholdOut, status_code=status.HTTP_201_CREATED)
def create_threshold(
    payload: ThresholdCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project_scope(payload.project_id, current_user, db)
    t = ThresholdDefinition(**payload.model_dump(), created_by=current_user.id)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.get("/{threshold_id}", response_model=ThresholdOut)
def get_threshold(
    threshold_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_404(threshold_id, current_user, db)


@router.patch("/{threshold_id}", response_model=ThresholdOut)
def update_threshold(
    threshold_id: int,
    payload: ThresholdUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = _get_or_404(threshold_id, current_user, db)
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    t.version += 1
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{threshold_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_threshold(
    threshold_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = _get_or_404(threshold_id, current_user, db)
    db.delete(t)
    db.commit()


@router.get("/{threshold_id}/crossings")
def get_threshold_crossings(
    threshold_id: int,
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return which trajectories cross this threshold and at what time."""
    project_scope(project_id, current_user, db)
    t = _get_or_404(threshold_id, current_user, db)
    from app.services.threshold_analysis import compute_crossings
    return compute_crossings(t, project_id, db)
