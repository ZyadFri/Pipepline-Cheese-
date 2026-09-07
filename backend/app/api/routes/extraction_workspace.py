"""
extraction_workspace.py — Extraction Workspace API.

Progressive PDF analysis pipeline (Docling → context linking → chart conversion → scoring).
Decoupled from the LLM extraction step so users can review all evidence before extracting
structured data. LLM-extracted results are staged into the Ext* tables and then
automatically promoted into the canonical Study/Experiment/TreatmentArm/Observation
model (see app.services.canonical_promoter.promote_ext_paper_to_canonical) — no manual
promotion step is required for results to reach Review / Scientific Database.

Routes:
  POST   /projects/{pid}/papers/{paper_id}/workspace            Start extraction job
  GET    /projects/{pid}/papers/{paper_id}/workspace/status     Poll job progress
  GET    /projects/{pid}/papers/{paper_id}/assets               List all assets
  GET    /projects/{pid}/papers/{paper_id}/assets/{id}          Asset detail + context links
  GET    /projects/{pid}/papers/{paper_id}/assets/{id}/image    Serve figure PNG
  GET    /projects/{pid}/papers/{paper_id}/assets/{id}/page-image  Serve full page PNG
  GET    /projects/{pid}/papers/{paper_id}/assets/{id}/csv      Download chart CSV
  PATCH  /projects/{pid}/papers/{paper_id}/assets/{id}          Update selection / classification
  GET    /projects/{pid}/papers/{paper_id}/evidence/{id}/image      Serve evidence crop PNG
  GET    /projects/{pid}/papers/{paper_id}/evidence/{id}/thumbnail  Serve evidence thumbnail PNG
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, project_scope
from app.db.database import SessionLocal, get_db
from app.db.models import (
    AssetContextLink, ExtractionAsset, ExtEvidence,
    Job, Paper, Project, User,
)
from app.extraction.common.adapters import llm_dict_to_ir
from app.extraction.common.persist import persist_paper_extraction
from app.services.asset_classifier import _is_decorative, classify_figure, score_relevance
from app.services.canonical_promoter import promote_ext_paper_to_canonical
from app.services.chart_converter import convert_charts
from app.services.context_linker import build_context_links
from app.services.docling_extractor import (
    DoclingResult, cache_dir_for, extract_pdf, extract_pdf_progressive,
)
from app.services.evidence_package import EvidenceItem, EvidencePackage
from app.services.food_extractor import extract_food_data
from app.services.job_events import emit

logger = logging.getLogger(__name__)
router = APIRouter(tags=["extraction-workspace"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _require_project(project_id: int, user: User, db: Session) -> Project:
    return project_scope(project_id, user, db)


def _get_paper(project_id: int, paper_id: int, db: Session) -> Paper:
    paper = db.query(Paper).filter(
        Paper.id == paper_id,
        Paper.project_id == project_id,
    ).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    return paper


def _asset_out(asset: ExtractionAsset) -> dict:
    return {
        "id": asset.id,
        "paper_id": asset.paper_id,
        "project_id": asset.project_id,
        "docling_item_ref": asset.docling_item_ref,
        "asset_type": asset.asset_type,
        "page_number": asset.page_number,
        "bbox": json.loads(asset.bbox_json) if asset.bbox_json else None,
        "section_name": asset.section_name,
        "caption": asset.caption,
        "has_image": bool(asset.image_path and Path(asset.image_path).exists()),
        "has_page_image": bool(asset.page_image_path and Path(asset.page_image_path).exists()),
        "has_csv": bool(asset.csv_path and Path(asset.csv_path).exists()),
        "csv_rows": asset.csv_rows,
        "csv_cols": asset.csv_cols,
        "classification": asset.classification,
        "conversion_status": asset.conversion_status,
        "conversion_error": asset.conversion_error,
        "relevance_score": asset.relevance_score,
        "selected_for_llm": asset.selected_for_llm,
        "user_note": asset.user_note,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


def _count_csv_rows(csv_path: Optional[str]) -> Optional[int]:
    if not csv_path or not Path(csv_path).exists():
        return None
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            return max(0, sum(1 for _ in f) - 1)
    except Exception:
        return None


def _count_csv_cols(csv_path: Optional[str]) -> Optional[int]:
    if not csv_path or not Path(csv_path).exists():
        return None
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            header = f.readline()
            return len(header.split(","))
    except Exception:
        return None


def _generate_page_images(pdf_path: str, pages_dir: Path) -> dict:
    """Render all pages as PNG using PyMuPDF. Returns {page_num: path_str}."""
    result: dict = {}
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)
        zoom = 1.5  # ~108 DPI — readable without being huge
        mat = fitz.Matrix(zoom, zoom)
        for i in range(len(doc)):
            page_num = i + 1
            img_path = pages_dir / f"page_{page_num:04d}.png"
            if not img_path.exists():
                pix = doc.load_page(i).get_pixmap(matrix=mat, alpha=False)
                pix.save(str(img_path))
            result[page_num] = str(img_path)
        doc.close()
    except Exception as exc:
        logger.warning("Page image generation failed: %s", exc)
    return result


def _write_manifest(cache_dir: Path, assets: list) -> None:
    manifest_path = cache_dir / "item_manifest.jsonl"
    try:
        with open(manifest_path, "w", encoding="utf-8") as f:
            for asset in assets:
                entry = {
                    "id": asset.id,
                    "item_ref": asset.docling_item_ref,
                    "type": asset.asset_type,
                    "page_number": asset.page_number,
                    "bbox": json.loads(asset.bbox_json) if asset.bbox_json else None,
                    "section": asset.section_name,
                    "caption": asset.caption,
                    "image_path": asset.image_path,
                    "csv_path": asset.csv_path,
                    "classification": asset.classification,
                    "relevance_score": asset.relevance_score,
                }
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.warning("Manifest write failed: %s", exc)


def _is_cancelled(db: Session, job_id: int) -> bool:
    """The worker holds a long-lived session with the Job row already in its
    identity map, so a plain re-query would return the cached object and a
    cancel request would never be observed. expire_all() forces a fresh read."""
    db.expire_all()
    row = db.query(Job.cancel_requested, Job.status).filter(Job.id == job_id).first()
    return bool(row and (row[0] or row[1] == "cancelled"))


def _apply_chart_result(asset: ExtractionAsset, cr) -> None:
    """Map one chart_converter.ChartResult onto an asset's conversion fields.
    Shared by the main extraction loop and the single-asset retry endpoint so
    the two can't drift apart."""
    if cr.status == "valid":
        asset.conversion_status = "complete"
        asset.csv_path = cr.csv_path
        asset.csv_rows = cr.row_count
        asset.csv_cols = cr.col_count
    elif cr.status == "rejected":
        asset.conversion_status = "not_a_chart"
    elif cr.status == "error":
        asset.conversion_status = "failed"
        asset.conversion_error = cr.reject_reason
    else:
        asset.conversion_status = "skipped"


