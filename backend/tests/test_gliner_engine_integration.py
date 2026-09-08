"""
Integration tests for the GLiNER engine's wiring into the multi-engine
extraction API — mocks GlinerExtractionEngine.extract_document so this runs
fast and deterministically in CI without needing the real ~166M-parameter
model downloaded (the real model's actual extraction quality was verified
manually against real papers already in this project; see
docs/extraction_engines.md). What's under test here is the PLUMBING: the
engine is a real third option alongside llm/rules, its staging rows are
engine-scoped exactly like the other two, and it promotes to the same
canonical schema.
"""
from unittest.mock import patch

from app.api.routes import extraction_engines
from app.db.models import ExtExperiment, Job, Paper, Project
from app.extraction.common.models import (
    ExtractedExperiment, ExtractedObservation, PaperExtractionResult, Provenance,
)


class _NonClosingSession:
    """The extraction background task opens its own SessionLocal() (a
    separate session from the request's), which in production is correct
    but means tests must repoint it at the in-memory test database — same
    pattern as test_engine_scoped_staging.py."""
    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def close(self):
        pass


def _seed_paper(db, user):
    project = Project(name="GLiNER Engine Test", owner_id=user.id)
    db.add(project)
    db.flush()
    paper = Paper(project_id=project.id, filename="p.pdf", original_name="paper.pdf",
                  file_path="/nonexistent/p.pdf", status="extracted")
    db.add(paper)
    db.commit()
    db.refresh(project)
    db.refresh(paper)
    return project, paper


def _fake_gliner_result(paper_id: int, project_id: int) -> PaperExtractionResult:
    return PaperExtractionResult(
        paper_id=paper_id, project_id=project_id, engine="gliner",
        experiments=[ExtractedExperiment(
            cheese_product="gouda", treatment="chitosan",
            observations=[ExtractedObservation(
                day=15, indicator_type="ph", indicator_unit="", indicator_value=5.6,
                provenance=[Provenance(source_type="text", confidence=0.6, confidence_reason="test")],
            )],
        )],
        reasoning_summary="fake gliner run",
    )


def test_gliner_is_a_supported_engine_via_the_api(client, auth_headers, db, test_user, monkeypatch):
    monkeypatch.setattr(extraction_engines, "SessionLocal", lambda: _NonClosingSession(db))
    project, paper = _seed_paper(db, test_user)

    with patch(
        "app.extraction.gliner.engine.GlinerExtractionEngine.extract_document",
        return_value=_fake_gliner_result(paper.id, project.id),
    ):
        resp = client.post(
            f"/api/projects/{project.id}/papers/{paper.id}/extract?engine=gliner",
            headers=auth_headers,
        )
        assert resp.status_code == 202, resp.text
        job_id = resp.json()["job_id"]
        assert resp.json()["engine"] == "gliner"

        # The extraction runs as a FastAPI BackgroundTask, which the test
        # client executes synchronously as part of the request/response
        # cycle (no real backgrounding in TestClient), so the job is already
        # done by the time this response is checked.
        job = db.query(Job).filter(Job.id == job_id).first()
        assert job is not None
        assert job.job_type == "gliner_extraction"

    exps = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper.id, ExtExperiment.engine == "gliner",
    ).all()
    assert len(exps) == 1
    assert exps[0].cheese_product == "gouda"
    assert exps[0].treatment == "chitosan"


def test_unknown_engine_is_rejected(client, auth_headers, db, test_user):
    project, paper = _seed_paper(db, test_user)
    resp = client.post(
        f"/api/projects/{project.id}/papers/{paper.id}/extract?engine=nonsense",
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_ml_and_compare_are_still_explicitly_rejected_not_silently_stubbed(client, auth_headers, db, test_user):
    project, paper = _seed_paper(db, test_user)
    for engine in ("ml", "compare"):
        resp = client.post(
            f"/api/projects/{project.id}/papers/{paper.id}/extract?engine={engine}",
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "not implemented" in resp.json()["detail"].lower()


def test_list_extractions_includes_gliner_summary(client, auth_headers, db, test_user):
    project, paper = _seed_paper(db, test_user)
    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/extractions",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    engines = {e["engine"] for e in resp.json()["engines"]}
    assert engines == {"llm", "rules", "gliner"}


def test_gliner_staging_is_isolated_from_rules_and_llm(client, auth_headers, db, test_user, monkeypatch):
    """The three engines must coexist for comparison — running gliner must
    not wipe rules'/llm's staging rows for the same paper, and vice versa
    (mirrors test_engine_scoped_staging.py's proof for llm/rules)."""
    from app.extraction.common.persist import persist_paper_extraction

    monkeypatch.setattr(extraction_engines, "SessionLocal", lambda: _NonClosingSession(db))
    project, paper = _seed_paper(db, test_user)

    rules_result = PaperExtractionResult(
        paper_id=paper.id, project_id=project.id, engine="rules",
        experiments=[ExtractedExperiment(cheese_product="cheddar", treatment="control")],
    )
    persist_paper_extraction(rules_result, paper=paper, project_id=project.id, job_id=None, engine="rules", db=db)

    with patch(
        "app.extraction.gliner.engine.GlinerExtractionEngine.extract_document",
        return_value=_fake_gliner_result(paper.id, project.id),
    ):
        resp = client.post(
            f"/api/projects/{project.id}/papers/{paper.id}/extract?engine=gliner",
            headers=auth_headers,
        )
        assert resp.status_code == 202

    rules_after = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper.id, ExtExperiment.engine == "rules",
    ).all()
    gliner_after = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper.id, ExtExperiment.engine == "gliner",
    ).all()
    assert len(rules_after) == 1, "gliner extraction must not touch the rule engine's staging rows"
    assert rules_after[0].cheese_product == "cheddar"
    assert len(gliner_after) == 1
    assert gliner_after[0].cheese_product == "gouda"
