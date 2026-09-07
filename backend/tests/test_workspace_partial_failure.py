"""
Tests for _run_workspace_extraction's partial-failure and cancellation
handling: one bad page-range chunk or one bad asset must not fail the whole
paper, every chunk failure is recorded through app.services.job_events so
the SSE timeline and a refreshed browser both see it, and a cancellation
request is honored between chunks.
"""
import json

from app.api.routes import extraction_workspace
from app.db.models import ExtractionAsset, Job, JobEvent, Paper, Project
from app.services.docling_extractor import DoclingChunkResult, DoclingTable


class _NonClosingSession:
    """Shares one transaction with the test so assertions can see what the
    function under test just committed (mirrors test_e2e_cheese_extraction_flow.py)."""
    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def close(self):
        pass


def _seed_paper(db, user, tmp_path, cancel_requested=False):
    project = Project(name="Cheese Shelf-Life", owner_id=user.id)
    db.add(project)
    db.flush()

    pdf_path = tmp_path / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake content for hashing only")

    paper = Paper(
        project_id=project.id, filename="p.pdf", original_name="paper.pdf",
        file_path=str(pdf_path), page_count=0, status="uploaded",
    )
    db.add(paper)
    db.flush()

    job = Job(project_id=project.id, paper_id=paper.id, job_type="workspace_extraction",
              status="queued", cancel_requested=cancel_requested, created_by=user.id)
    db.add(job)
    db.commit()
    db.refresh(paper)
    db.refresh(job)
    return project, paper, job


def _patch_common(monkeypatch, db, chunks):
    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(extraction_workspace, "_generate_page_images", lambda pdf_path, pages_dir: {})
    monkeypatch.setattr(extraction_workspace, "extract_pdf_progressive",
                        lambda pdf_path, cancel_check=None: iter(chunks))
    monkeypatch.setattr(extraction_workspace, "convert_charts", lambda figures, cache_dir: iter([]))


def _event_types(db, job_id):
    return [e.event_type for e in
            db.query(JobEvent).filter(JobEvent.job_id == job_id).order_by(JobEvent.seq).all()]


def test_one_failed_chunk_still_yields_partial_success(db, test_user, monkeypatch, tmp_path):
    project, paper, job = _seed_paper(db, test_user, tmp_path)

    real_csv = tmp_path / "table_1.csv"
    real_csv.write_text("Treatment,Day 0,Day 15\nControl,2.1,4.8\n", encoding="utf-8")

    ok_chunk = DoclingChunkResult(
        chunk_index=0, page_start=1, page_end=6, total_pages=12,
        tables=[DoclingTable(item_ref="#/tables/0@p1-6", page_number=3,
                              caption="Yeast counts", csv_path=str(real_csv))],
        status="ok",
    )
    failed_chunk = DoclingChunkResult(
        chunk_index=1, page_start=7, page_end=12, total_pages=12,
        status="failed", error="simulated Docling failure",
    )
    _patch_common(monkeypatch, db, [ok_chunk, failed_chunk])

    extraction_workspace._run_workspace_extraction(paper.id, project.id, job.id)

    db.refresh(job)
    db.refresh(paper)
    assert job.status == "partial_success"
    assert paper.status == "extracted"
    assert len(job.warnings) == 1
    assert "7-12" in job.warnings[0]

    assets = db.query(ExtractionAsset).filter(ExtractionAsset.paper_id == paper.id).all()
    assert len(assets) == 1
    assert assets[0].asset_type == "native_table"

    events = _event_types(db, job.id)
    assert "chunk_failed" in events
    assert "job_completed" in events
    assert "asset_added" in events


def test_all_chunks_failed_marks_job_failed(db, test_user, monkeypatch, tmp_path):
    project, paper, job = _seed_paper(db, test_user, tmp_path)

    failed_chunk_1 = DoclingChunkResult(
        chunk_index=0, page_start=1, page_end=6, total_pages=12,
        status="failed", error="boom 1",
    )
    failed_chunk_2 = DoclingChunkResult(
        chunk_index=1, page_start=7, page_end=12, total_pages=12,
        status="failed", error="boom 2",
    )
    _patch_common(monkeypatch, db, [failed_chunk_1, failed_chunk_2])

    extraction_workspace._run_workspace_extraction(paper.id, project.id, job.id)

    db.refresh(job)
    db.refresh(paper)
    assert job.status == "failed"
    assert paper.status == "failed"
    assert db.query(ExtractionAsset).filter(ExtractionAsset.paper_id == paper.id).count() == 0
    assert "job_failed" in _event_types(db, job.id)


def test_cancel_requested_before_start_stops_immediately(db, test_user, monkeypatch, tmp_path):
    project, paper, job = _seed_paper(db, test_user, tmp_path, cancel_requested=True)

    def _should_not_be_called(*args, **kwargs):
        raise AssertionError("extract_pdf_progressive must not run once cancellation is observed")

    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(extraction_workspace, "_generate_page_images", lambda pdf_path, pages_dir: {})
    monkeypatch.setattr(extraction_workspace, "extract_pdf_progressive", _should_not_be_called)

    extraction_workspace._run_workspace_extraction(paper.id, project.id, job.id)

    db.refresh(job)
    db.refresh(paper)
    assert job.status == "cancelled"
    assert paper.status == "uploaded"
    assert "job_cancelled" in _event_types(db, job.id)


def test_asset_persistence_failure_is_a_warning_not_a_crash(db, test_user, monkeypatch, tmp_path):
    """A DB-level failure while saving one asset must not abort the run —
    db.rollback() has to happen so the session stays usable for the rest."""
    project, paper, job = _seed_paper(db, test_user, tmp_path)

    real_csv = tmp_path / "table_1.csv"
    real_csv.write_text("Treatment,Day 0\nControl,2.1\n", encoding="utf-8")

    good_table = DoclingTable(item_ref="#/tables/0@p1-6", page_number=3,
                               caption="Good table", csv_path=str(real_csv))
    # page_number=None on a NOT NULL-ish path is harmless in SQLite, so force
    # the failure deterministically by breaking bbox_json serialization input.
    class _Unserializable:
        pass

    bad_table = DoclingTable(item_ref="#/tables/1@p1-6", page_number=4,
                              caption="Bad table", csv_path=str(real_csv))
    bad_table.bbox = _Unserializable()  # json.dumps(item.bbox) raises TypeError

    chunk = DoclingChunkResult(
        chunk_index=0, page_start=1, page_end=6, total_pages=6,
        tables=[good_table, bad_table], status="ok",
    )
    _patch_common(monkeypatch, db, [chunk])

    extraction_workspace._run_workspace_extraction(paper.id, project.id, job.id)

    db.refresh(job)
    db.refresh(paper)
    assert job.status == "partial_success"
    assets = db.query(ExtractionAsset).filter(ExtractionAsset.paper_id == paper.id).all()
    assert len(assets) == 1
    assert assets[0].caption == "Good table"
    assert any("page 4" in w for w in job.warnings)
    assert "asset_failed" in _event_types(db, job.id)
