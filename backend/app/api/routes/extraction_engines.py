"""
extraction_engines.py — Multi-engine extraction API.

Exposes the rule-based extraction engine (app/extraction/rules/engine.py)
alongside the existing LLM flow (app/services/food_extractor.py, reached here
via a thin alias) through one uniform endpoint shape, plus read endpoints for
what each engine produced and for facts that didn't map to a canonical field.

`engine=ml` and `engine=compare` are intentionally rejected with a clear
"not available yet" message rather than silently stubbed — see
docs/extraction_engines.md for what's implemented vs. planned.

Routes:
  POST  /projects/{pid}/papers/{paper_id}/extract?engine=llm|rules   Start extraction
  GET   /projects/{pid}/papers/{paper_id}/extractions                Per-engine summary
  GET   /projects/{pid}/papers/{paper_id}/unmapped-facts              Preserved-but-unmapped facts
"""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.extraction_workspace import _get_paper, _require_project
from app.db.database import SessionLocal, get_db
from app.db.models import ExtExperiment, ExtMeasurement, ExtUnmappedFact, Job, Paper, User
from app.extraction.rules.engine import RuleExtractionEngine
from app.extraction.common.persist import persist_paper_extraction
from app.services.canonical_promoter import promote_ext_paper_to_canonical

logger = logging.getLogger(__name__)
router = APIRouter(tags=["extraction-engines"])

SUPPORTED_ENGINES = {"llm", "rules"}
NOT_YET_AVAILABLE = {"ml": "The ML extraction engine is not implemented yet.",
                      "compare": "Compare mode is not implemented yet — run 'llm' and 'rules' separately."}


def _run_rule_extraction(paper_id: int, project_id: int, job_id: int) -> None:
    """Background task mirroring _run_llm_validation's shape: own session,
    Job status updates, never leaves the job stuck on an unhandled exception."""
    db = SessionLocal()
    try:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        job = db.query(Job).filter(Job.id == job_id).first()
        if not paper or not job:
            return

        job.status = "running"
        job.started_at = datetime.utcnow()
        job.current_step = "Running rule-based extraction"
        job.progress = 20
        db.commit()

        engine = RuleExtractionEngine()
        result = engine.extract_document(paper_id, project_id, db)

        job.progress = 70
        job.current_step = f"Persisting {len(result.experiments)} experiment(s)"
        db.commit()

        persist_counts = persist_paper_extraction(
            result, paper=paper, project_id=project_id, job_id=job_id, engine="rules", db=db,
        )

        try:
            promotion = promote_ext_paper_to_canonical(paper_id, project_id, db, engine="rules")
        except Exception as promo_exc:
            logger.error("Canonical promotion failed for paper %d (rules): %s", paper_id, promo_exc, exc_info=True)
            promotion = {}
            result.warnings.append(f"Extraction succeeded but promotion to the database failed: {promo_exc}")

        job.status = "completed"
        job.progress = 100
        job.current_step = f"Done — {persist_counts['experiments_stored']} experiments, {persist_counts['measurements_stored']} measurements"
        job.completed_at = datetime.utcnow()
        job.result_json = json.dumps({
            "experiments_stored": persist_counts["experiments_stored"],
            "measurements_stored": persist_counts["measurements_stored"],
            "unmapped_facts_stored": persist_counts["unmapped_facts_stored"],
            "reasoning": result.reasoning_summary,
            "warnings": result.warnings,
            "promotion": promotion,
        })
        db.commit()

    except Exception as exc:
        logger.error("Rule extraction failed for paper %d: %s", paper_id, exc, exc_info=True)
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:500]
                job.completed_at = datetime.utcnow()
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/projects/{project_id}/papers/{paper_id}/extract", status_code=202)
def start_extraction(
    project_id: int,
    paper_id: int,
    background_tasks: BackgroundTasks,
    engine: str = Query(..., description="llm|rules"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    if engine in NOT_YET_AVAILABLE:
        raise HTTPException(400, NOT_YET_AVAILABLE[engine])
    if engine not in SUPPORTED_ENGINES:
        raise HTTPException(400, f"Unknown engine '{engine}'. Supported: {sorted(SUPPORTED_ENGINES)}")

    if engine == "llm":
        # Thin alias — same underlying flow as POST .../send-to-llm, exposed
        # here too so the frontend can call one uniform endpoint per engine.
        from app.api.routes.extraction_workspace import send_to_llm
        return send_to_llm(project_id, paper_id, background_tasks, db, user)

    job_type = "rule_extraction"
    running = db.query(Job).filter(
        Job.paper_id == paper_id, Job.job_type == job_type,
        Job.status.in_(["queued", "running"]),
    ).first()
    if running:
        return {"job_id": running.id, "status": "already_running"}

    job = Job(
        project_id=project_id, paper_id=paper_id, job_type=job_type,
        status="queued", current_step="Queued", progress=0, created_by=user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_rule_extraction, paper_id, project_id, job.id)
    return {"job_id": job.id, "status": "queued", "engine": "rules"}


@router.get("/projects/{project_id}/papers/{paper_id}/extractions")
def list_extractions(
    project_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Per-engine summary of what's been run on this paper — the data behind a
    comparison view without needing a separate comparison endpoint yet."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    summaries = []
    for engine in ("llm", "rules"):
        exp_ids = [r.id for r in db.query(ExtExperiment.id).filter(
            ExtExperiment.paper_id == paper_id, ExtExperiment.engine == engine,
        ).all()]
        meas_count = 0
        if exp_ids:
            meas_count = db.query(ExtMeasurement).filter(ExtMeasurement.experiment_id.in_(exp_ids)).count()
        unmapped_count = db.query(ExtUnmappedFact).filter(
            ExtUnmappedFact.paper_id == paper_id, ExtUnmappedFact.engine == engine,
        ).count()
        last_job = db.query(Job).filter(
            Job.paper_id == paper_id,
            Job.job_type == ("llm_validation" if engine == "llm" else "rule_extraction"),
        ).order_by(Job.id.desc()).first()

        summaries.append({
            "engine": engine,
            "experiments": len(exp_ids),
            "measurements": meas_count,
            "unmapped_facts": unmapped_count,
            "last_job": ({
                "id": last_job.id, "status": last_job.status,
                "current_step": last_job.current_step, "completed_at": last_job.completed_at,
            } if last_job else None),
        })

    return {"paper_id": paper_id, "engines": summaries}


@router.get("/projects/{project_id}/papers/{paper_id}/unmapped-facts")
def list_unmapped_facts(
    project_id: int,
    paper_id: int,
    engine: str | None = Query(None, description="Filter by engine (llm|rules|ml)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Scientifically meaningful facts an engine detected but couldn't map to a
    canonical field — preserved with provenance instead of discarded."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    q = db.query(ExtUnmappedFact).filter(ExtUnmappedFact.paper_id == paper_id)
    if engine:
        q = q.filter(ExtUnmappedFact.engine == engine)
    facts = q.order_by(ExtUnmappedFact.id.desc()).all()

    return [
        {
            "id": f.id, "engine": f.engine, "subject": f.subject, "predicate": f.predicate,
            "value_raw": f.value_raw, "value_normalized": f.value_normalized,
            "unit_raw": f.unit_raw, "unit_normalized": f.unit_normalized,
            "category": f.category, "confidence": f.confidence, "confidence_reason": f.confidence_reason,
            "raw_text": f.raw_text, "page_number": f.page_number, "review_status": f.review_status,
        }
        for f in facts
    ]
