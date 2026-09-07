"""Job status polling and management."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import accessible_project_ids, get_current_user, project_scope
from app.db.database import get_db
from app.db.models import Job, User
from app.schemas.canonical import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobOut])
def list_jobs(
    project_id: Optional[int] = Query(None),
    paper_id: Optional[int] = Query(None),
    job_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if project_id:
        project_scope(project_id, current_user, db)
        q = db.query(Job).filter(Job.project_id == project_id)
    else:
        q = db.query(Job).filter(Job.project_id.in_(accessible_project_ids(current_user, db)))
    if paper_id:
        q = q.filter(Job.paper_id == paper_id)
    if job_type:
        q = q.filter(Job.job_type == job_type)
    if status:
        q = q.filter(Job.status == status)
    return q.order_by(Job.created_at.desc()).offset(skip).limit(limit).all()


def _get_job_or_404(job_id: int, user: User, db: Session) -> Job:
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.project_id.in_(accessible_project_ids(user, db)),
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_job_or_404(job_id, current_user, db)


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_or_404(job_id, current_user, db)
    if job.status in ("completed", "failed", "cancelled", "partial_success"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel job with status '{job.status}'")
    job.cancel_requested = True
    if job.status == "queued":
        job.status = "cancelled"
    db.commit()
    db.refresh(job)
    return job
