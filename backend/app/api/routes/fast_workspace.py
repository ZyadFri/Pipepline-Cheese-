"""Fast Docling workspace entry point used for A/B comparison.

The existing /workspace endpoint remains unchanged and therefore keeps the
current/standard Docling behavior. This endpoint launches the exact same
workspace pipeline under a task-local `fast` Docling context, so every step
outside Docling remains identical and the two modes can be compared fairly.
"""
import json
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, project_scope
from app.api.routes.extraction_workspace import _run_workspace_extraction
from app.db.database import SessionLocal, get_db
from app.db.models import Job, Paper, User
from app.services.docling_extractor import reset_analysis_mode, set_analysis_mode

router = APIRouter(tags=["extraction-workspace"])


def _run_fast_workspace(paper_id: int, project_id: int, job_id: int) -> None:
    """Run the existing workspace worker with fast Docling settings only."""
    token = set_analysis_mode("fast")
    started = time.monotonic()
    try:
        _run_workspace_extraction(paper_id, project_id, job_id)
    finally:
        reset_analysis_mode(token)

        # The normal workspace worker writes its final result_json. Merge the
        # mode/timing metadata afterward rather than changing that mature worker.
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                try:
                    result = json.loads(job.result_json or "{}")
                except (TypeError, ValueError, json.JSONDecodeError):
                    result = {}
                result["analysis_mode"] = "fast"
                result["duration_seconds"] = round(time.monotonic() - started, 2)
                job.result_json = json.dumps(result)
                db.commit()
        finally:
            db.close()


@router.post("/projects/{project_id}/papers/{paper_id}/workspace-fast", status_code=202)
def start_fast_workspace(
    project_id: int,
    paper_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Start the same workspace analysis using optimized Docling settings."""
    project_scope(project_id, user, db)
    paper = db.query(Paper).filter(
        Paper.id == paper_id,
        Paper.project_id == project_id,
    ).first()
    if not paper:
        raise HTTPException(404, "Paper not found")

    # Never let standard and fast runs overwrite each other's assets at once.
    running = db.query(Job).filter(
        Job.paper_id == paper_id,
        Job.job_type == "workspace_extraction",
        Job.status.in_(["queued", "running"]),
    ).first()
    if running:
        return {"job_id": running.id, "status": "already_running"}

    job = Job(
        project_id=project_id,
        paper_id=paper_id,
        job_type="workspace_extraction",
        status="queued",
        current_step="Queued · Fast extraction",
        progress=0,
        result_json=json.dumps({"analysis_mode": "fast"}),
        created_by=user.id,
    )
    db.add(job)
    db.flush()
    job_id = job.id
    db.commit()

    background_tasks.add_task(_run_fast_workspace, paper_id, project_id, job_id)
    return {
        "job_id": job_id,
        "status": "queued",
        "analysis_mode": "fast",
        "paper": {"id": paper.id, "filename": paper.original_name},
    }