# ─── Background extraction task ───────────────────────────────────────────────

def _run_workspace_extraction(paper_id: int, project_id: int, job_id: int) -> None:
    """
    Progressive workspace extraction pipeline:
      1. Page images (fast, Docling-independent — gives the Live Gallery
         something to show in the first second)
      2. Docling PDF → texts / tables / figures, streamed as page-range
         chunks so assets are persisted and visible as each chunk completes
         instead of only after the whole document finishes
      3. Deterministic context linking (needs the whole accumulated document)
      4. PP-Chart2Table chart conversion (if available)
      5. Relevance scoring
      6. Write item_manifest.jsonl

    One failed page-range chunk or one failed asset never fails the whole
    job — final status is 'partial_success' with warnings recorded rather
    than a silent success or an all-or-nothing failure. A cancellation
    request is honored between chunks (not mid-conversion, which is one
    blocking call that can't be interrupted).
    """
    db = SessionLocal()
    try:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        job   = db.query(Job).filter(Job.id == job_id).first()
        if not paper or not job:
            return

        warnings: list = []

        def _cancelled() -> bool:
            return _is_cancelled(db, job_id)

        def _finish_cancelled() -> None:
            job.status = "cancelled"
            job.completed_at = datetime.utcnow()
            job.current_step = "Cancelled"
            job.warnings_json = json.dumps(warnings)
            paper.status = "uploaded"
            db.commit()
            emit(db, job_id, "job_cancelled", "Extraction cancelled")

        paper.status  = "extracting"
        job.status    = "running"
        job.started_at = datetime.utcnow()
        job.progress  = 2
        job.current_step = "Starting extraction"
        db.commit()
        emit(db, job_id, "job_started", "Extraction started")

        # ── Step 1: Page images (fast, no Docling dependency) ─────────────────
        cache_dir = cache_dir_for(paper.file_path)
        cache_dir.mkdir(parents=True, exist_ok=True)
        pages_dir = cache_dir / "pages"
        pages_dir.mkdir(exist_ok=True)

        job.progress = 5
        job.current_step = "Rendering page images"
        db.commit()
        page_image_paths = _generate_page_images(paper.file_path, pages_dir)
        emit(db, job_id, "page_images_ready", f"{len(page_image_paths)} page image(s) ready",
             page_count=len(page_image_paths))

        if _cancelled():
            _finish_cancelled()
            return

        # ── Step 2: Delete stale assets, then stream Docling chunks ───────────
        db.query(ExtractionAsset).filter(
            ExtractionAsset.paper_id == paper_id
        ).delete(synchronize_session=False)
        db.commit()

        asset_map: dict = {}          # item_ref → asset_id
        acc_texts: list = []
        acc_tables: list = []
        acc_figures: list = []
        tables_found = 0
        figures_found = 0

        def _persist_asset(kind: str, item) -> None:
            nonlocal tables_found, figures_found
            page_img = page_image_paths.get(item.page_number)
            try:
                if kind == "figure":
                    asset = ExtractionAsset(
                        paper_id=paper_id, project_id=project_id, job_id=job_id,
                        docling_item_ref=item.item_ref, asset_type="figure",
                        page_number=item.page_number,
                        bbox_json=json.dumps(item.bbox) if item.bbox else None,
                        caption=item.caption, image_path=item.image_path or None,
                        page_image_path=page_img, classification="unknown",
                        conversion_status="pending" if item.image_path else "skipped",
                        relevance_score=0.0, selected_for_llm=False,
                    )
                else:
                    asset = ExtractionAsset(
                        paper_id=paper_id, project_id=project_id, job_id=job_id,
                        docling_item_ref=item.item_ref, asset_type="native_table",
                        page_number=item.page_number,
                        bbox_json=json.dumps(item.bbox) if item.bbox else None,
                        caption=item.caption, csv_path=item.csv_path,
                        page_image_path=page_img, classification="native_table",
                        conversion_status="not_applicable",
                        csv_rows=_count_csv_rows(item.csv_path),
                        csv_cols=_count_csv_cols(item.csv_path),
                        relevance_score=0.0, selected_for_llm=False,
                    )
                db.add(asset)
                # Commit per asset (not batched at the end) — this is what makes
                # elements actually appear in the Live Gallery as they're found.
                db.commit()
            except Exception as exc:
                db.rollback()   # required — a failed commit leaves the session
                                 # unusable for every subsequent asset otherwise
                kind_label = "Figure" if kind == "figure" else "Table"
                warnings.append(f"{kind_label} on page {item.page_number} could not be saved: {exc}")
                emit(db, job_id, "asset_failed", str(exc)[:300],
                     asset_type=kind, page_number=item.page_number, item_ref=item.item_ref)
                return
            asset_map[item.item_ref] = asset.id
            if kind == "figure":
                figures_found += 1
            else:
                tables_found += 1
            emit(db, job_id, "asset_added", None, asset_id=asset.id, asset_type=kind,
                 page=item.page_number, caption=item.caption)

        any_chunk_failed = False
        for chunk in extract_pdf_progressive(paper.file_path, cancel_check=_cancelled):
            if _cancelled():
                _finish_cancelled()
                return

            if chunk.status == "failed":
                any_chunk_failed = True
                warnings.append(
                    f"Pages {chunk.page_start}-{chunk.page_end} could not be processed: {chunk.error}"
                )
                emit(db, job_id, "chunk_failed", chunk.error,
                     page_start=chunk.page_start, page_end=chunk.page_end)
                continue

            for fig in chunk.figures:
                _persist_asset("figure", fig)
            for tbl in chunk.tables:
                _persist_asset("table", tbl)

            acc_texts.extend(chunk.texts)
            acc_tables.extend(chunk.tables)
            acc_figures.extend(chunk.figures)

            paper.page_count = chunk.total_pages
            job.total_pages  = chunk.total_pages
            job.pages_done   = chunk.page_end
            job.tables_found = tables_found
            job.figures_found = figures_found
            job.progress = 5 + int(55 * chunk.page_end / max(1, chunk.total_pages))
            job.current_step = (
                f"Parsed pages {chunk.page_start}-{chunk.page_end} of {chunk.total_pages} "
                f"({tables_found} tables, {figures_found} figures so far)"
            )
            db.commit()
            emit(db, job_id, "chunk_done", job.current_step,
                 page_start=chunk.page_start, page_end=chunk.page_end,
                 total_pages=chunk.total_pages,
                 tables_found=tables_found, figures_found=figures_found)

        if any_chunk_failed and not acc_texts and not acc_tables and not acc_figures:
            job.status = "failed"
            job.error_message = "Docling extraction failed for every page range"
            job.warnings_json = json.dumps(warnings)
            job.completed_at = datetime.utcnow()
            paper.status = "failed"
            paper.error_message = job.error_message
            db.commit()
            emit(db, job_id, "job_failed", job.error_message)
            return

        # One accumulated result for context linking, which needs
        # whole-document ordering — unchanged from the pre-chunking
        # behavior, just fed from the accumulated chunks instead of one call.
        docling_result = DoclingResult(
            file_hash="", cache_dir=str(cache_dir), markdown_path=str(cache_dir / "content.md"),
            texts=acc_texts, tables=acc_tables, figures=acc_figures,
            page_count=paper.page_count or 0,
        )

        if _cancelled():
            _finish_cancelled()
            return

        job.progress  = 62
        job.current_step = "Linking context to visual elements"
        db.commit()

        # ── Step 3: Context linking ───────────────────────────────────────────
        for i, fig in enumerate(docling_result.figures):
            aid = asset_map.get(fig.item_ref)
            if not aid:
                continue
            for link_data in build_context_links(
                docling_result, fig.item_ref, "figure",
                fig.page_number, fig.caption, i,
            ):
                db.add(AssetContextLink(asset_id=aid, **link_data))

        for i, tbl in enumerate(docling_result.tables):
            aid = asset_map.get(tbl.item_ref)
            if not aid:
                continue
            for link_data in build_context_links(
                docling_result, tbl.item_ref, "native_table",
                tbl.page_number, tbl.caption, i,
            ):
                db.add(AssetContextLink(asset_id=aid, **link_data))

        db.commit()

        # Skip the LLM call for figures already caption-identifiable as decorative
        # (publisher logos, license icons) — no point spending a vision call on those.
        chart_candidates = [
            fig for fig in docling_result.figures
            if not _is_decorative(fig.caption, fig.page_number, fig.item_ref)
        ]

        job.progress  = 65
        job.current_step = f"Reading {len(chart_candidates)} chart figures"
        db.commit()

        def _classify_and_commit(asset) -> None:
            asset.classification = classify_figure(
                asset.image_path, asset.csv_path, asset.csv_rows, asset.csv_cols,
                asset.caption, asset.conversion_status,
                page_number=asset.page_number, item_ref=asset.docling_item_ref,
            )
            db.commit()

        # ── Step 4: Chart figure -> data table (vision LLM) ────────────────────
        # Decorative figures never go to the API — classify them immediately.
        candidate_refs = {fig.item_ref for fig in chart_candidates}
        for fig in docling_result.figures:
            if fig.item_ref in candidate_refs:
                continue
            aid = asset_map.get(fig.item_ref)
            asset = db.query(ExtractionAsset).filter(ExtractionAsset.id == aid).first() if aid else None
            if not asset:
                continue
            asset.conversion_status = "skipped"
            _classify_and_commit(asset)

        # Consumed as a generator, not a list: each ChartResult is committed to the
        # DB the moment it's produced (one figure ~1.5-5s away, not the whole batch),
        # so the Live Gallery updates per-figure instead of going quiet until the
        # slowest step in the whole pipeline finishes.
        n_read = 0
        for cr in convert_charts(chart_candidates, str(cache_dir)):
            if _cancelled():
                _finish_cancelled()
                return

            aid = asset_map.get(cr.item_ref)
            asset = db.query(ExtractionAsset).filter(ExtractionAsset.id == aid).first() if aid else None
            if not asset:
                continue

            _apply_chart_result(asset, cr)
            if cr.status == "error":
                warnings.append(
                    f"Chart on page {asset.page_number} could not be digitized: {cr.reject_reason}"
                )
                emit(db, job_id, "asset_failed", cr.reject_reason,
                     asset_id=asset.id, asset_type="figure", page_number=asset.page_number)

            _classify_and_commit(asset)

            n_read += 1
            job.progress = 65 + min(20, int(20 * n_read / max(1, len(chart_candidates))))
            job.current_step = f"Read {n_read}/{len(chart_candidates)} chart figures"
            db.commit()
            emit(db, job_id, "chart_read", job.current_step, asset_id=asset.id, status=cr.status)

        job.progress  = 85
        job.current_step = "Scoring scientific relevance"
        db.commit()

        # ── Step 5: Relevance scoring ─────────────────────────────────────────
        all_assets = db.query(ExtractionAsset).filter(
            ExtractionAsset.paper_id == paper_id
        ).all()

        for asset in all_assets:
            ctx_texts = [lnk.text for lnk in asset.context_links[:10]]
            asset.relevance_score = score_relevance(
                asset.caption, asset.section_name, ctx_texts, asset.asset_type,
                classification=asset.classification,
                page_number=asset.page_number,
                item_ref=asset.docling_item_ref,
            )

        db.commit()

        # ── Step 6: Write manifest ────────────────────────────────────────────
        _write_manifest(cache_dir, all_assets)

        n_fig = sum(1 for a in all_assets if a.asset_type == "figure")
        n_tbl = sum(1 for a in all_assets if a.asset_type == "native_table")
        n_chart = sum(1 for a in all_assets if a.classification == "chart")
        n_logos = sum(
            1 for a in all_assets
            if a.classification in ("publisher_logo", "license_icon", "decorative_asset")
        )

        step_summary = (
            f"Docling completed — {n_fig} figures, {n_tbl} tables · "
            f"{n_chart} charts read"
        )
        if n_logos:
            step_summary += f" · {n_logos} decorative/logo assets excluded"
        if warnings:
            step_summary += f" · {len(warnings)} warning(s)"

        paper.status  = "extracted"
        job.status    = "partial_success" if warnings else "completed"
        job.progress  = 100
        job.current_step = step_summary
        job.completed_at = datetime.utcnow()
        job.warnings_json = json.dumps(warnings)
        job.result_json  = json.dumps({
            "figures": n_fig,
            "charts": n_chart,
            "native_tables": n_tbl,
            "texts": len(docling_result.texts),
            "total_assets": len(all_assets),
            "page_count": docling_result.page_count,
            "decorative_excluded": n_logos,
            "warnings": warnings,
        })
        db.commit()
        emit(db, job_id, "job_completed", step_summary, status=job.status, warnings=warnings)

    except Exception as exc:
        logger.error(
            "Workspace extraction failed for paper %d: %s", paper_id, exc, exc_info=True
        )
        try:
            paper = db.query(Paper).filter(Paper.id == paper_id).first()
            job   = db.query(Job).filter(Job.id == job_id).first()
            if paper:
                paper.status = "failed"
                paper.error_message = str(exc)
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:500]
            db.commit()
            if job:
                emit(db, job_id, "job_failed", str(exc)[:300])
        except Exception:
            pass
    finally:
        db.close()


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/papers/{paper_id}/workspace", status_code=202)
def start_workspace(
    project_id: int,
    paper_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Start (or restart) the workspace extraction for one paper."""
    _require_project(project_id, user, db)
    paper = _get_paper(project_id, paper_id, db)

    # If already running, return the existing job
    running = db.query(Job).filter(
        Job.paper_id == paper_id,
        Job.job_type == "workspace_extraction",
        Job.status.in_(["queued", "running"]),
    ).first()
    if running:
        return {"job_id": running.id, "status": "already_running"}

    job = Job(
        project_id   = project_id,
        paper_id     = paper_id,
        job_type     = "workspace_extraction",
        status       = "queued",
        current_step = "Queued",
        progress     = 0,
        created_by   = user.id,
    )
    db.add(job)
    db.flush()
    job_id = job.id
    db.commit()

    background_tasks.add_task(_run_workspace_extraction, paper_id, project_id, job_id)
    return {"job_id": job_id, "status": "queued", "paper": {"id": paper.id, "filename": paper.original_name}}


@router.get("/projects/{project_id}/papers/{paper_id}/workspace/status")
def workspace_status(
    project_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Poll extraction job status for one paper."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    job = (
        db.query(Job)
        .filter(Job.paper_id == paper_id, Job.job_type == "workspace_extraction")
        .order_by(Job.id.desc())
        .first()
    )

    asset_count = db.query(ExtractionAsset).filter(
        ExtractionAsset.paper_id == paper_id
    ).count()

    if not job:
        return {
            "status": "not_started",
            "progress": 0,
            "current_step": "",
            "asset_count": asset_count,
            "job_id": None,
        }

    return {
        "status": job.status,
        "progress": job.progress or 0,
        "current_step": job.current_step or "",
        "asset_count": asset_count,
        "job_id": job.id,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "error": job.error_message or None,
        "result": json.loads(job.result_json) if job.result_json and job.result_json != "{}" else None,
        "total_pages": job.total_pages or 0,
        "pages_done": job.pages_done or 0,
        "tables_found": job.tables_found or 0,
        "figures_found": job.figures_found or 0,
        "warnings": job.warnings,
        "cancel_requested": bool(job.cancel_requested),
    }


@router.get("/projects/{project_id}/papers/{paper_id}/assets")
def list_assets(
    project_id: int,
    paper_id: int,
    asset_type: Optional[str] = None,
    classification: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all extraction assets for a paper, optionally filtered by type."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    q = db.query(ExtractionAsset).filter(ExtractionAsset.paper_id == paper_id)
    if asset_type:
        q = q.filter(ExtractionAsset.asset_type == asset_type)
    if classification:
        q = q.filter(ExtractionAsset.classification == classification)

    total = q.count()
    assets = (
        q.order_by(ExtractionAsset.page_number, ExtractionAsset.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"total": total, "items": [_asset_out(a) for a in assets]}


@router.get("/projects/{project_id}/papers/{paper_id}/assets/{asset_id}")
def get_asset(
    project_id: int,
    paper_id: int,
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return a single asset with all context links."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    asset = db.query(ExtractionAsset).filter(
        ExtractionAsset.id == asset_id,
        ExtractionAsset.paper_id == paper_id,
    ).first()
    if not asset:
        raise HTTPException(404, "Asset not found")

    return {
        **_asset_out(asset),
        "context_links": [
            {
                "link_type": lnk.link_type,
                "text": lnk.text,
                "item_ref": lnk.item_ref,
                "page_number": lnk.page_number,
                "score": lnk.score,
            }
            for lnk in sorted(asset.context_links, key=lambda l: -l.score)
        ],
    }


@router.get("/projects/{project_id}/assets")
def list_project_assets(
    project_id: int,
    asset_type: Optional[str] = None,
    classification: Optional[str] = None,
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all extraction assets across all papers in a project."""
    _require_project(project_id, user, db)
    q = db.query(ExtractionAsset).filter(ExtractionAsset.project_id == project_id)
    if asset_type:
        q = q.filter(ExtractionAsset.asset_type == asset_type)
    if classification:
        q = q.filter(ExtractionAsset.classification == classification)

    total = q.count()
    assets = (
        q.order_by(ExtractionAsset.paper_id, ExtractionAsset.page_number, ExtractionAsset.id)
        .offset(skip)
        .limit(limit)
        .all()
    )

    paper_ids = list({a.paper_id for a in assets})
    papers = {p.id: p for p in db.query(Paper).filter(Paper.id.in_(paper_ids)).all()} if paper_ids else {}

    def _out(a: ExtractionAsset) -> dict:
        paper = papers.get(a.paper_id)
        return {**_asset_out(a), "paper_name": paper.original_name if paper else None}

    return {"total": total, "items": [_out(a) for a in assets]}


@router.get("/projects/{project_id}/papers/{paper_id}/assets/{asset_id}/image")
def get_asset_image(
    project_id: int,
    paper_id: int,
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    asset = db.query(ExtractionAsset).filter(
        ExtractionAsset.id == asset_id,
        ExtractionAsset.paper_id == paper_id,
        ExtractionAsset.project_id == project_id,
    ).first()
    if not asset or not asset.image_path:
        raise HTTPException(404, "Image not found")
    p = Path(asset.image_path)
    if not p.exists():
        raise HTTPException(404, "Image file missing from disk")
    return FileResponse(str(p), media_type="image/png",
                        headers={"Cache-Control": "max-age=3600"})


@router.get("/projects/{project_id}/papers/{paper_id}/assets/{asset_id}/page-image")
def get_page_image(
    project_id: int,
    paper_id: int,
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    asset = db.query(ExtractionAsset).filter(
        ExtractionAsset.id == asset_id,
        ExtractionAsset.paper_id == paper_id,
        ExtractionAsset.project_id == project_id,
    ).first()
    if not asset or not asset.page_image_path:
        raise HTTPException(404, "Page image not found")
    p = Path(asset.page_image_path)
    if not p.exists():
        raise HTTPException(404, "Page image file missing from disk")
    return FileResponse(str(p), media_type="image/png",
                        headers={"Cache-Control": "max-age=3600"})


@router.get("/projects/{project_id}/papers/{paper_id}/assets/{asset_id}/csv")
def get_asset_csv(
    project_id: int,
    paper_id: int,
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    asset = db.query(ExtractionAsset).filter(
        ExtractionAsset.id == asset_id,
        ExtractionAsset.paper_id == paper_id,
        ExtractionAsset.project_id == project_id,
    ).first()
    if not asset or not asset.csv_path:
        raise HTTPException(404, "CSV not available for this asset")
    p = Path(asset.csv_path)
    if not p.exists():
        raise HTTPException(404, "CSV file missing from disk")
    return FileResponse(
        str(p),
        media_type="text/csv",
        filename=f"asset_{asset_id}.csv",
    )


@router.patch("/projects/{project_id}/papers/{paper_id}/assets/{asset_id}")
def update_asset(
    project_id: int,
    paper_id: int,
    asset_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update asset classification, LLM selection flag, or user note."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    asset = db.query(ExtractionAsset).filter(
        ExtractionAsset.id == asset_id,
        ExtractionAsset.paper_id == paper_id,
    ).first()
    if not asset:
        raise HTTPException(404, "Asset not found")

    if "selected_for_llm" in data:
        asset.selected_for_llm = bool(data["selected_for_llm"])
    if "classification" in data:
        asset.classification = str(data["classification"])
    if "user_note" in data:
        asset.user_note = str(data["user_note"]) if data["user_note"] is not None else None

    db.commit()
    return _asset_out(asset)


@router.get("/projects/{project_id}/papers/{paper_id}/evidence/{evidence_id}/image")
def get_evidence_image(
    project_id: int,
    paper_id: int,
    evidence_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    ev = db.query(ExtEvidence).filter(
        ExtEvidence.id == evidence_id, ExtEvidence.paper_id == paper_id,
    ).first()
    if not ev or not ev.evidence_image_path:
        raise HTTPException(404, "Evidence image not available")
    p = Path(ev.evidence_image_path)
    if not p.exists():
        raise HTTPException(404, "Evidence image file not found on disk")
    return FileResponse(str(p), media_type="image/png",
                        headers={"Cache-Control": "max-age=3600"})


@router.get("/projects/{project_id}/papers/{paper_id}/evidence/{evidence_id}/thumbnail")
def get_evidence_thumbnail(
    project_id: int,
    paper_id: int,
    evidence_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)
    ev = db.query(ExtEvidence).filter(
        ExtEvidence.id == evidence_id, ExtEvidence.paper_id == paper_id,
    ).first()
    if not ev or not ev.evidence_thumbnail_path:
        raise HTTPException(404, "Evidence thumbnail not available")
    p = Path(ev.evidence_thumbnail_path)
    if not p.exists():
        raise HTTPException(404, "Evidence thumbnail file not found on disk")
    return FileResponse(str(p), media_type="image/png",
                        headers={"Cache-Control": "max-age=3600"})


# ─── LLM Validation endpoints ─────────────────────────────────────────────────

def _build_packages_from_db_assets(
    assets: list,
    db: Session,
    max_tokens: int = 3000,
) -> tuple:
    """
    Build EvidencePackage objects from ExtractionAsset DB records without re-running Docling.
    Returns (packages, known_item_refs).
    """
    MAX_CHARS = max_tokens * 4
    items: list = []
    known_refs: set = set()

    for asset in assets:
        if asset.docling_item_ref:
            known_refs.add(asset.docling_item_ref)

        links = sorted(asset.context_links, key=lambda l: -(l.score or 0))

        # Native table with CSV → table evidence
        if asset.asset_type == "native_table" and asset.csv_path and Path(asset.csv_path).exists():
            try:
                content = Path(asset.csv_path).read_text(encoding="utf-8")[:4000]
                if content.strip():
                    items.append(EvidenceItem(
                        item_ref=asset.docling_item_ref or f"asset_{asset.id}",
                        page_number=asset.page_number or 0,
                        source_type="table",
                        source_label=asset.caption or f"Table (page {asset.page_number})",
                        caption=asset.caption,
                        content=content,
                        bbox=json.loads(asset.bbox_json) if asset.bbox_json else None,
                        is_approximate=False,
                    ))
            except Exception:
                pass

        # Figure/chart with CSV → chart_csv evidence
        elif asset.asset_type == "figure" and asset.csv_path and Path(asset.csv_path).exists():
            try:
                content = Path(asset.csv_path).read_text(encoding="utf-8")[:2000]
                if content.strip():
                    items.append(EvidenceItem(
                        item_ref=asset.docling_item_ref or f"asset_{asset.id}",
                        page_number=asset.page_number or 0,
                        source_type="chart_csv",
                        source_label=asset.caption or f"Figure (page {asset.page_number})",
                        caption=asset.caption,
                        content=content,
                        bbox=json.loads(asset.bbox_json) if asset.bbox_json else None,
                        is_approximate=True,
                    ))
            except Exception:
                pass

        # Context link text paragraphs
        for link in links:
            if link.link_type in ("neighbor_before", "neighbor_after", "keyword_match",
                                   "same_section", "explicit_figure_reference"):
                ref = link.item_ref or asset.docling_item_ref or f"link_{link.id}"
                items.append(EvidenceItem(
                    item_ref=ref,
                    page_number=link.page_number or asset.page_number or 0,
                    source_type="text",
                    source_label=asset.section_name or link.link_type,
                    caption=None,
                    content=link.text[:1500],
                    bbox=None,
                    is_approximate=False,
                ))

    if not items:
        return [], known_refs

    # Split into token-budget packages
    packages: list = []
    current_items: list = []
    current_chars = 0
    pkg_idx = 1

    for item in items:
        item_chars = len(item.content) + len(item.item_ref) + 100
        if current_items and current_chars + item_chars > MAX_CHARS:
            packages.append(EvidencePackage(
                index=pkg_idx,
                items=current_items,
                token_estimate=current_chars // 4,
            ))
            pkg_idx += 1
            current_items = []
            current_chars = 0
        current_items.append(item)
        current_chars += item_chars

    if current_items:
        packages.append(EvidencePackage(
            index=pkg_idx,
            items=current_items,
            token_estimate=current_chars // 4,
        ))

    return packages, known_refs


def _run_llm_validation(paper_id: int, project_id: int, job_id: int) -> None:
    """
    LLM extraction using pre-extracted workspace assets.
    Skips Docling — reads ExtractionAsset + AssetContextLink from DB directly.
    """
    db = SessionLocal()
    try:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        job   = db.query(Job).filter(Job.id == job_id).first()
        if not paper or not job:
            return

        job.status = "running"
        job.started_at = datetime.utcnow()
        job.current_step = "Loading selected workspace assets"
        job.progress = 5
        db.commit()

        # Load all assets and apply same auto-proposal logic as evidence-packages.
        # Explicitly selected always included; decorative always excluded;
        # high-relevance tables/charts auto-included.
        _NON_SCI = frozenset({"publisher_logo", "license_icon", "decorative_asset"})
        _AUTO_SCORE = 3.0
        _AUTO_TABLE_SCORE = 1.0

        all_paper_assets = db.query(ExtractionAsset).filter(
            ExtractionAsset.paper_id == paper_id,
        ).all()

        selected = []
        for a in all_paper_assets:
            if a.classification in _NON_SCI:
                continue
            if a.selected_for_llm:
                selected.append(a)
                continue
            # Auto-include rule
            if a.asset_type == "native_table" and a.relevance_score >= _AUTO_TABLE_SCORE:
                selected.append(a)
            elif a.classification == "chart" and a.csv_path and Path(a.csv_path).exists():
                selected.append(a)
            elif a.relevance_score >= _AUTO_SCORE:
                selected.append(a)

        # Last resort: use everything non-decorative
        if not selected:
            selected = [a for a in all_paper_assets if a.classification not in _NON_SCI]

        job.progress = 15
        job.current_step = f"Building evidence packages from {len(selected)} assets"
        db.commit()

        packages, known_refs = _build_packages_from_db_assets(selected, db)

        if not packages:
            job.status = "completed"
            job.progress = 100
            job.current_step = "Done — no relevant evidence found in selected assets"
            job.completed_at = datetime.utcnow()
            job.result_json = json.dumps({
                "experiments_reported": 0, "experiments_stored": 0,
                "measurements_reported": 0, "measurements_stored": 0,
                "reasoning": "No relevant evidence found in the selected assets.",
                "low_confidence_count": 0, "warnings": [], "promotion": {},
            })
            db.commit()
            return

        job.progress = 30
        job.current_step = f"Extracting structured data from {len(packages)} evidence package(s)"
        db.commit()

        result = extract_food_data(
            evidence_packages=packages,
            known_item_refs=known_refs,
            enable_verification=True,
        )

        experiments_data = result.get("experiments", [])
        experiments_reported = len(experiments_data)
        measurements_reported = sum(len(e.get("measurements", [])) for e in experiments_data)
        job.progress = 75
        job.current_step = f"Persisting {experiments_reported} experiment(s) to database"
        db.commit()

        # Convert the LLM's raw dict into the shared intermediate representation
        # and persist it through the ONE writer every extraction engine uses
        # (app/extraction/common/persist.py) — this replaces what used to be a
        # bespoke persist loop duplicated here. persist_paper_extraction() wipes
        # only this paper's engine="llm" rows before writing fresh ones (Ext*
        # ingredient/indicator catalogs stay project-level and shared, never
        # wiped), so a rule- or ML-engine run on the same paper is untouched.
        ir = llm_dict_to_ir(result, paper_id, project_id)
        persist_counts = persist_paper_extraction(
            ir, paper=paper, project_id=project_id, job_id=job_id, engine="llm", db=db,
        )
        exp_count = persist_counts["experiments_stored"]
        meas_count = persist_counts["measurements_stored"]

        # ── Promote to canonical + surface reported-vs-stored mismatches ───────
        # Never silently show 0: reported/stored counts are always both recorded.
        # A complete drop (LLM reported data but none of it survived) fails the
        # job loudly; a partial drop stays "completed" with a warning attached.
        warnings: list[str] = []
        promotion: dict = {}
        failed_reason: Optional[str] = None

        if experiments_reported > 0 and exp_count == 0:
            failed_reason = (
                f"LLM reported {experiments_reported} experiment(s) but none were "
                "stored — likely a parsing error (missing cheese product/treatment)."
            )
        elif measurements_reported > 0 and meas_count == 0:
            failed_reason = (
                f"LLM reported {measurements_reported} measurement(s) but none were "
                "stored — likely a parsing error (missing day/value/indicator)."
            )
        else:
            if 0 < exp_count < experiments_reported:
                warnings.append(
                    f"{experiments_reported - exp_count} of {experiments_reported} "
                    "reported experiment(s) were not stored."
                )
            if 0 < meas_count < measurements_reported:
                warnings.append(
                    f"{measurements_reported - meas_count} of {measurements_reported} "
                    "reported measurement(s) were not stored."
                )
            try:
                promotion = promote_ext_paper_to_canonical(paper_id, project_id, db, engine="llm")
            except Exception as promo_exc:
                logger.error("Canonical promotion failed for paper %d: %s",
                             paper_id, promo_exc, exc_info=True)
                failed_reason = f"Extraction succeeded but promotion to the database failed: {promo_exc}"

        if failed_reason:
            job.status = "failed"
            job.error_message = failed_reason[:500]
        else:
            job.status = "completed"
            job.progress = 100

        job.current_step = f"Done — {exp_count} experiments, {meas_count} measurements"
        job.completed_at = datetime.utcnow()
        job.result_json = json.dumps({
            "experiments_reported": experiments_reported,
            "experiments_stored": exp_count,
            "measurements_reported": measurements_reported,
            "measurements_stored": meas_count,
            "reasoning": result.get("reasoning_summary", ""),
            "low_confidence_count": result.get("low_confidence_count", 0),
            "warnings": warnings,
            "promotion": promotion,
        })
        db.commit()

    except Exception as exc:
        logger.error("LLM validation failed for paper %d: %s", paper_id, exc, exc_info=True)
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


@router.get("/projects/{project_id}/papers/{paper_id}/evidence-packages")
def get_evidence_packages(
    project_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return grouped evidence items for the Validation page (no LLM call)."""
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    assets = (
        db.query(ExtractionAsset)
        .filter(ExtractionAsset.paper_id == paper_id)
        .order_by(ExtractionAsset.relevance_score.desc(), ExtractionAsset.page_number)
        .all()
    )

    paragraphs: list = []
    native_tables: list = []
    chart_csvs: list = []
    excluded: list = []

    _NON_SCIENTIFIC = frozenset({"publisher_logo", "license_icon", "decorative_asset"})
    _AUTO_INCLUDE_SCORE = 3.0   # relevance threshold for automatic inclusion
    _AUTO_INCLUDE_TABLE_SCORE = 1.0  # lower bar for native tables (data-rich)

    for asset in assets:
        links = sorted(asset.context_links, key=lambda l: -(l.score or 0))
        link_data = [
            {
                "id": lnk.id,
                "link_type": lnk.link_type,
                "text": lnk.text[:500],
                "page_number": lnk.page_number,
                "score": lnk.score,
            }
            for lnk in links
        ]
        base = {**_asset_out(asset), "context_links": link_data, "link_count": len(links)}

        # ── Determine effective inclusion ─────────────────────────────────────
        # user_override: True = force include, False = force exclude, None = auto
        explicitly_selected = asset.selected_for_llm

        # Always exclude non-scientific assets (logos, decorative)
        is_decorative = asset.classification in _NON_SCIENTIFIC

        # Auto-include rule: high-relevance tables and charts that user hasn't
        # explicitly excluded (i.e., never manually touched → selected_for_llm
        # is still the default False from DB)
        auto_include = False
        auto_reason = None
        if not is_decorative:
            if asset.asset_type == "native_table" and asset.relevance_score >= _AUTO_INCLUDE_TABLE_SCORE:
                auto_include = True
                auto_reason = f"native table (relevance {asset.relevance_score:.1f})"
            elif asset.classification == "chart" and asset.csv_path and Path(asset.csv_path).exists():
                auto_include = True
                auto_reason = "chart CSV available"
            elif asset.relevance_score >= _AUTO_INCLUDE_SCORE:
                auto_include = True
                auto_reason = f"relevance score {asset.relevance_score:.1f}"

        # Effective decision:
        # - explicitly_selected overrides auto for figures/tables already touched by user
        # - decorative → always excluded
        effective_include = explicitly_selected or (auto_include and not is_decorative)

        base["auto_include"] = auto_include
        base["auto_reason"] = auto_reason
        base["is_decorative"] = is_decorative
        base["effective_include"] = effective_include

        if is_decorative:
            base["exclude_reason"] = f"decorative/non-scientific ({asset.classification})"
            excluded.append(base)
        elif not effective_include:
            base["exclude_reason"] = "low relevance score — not auto-selected"
            excluded.append(base)
        elif asset.asset_type == "native_table":
            native_tables.append(base)
        elif asset.classification == "chart" and asset.csv_path:
            chart_csvs.append(base)
        else:
            # Contribute text context links as paragraph evidence
            for lnk in links:
                if lnk.link_type in ("neighbor_before", "neighbor_after",
                                      "keyword_match", "same_section"):
                    paragraphs.append({
                        "asset_id": asset.id,
                        "link_id": lnk.id,
                        "link_type": lnk.link_type,
                        "text": lnk.text[:600],
                        "page_number": lnk.page_number or asset.page_number,
                        "score": lnk.score,
                        "section_name": asset.section_name,
                        "asset_caption": asset.caption,
                        "relevance_score": asset.relevance_score,
                        "auto_reason": auto_reason,
                    })

    # Check if any LLM job exists for this paper
    last_job = (
        db.query(Job)
        .filter(Job.paper_id == paper_id, Job.job_type == "llm_validation")
        .order_by(Job.id.desc())
        .first()
    )
    last_job_data = None
    if last_job:
        last_job_data = {
            "job_id": last_job.id,
            "status": last_job.status,
            "progress": last_job.progress or 0,
            "current_step": last_job.current_step or "",
            "result": json.loads(last_job.result_json) if last_job.result_json else None,
            "completed_at": last_job.completed_at.isoformat() if last_job.completed_at else None,
        }

    return {
        "paragraphs": paragraphs,
        "native_tables": native_tables,
        "chart_csvs": chart_csvs,
        "excluded": excluded,
        "totals": {
            "paragraphs": len(paragraphs),
            "native_tables": len(native_tables),
            "chart_csvs": len(chart_csvs),
            "excluded": len(excluded),
        },
        "last_job": last_job_data,
    }


@router.post("/projects/{project_id}/papers/{paper_id}/send-to-llm", status_code=202)
def send_to_llm(
    project_id: int,
    paper_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Trigger LLM extraction using pre-extracted workspace assets.
    Skips Docling — builds evidence packages from DB records directly.
    """
    _require_project(project_id, user, db)
    _get_paper(project_id, paper_id, db)

    total = db.query(ExtractionAsset).filter(ExtractionAsset.paper_id == paper_id).count()
    if total == 0:
        raise HTTPException(400, "No extracted assets found. Run the Docling pipeline first.")

    running = db.query(Job).filter(
        Job.paper_id == paper_id,
        Job.job_type == "llm_validation",
        Job.status.in_(["queued", "running"]),
    ).first()
    if running:
        return {"job_id": running.id, "status": "already_running"}

    selected = db.query(ExtractionAsset).filter(
        ExtractionAsset.paper_id == paper_id,
        ExtractionAsset.selected_for_llm == True,
    ).count()

    job = Job(
        project_id=project_id,
        paper_id=paper_id,
        job_type="llm_validation",
        status="queued",
        current_step="Queued",
        progress=0,
        created_by=user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_llm_validation, paper_id, project_id, job.id)

    return {
        "job_id": job.id,
        "status": "queued",
        "assets_selected": selected,
        "assets_total": total,
        "message": "LLM validation started",
    }


@router.get("/projects/{project_id}/papers/{paper_id}/llm-job/{job_id}")
def get_llm_job(
    project_id: int,
    paper_id: int,
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Poll LLM validation job status."""
    _require_project(project_id, user, db)
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.paper_id == paper_id,
        Job.project_id == project_id,
    ).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return {
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress or 0,
        "current_step": job.current_step or "",
        "error_message": job.error_message,
        "result": json.loads(job.result_json) if job.result_json else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
