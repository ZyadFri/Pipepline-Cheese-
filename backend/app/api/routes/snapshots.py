"""Dataset snapshots + export runs."""

import hashlib
import json
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import accessible_project_ids, get_current_user, project_scope
from app.db.database import get_db
from app.db.models import DatasetSnapshot, ExportRun, User
from app.schemas.canonical import ExportRequest, ExportRunOut, SnapshotCreate, SnapshotOut

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


@router.get("", response_model=list[SnapshotOut])
def list_snapshots(
    project_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if project_id:
        project_scope(project_id, current_user, db)
        q = db.query(DatasetSnapshot).filter(DatasetSnapshot.project_id == project_id)
    else:
        q = db.query(DatasetSnapshot).filter(
            DatasetSnapshot.project_id.in_(accessible_project_ids(current_user, db))
        )
    return q.order_by(DatasetSnapshot.created_at.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=SnapshotOut, status_code=status.HTTP_201_CREATED)
def create_snapshot(
    payload: SnapshotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project_scope(payload.project_id, current_user, db)
    filters_json = json.dumps(payload.filters, sort_keys=True)
    feature_json = json.dumps(payload.feature_config, sort_keys=True)
    snap_hash = hashlib.sha256(
        f"{payload.project_id}:{filters_json}:{feature_json}:{payload.includes_imputed}:{payload.only_approved}"
        .encode()
    ).hexdigest()

    snap = DatasetSnapshot(
        project_id=payload.project_id,
        label=payload.label,
        description=payload.description,
        filters_json=filters_json,
        feature_config_json=feature_json,
        includes_imputed=payload.includes_imputed,
        only_approved=payload.only_approved,
        snapshot_hash=snap_hash,
        created_by=current_user.id,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


@router.get("/{snapshot_id}", response_model=SnapshotOut)
def get_snapshot(
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    snap = db.query(DatasetSnapshot).filter(
        DatasetSnapshot.id == snapshot_id,
        DatasetSnapshot.project_id.in_(accessible_project_ids(current_user, db)),
    ).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap


@router.post("/export", response_model=ExportRunOut, status_code=status.HTTP_202_ACCEPTED)
def create_export(
    payload: ExportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project_scope(payload.project_id, current_user, db)
    if payload.snapshot_id is not None:
        snap = db.query(DatasetSnapshot).filter(
            DatasetSnapshot.id == payload.snapshot_id,
            DatasetSnapshot.project_id == payload.project_id,
        ).first()
        if not snap:
            raise HTTPException(status_code=404, detail="Snapshot not found")
    run = ExportRun(
        project_id=payload.project_id,
        snapshot_id=payload.snapshot_id,
        format=payload.format,
        status="pending",
        filters_json=json.dumps(payload.filters),
        created_by=current_user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    from app.services.exporter import build_export_async
    background_tasks.add_task(build_export_async, run.id)
    return run


def _get_export_run_or_404(run_id: int, user: User, db: Session) -> ExportRun:
    run = db.query(ExportRun).filter(
        ExportRun.id == run_id,
        ExportRun.project_id.in_(accessible_project_ids(user, db)),
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Export run not found")
    return run


@router.get("/exports", response_model=list[ExportRunOut])
def list_export_runs(
    project_id: int = Query(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project_scope(project_id, current_user, db)
    return (
        db.query(ExportRun)
        .filter(ExportRun.project_id == project_id)
        .order_by(ExportRun.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/exports/{run_id}", response_model=ExportRunOut)
def get_export_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_export_run_or_404(run_id, current_user, db)


@router.get("/exports/{run_id}/download")
def download_export(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse
    import os

    run = _get_export_run_or_404(run_id, current_user, db)
    if run.status != "completed":
        raise HTTPException(status_code=400, detail=f"Export not ready (status: {run.status})")
    if not run.file_path or not os.path.exists(run.file_path):
        raise HTTPException(status_code=404, detail="Export file not found on disk")

    media_types = {
        "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv_zip": "application/zip",
        "json": "application/json",
        "parquet": "application/octet-stream",
    }
    return FileResponse(
        run.file_path,
        media_type=media_types.get(run.format, "application/octet-stream"),
        filename=os.path.basename(run.file_path),
    )
