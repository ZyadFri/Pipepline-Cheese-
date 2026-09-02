"""Trajectory definitions — groups of observations forming a temporal series."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Observation, TrajectoryDefinition, User
from app.schemas.canonical import TrajectoryCreate, TrajectoryOut

router = APIRouter(prefix="/trajectories", tags=["trajectories"])


def _get_or_404(traj_id: int, db: Session) -> TrajectoryDefinition:
    t = db.query(TrajectoryDefinition).filter(TrajectoryDefinition.id == traj_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Trajectory not found")
    return t


@router.get("", response_model=list[TrajectoryOut])
def list_trajectories(
    project_id: Optional[int] = Query(None),
    experiment_id: Optional[int] = Query(None),
    treatment_arm_id: Optional[int] = Query(None),
    measurement_type: Optional[str] = Query(None),
    process_class: Optional[str] = Query(None),
    data_sufficient: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(TrajectoryDefinition)
    if project_id:
        q = q.filter(TrajectoryDefinition.project_id == project_id)
    if experiment_id:
        q = q.filter(TrajectoryDefinition.experiment_id == experiment_id)
    if treatment_arm_id:
        q = q.filter(TrajectoryDefinition.treatment_arm_id == treatment_arm_id)
    if measurement_type:
        q = q.filter(TrajectoryDefinition.measurement_type == measurement_type)
    if process_class:
        q = q.filter(TrajectoryDefinition.process_class == process_class)
    if data_sufficient is not None:
        q = q.filter(TrajectoryDefinition.data_sufficient == data_sufficient)
    return q.order_by(TrajectoryDefinition.id).offset(skip).limit(limit).all()


@router.post("", response_model=TrajectoryOut, status_code=status.HTTP_201_CREATED)
def create_trajectory(
    payload: TrajectoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate all observation_ids exist
    if payload.observation_ids:
        obs_count = (db.query(Observation)
                       .filter(Observation.id.in_(payload.observation_ids))
                       .count())
        if obs_count != len(payload.observation_ids):
            raise HTTPException(status_code=400, detail="Some observation IDs not found")

    traj = TrajectoryDefinition(
        project_id=payload.project_id,
        experiment_id=payload.experiment_id,
        treatment_arm_id=payload.treatment_arm_id,
        label=payload.label,
        measurement_type=payload.measurement_type,
        measurement_subtype=payload.measurement_subtype,
        microorganism_id=payload.microorganism_id,
        observation_ids_json=json.dumps(payload.observation_ids),
        n_points=len(payload.observation_ids),
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(traj)
    db.commit()
    db.refresh(traj)
    return traj


@router.get("/{traj_id}", response_model=TrajectoryOut)
def get_trajectory(
    traj_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_404(traj_id, db)


@router.delete("/{traj_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trajectory(
    traj_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    traj = _get_or_404(traj_id, db)
    db.delete(traj)
    db.commit()
