import json
import os
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings, UPLOAD_PATH
from app.db.database import get_db
from app.db.models import (
    Experiment, ExtractedRow, ExtractionAsset, Job, Observation, Paper,
    Project, Study, TreatmentArm, User,
)
from app.schemas.papers import PaperOut
from app.services.docling_extractor import cache_dir_for
from app.services.pdf_extractor import extract_full_text

router = APIRouter(prefix="/projects/{project_id}/papers", tags=["papers"])


def _paper_out(paper: Paper, db: Session) -> PaperOut:
    row_count = db.query(ExtractedRow).filter(ExtractedRow.paper_id == paper.id).count()
    return PaperOut(
        id=paper.id,
        project_id=paper.project_id,
        filename=paper.filename,
        original_name=paper.original_name,
        page_count=paper.page_count,
        status=paper.status,
        error_message=paper.error_message,
        uploaded_at=paper.uploaded_at,
        row_count=row_count,
    )


def _get_project(project_id: int, user: User, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id, Project.owner_id == user.id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _get_paper(project_id: int, paper_id: int, db: Session) -> Paper:
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.project_id == project_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    return paper


def _ensure_page_preview(paper: Paper, page_number: int) -> Path:
    """Return a cached PNG preview for one PDF page, rendering it on demand.

    The progressive extraction workspace already writes page images into the
    same Docling cache directory. Reusing that cache means the dashboard can
    show a first-page preview immediately after upload without duplicating work
    once full paper analysis starts.
    """
    if page_number < 1:
        raise HTTPException(404, "Page not found")

    pages_dir = cache_dir_for(paper.file_path) / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    image_path = pages_dir / f"page_{page_number:04d}.png"
    if image_path.exists():
        return image_path

    try:
        import fitz  # PyMuPDF

        doc = fitz.open(paper.file_path)
        try:
            if page_number > len(doc):
                raise HTTPException(404, "Page not found")
            page = doc.load_page(page_number - 1)
            # A dashboard preview does not need the heavier full-resolution
            # workspace render. 1.25x remains crisp enough for the paper card.
            pix = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
            pix.save(str(image_path))
        finally:
            doc.close()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Page preview unavailable: {exc}") from exc

    return image_path


@router.get("", response_model=List[PaperOut])
def list_papers(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _get_project(project_id, user, db)
    papers = db.query(Paper).filter(Paper.project_id == project_id).order_by(Paper.uploaded_at.desc()).all()
    return [_paper_out(p, db) for p in papers]


@router.post("", response_model=List[PaperOut], status_code=201)
async def upload_papers(
    project_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_project(project_id, user, db)

    if len(files) > settings.MAX_PAPERS_PER_UPLOAD:
        raise HTTPException(400, f"Max {settings.MAX_PAPERS_PER_UPLOAD} files per upload")

    project_dir = UPLOAD_PATH / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)

    created = []
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(400, f"{file.filename} is not a PDF")

        uid = uuid.uuid4().hex[:12]
        stored_name = f"{uid}_{file.filename}"
        dest = project_dir / stored_name

        content = await file.read()
        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(413, f"{file.filename} exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit")

        with open(dest, "wb") as f:
            f.write(content)

        # Try to get page count
        page_count = 0
        try:
            _, page_count = extract_full_text(str(dest))
        except Exception:
            pass

        paper = Paper(
            project_id=project_id,
            filename=stored_name,
            original_name=file.filename,
            file_path=str(dest),
            page_count=page_count,
            status="uploaded",
        )
        db.add(paper)
        db.flush()
        created.append(_paper_out(paper, db))

    db.commit()
    return created


@router.get("/pipeline-status")
def papers_pipeline_status(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Per-paper pipeline stage statuses — drives the project dashboard."""
    _get_project(project_id, user, db)
    papers = (
        db.query(Paper)
        .filter(Paper.project_id == project_id)
        .order_by(Paper.uploaded_at.desc())
        .all()
    )

    out = []
    for paper in papers:
        # Latest workspace_extraction job
        ws_job = (
            db.query(Job)
            .filter(Job.paper_id == paper.id, Job.job_type == "workspace_extraction")
            .order_by(Job.created_at.desc())
            .first()
        )
        # Latest llm_validation job
        llm_job = (
            db.query(Job)
            .filter(Job.paper_id == paper.id, Job.job_type == "llm_validation")
            .order_by(Job.created_at.desc())
            .first()
        )

        # Asset counts used directly by the live dashboard. These are real
        # persisted ExtractionAsset rows, never illustrative frontend values.
        asset_q = db.query(ExtractionAsset).filter(ExtractionAsset.paper_id == paper.id)
        n_assets = asset_q.count()
        n_tables = asset_q.filter(ExtractionAsset.asset_type == "native_table").count()
        n_charts = asset_q.filter(ExtractionAsset.classification == "chart").count()

        # Canonical promotion — a Study row is created by either promoter
        # (promote_paper_to_canonical or promote_ext_paper_to_canonical) as soon as
        # anything has been promoted, so its existence alone is a reliable signal
        # regardless of which extraction generation produced this paper's data.
        study = db.query(Study).filter(Study.paper_id == paper.id).first()

        # Canonical observations for this paper — the active pipeline's review
        # signal. Scoped via Observation → TreatmentArm → Experiment → Study.paper_id.
        obs_q = (
            db.query(Observation)
            .join(TreatmentArm, Observation.treatment_arm_id == TreatmentArm.id)
            .join(Experiment, TreatmentArm.experiment_id == Experiment.id)
            .join(Study, Experiment.study_id == Study.id)
            .filter(Study.paper_id == paper.id)
        )
        n_observations = obs_q.count()
        n_obs_approved = obs_q.filter(Observation.review_status == "approved").count()

        # Legacy extracted rows — retained only for papers processed by older
        # pipeline generations so the dashboard remains truthful for existing data.
        n_rows = db.query(ExtractedRow).filter(ExtractedRow.paper_id == paper.id).count()
        n_approved = (
            db.query(ExtractedRow)
            .filter(ExtractedRow.paper_id == paper.id, ExtractedRow.status == "approved")
            .count()
        )

        n_reviewable = n_rows + n_observations
        n_reviewed_approved = n_approved + n_obs_approved

        ws_result = {}
        if ws_job and ws_job.result_json and ws_job.result_json != "{}":
            try:
                ws_result = json.loads(ws_job.result_json)
            except Exception:
                pass

        # ── Stage statuses ──────────────────────────────────────────────────
        if ws_job is None:
            docling = "not_started"
        elif ws_job.status == "completed":
            docling = "completed"
        elif ws_job.status in ("running", "queued"):
            docling = "running"
        else:
            docling = "failed"

        assets = "not_started"
        if docling == "completed":
            assets = "completed"

        charts = "not_started"
        if docling == "completed":
            if ws_result.get("chart_conversion_available") is False:
                charts = "unavailable"
            elif n_charts > 0:
                charts = "completed"
            else:
                charts = "no_charts"

        # validation = ready as soon as docling done; completed when llm job exists
        if docling == "completed" and n_assets > 0 and llm_job is None:
            validation = "ready"
        elif llm_job is not None:
            validation = "completed"
        else:
            validation = "not_started"

        if llm_job is None:
            llm = "not_started"
        elif llm_job.status == "completed":
            llm = "completed"
        elif llm_job.status in ("running", "queued"):
            llm = "running"
        else:
            llm = "failed"

        if n_reviewable == 0:
            review = "not_started"
        elif n_reviewed_approved == n_reviewable:
            review = "completed"
        elif n_reviewed_approved > 0:
            review = "partial"
        else:
            review = "pending"

        promotion = "completed" if study else "not_started"

        # ── Overall badge ───────────────────────────────────────────────────
        if docling == "not_started":
            badge = "uploaded"
        elif docling == "running":
            badge = "processing"
        elif docling == "failed":
            badge = "failed"
        elif llm == "not_started":
            badge = "validation_ready"
        elif llm == "running":
            badge = "extracting"
        elif llm == "failed":
            badge = "failed"
        elif review in ("pending", "partial"):
            badge = "awaiting_review"
        elif review == "completed" and promotion == "not_started":
            badge = "ready_to_promote"
        elif promotion == "completed":
            badge = "completed"
        else:
            badge = "validation_ready"

        # ── Progress percent ────────────────────────────────────────────────
        stage_weights = [
            ("docling",    docling,    20),
            ("assets",     assets,     10),
            ("charts",     charts,     10),
            ("validation", validation, 10),
            ("llm",        llm,        25),
            ("review",     review,     15),
            ("promotion",  promotion,  10),
        ]
        progress_pct = 0
        for _, status, weight in stage_weights:
            if status in ("completed", "unavailable", "no_charts"):
                progress_pct += weight
            elif status in ("running", "partial", "ready", "pending"):
                progress_pct += weight // 2

        out.append({
            "id": paper.id,
            "original_name": paper.original_name,
            "filename": paper.filename,
            "page_count": paper.page_count,
            "uploaded_at": paper.uploaded_at.isoformat() if paper.uploaded_at else None,
            "badge": badge,
            "progress_pct": progress_pct,
            "stages": {
                "docling":    docling,
                "assets":     assets,
                "charts":     charts,
                "validation": validation,
                "llm":        llm,
                "review":     review,
                "promotion":  promotion,
            },
            "counts": {
                "assets":        n_assets,
                "tables":        n_tables,
                "charts":        n_charts,
                "rows":          n_reviewable,
                "approved_rows": n_reviewed_approved,
            },
            "metadata": {
                "title": study.title if study else None,
                "authors": study.authors if study else [],
                "publication_year": study.publication_year if study else None,
                "journal": study.journal if study else None,
                "abstract": study.abstract if study else None,
            },
            "ws_result": ws_result,
            "ws_job_id":  ws_job.id  if ws_job  else None,
            "llm_job_id": llm_job.id if llm_job else None,
        })

    return out


@router.get("/{paper_id}/pages/{page_number}/image")
def get_paper_page_image(
    project_id: int,
    paper_id: int,
    page_number: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Serve an authenticated PDF page preview for dashboard/paper-library UI.

    Page 1 is requested by the project dashboard. The image is rendered once
    and cached in the same directory used by progressive Docling extraction.
    """
    _get_project(project_id, user, db)
    paper = _get_paper(project_id, paper_id, db)
    image_path = _ensure_page_preview(paper, page_number)
    # no-store: Paper.id is a plain SQLite INTEGER PRIMARY KEY (not AUTOINCREMENT),
    # so a deleted paper's id can be reused by a later upload. A cached response
    # here would then serve a previous, unrelated paper's page image for the
    # same URL until the browser's cache entry expired.
    return FileResponse(
        path=str(image_path),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.delete("/{paper_id}", status_code=204)
def delete_paper(
    project_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_project(project_id, user, db)
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.project_id == project_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    if os.path.exists(paper.file_path):
        os.remove(paper.file_path)
    db.delete(paper)
    db.commit()