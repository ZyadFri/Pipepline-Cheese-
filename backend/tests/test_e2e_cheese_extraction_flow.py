"""
test_e2e_cheese_extraction_flow.py — full extraction -> promotion -> review ->
database integration test.

Reproduces the originally-reported bug end to end: mocks the LLM extraction step
to return a fixed, realistic result (2 cheese experiments, 6 measurements with
evidence), runs the real persist + auto-promotion code path
(extraction_workspace._run_llm_validation), and asserts the result is visible
through every screen that showed 0 before this fix — canonical Experiments,
canonical Observations, the review-queue API, and the paper pipeline-status
counts — then verifies approving a value protects it from a second extraction
run on the same paper.
"""
import json

from app.api.routes import extraction_workspace
from app.db.models import AssetContextLink, ExtractionAsset, Job, Paper, Project


class _NonClosingSession:
    """
    Wraps the test's db session so _run_llm_validation's own db.close() (in its
    finally block) doesn't tear down the fixture session mid-test — both must
    share one transaction so the test can see what the function under test just
    committed, and so later assertions in the same test still have a live session.
    """
    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def close(self):
        pass


FAKE_LLM_RESULT = {
    "reasoning_summary": "Found 2 cheese experiments across storage conditions.",
    "experiments": [
        {
            "cheese_product": "Gouda",
            "treatment": "chitosan coating 1%",
            "experiment_evidence": [
                {"docling_item_ref": "#/texts/0", "page_number": 2, "source_type": "text",
                 "exact_text": "Gouda samples were coated with 1% chitosan.",
                 "confidence": 0.95, "value_is_approximate": False},
            ],
            "ingredients": [
                {"ingredient_name": "chitosan", "functional_class": "antimicrobial",
                 "source": "crustacean shells", "concentration": 1.0,
                 "concentration_unit": "%",
                 "evidence": [
                     {"docling_item_ref": "#/tables/0", "page_number": 3, "source_type": "table",
                      "exact_text": "1% w/v", "confidence": 0.9, "value_is_approximate": False},
                 ]},
            ],
            "measurements": [
                {"day": 0, "indicator_type": "Total viable count", "indicator_unit": "log CFU/g",
                 "indicator_threshold": None, "indicator_value": 5.2,
                 "value_is_approximate": False,
                 "evidence": [{"docling_item_ref": "#/tables/0", "page_number": 3,
                               "source_type": "table", "exact_text": "5.2",
                               "confidence": 0.95, "value_is_approximate": False}]},
                {"day": 7, "indicator_type": "Total viable count", "indicator_unit": "log CFU/g",
                 "indicator_threshold": None, "indicator_value": 5.8,
                 "value_is_approximate": False,
                 "evidence": [{"docling_item_ref": "#/tables/0", "page_number": 3,
                               "source_type": "table", "exact_text": "5.8",
                               "confidence": 0.92, "value_is_approximate": False}]},
                {"day": 14, "indicator_type": "pH", "indicator_unit": "pH units",
                 "indicator_threshold": None, "indicator_value": 6.1,
                 "value_is_approximate": True,
                 "evidence": [{"docling_item_ref": "#/pictures/0", "page_number": 4,
                               "source_type": "chart_csv", "exact_text": None,
                               "confidence": 0.5, "value_is_approximate": True}]},
            ],
        },
        {
            "cheese_product": "Gouda",
            "treatment": "control",
            "experiment_evidence": [],
            "ingredients": [],
            "measurements": [
                {"day": 0, "indicator_type": "Total viable count", "indicator_unit": "log CFU/g",
                 "indicator_threshold": None, "indicator_value": 5.3,
                 "value_is_approximate": False, "evidence": []},
                {"day": 7, "indicator_type": "Total viable count", "indicator_unit": "log CFU/g",
                 "indicator_threshold": None, "indicator_value": 6.9,
                 "value_is_approximate": False, "evidence": []},
                {"day": 14, "indicator_type": "Total viable count", "indicator_unit": "log CFU/g",
                 "indicator_threshold": None, "indicator_value": 8.1,
                 "value_is_approximate": False, "evidence": []},
            ],
        },
    ],
    "low_confidence_count": 1,
}


def _seed_project_and_paper(db, user):
    project = Project(name="Cheese Shelf-Life", owner_id=user.id)
    db.add(project)
    db.flush()

    paper = Paper(
        project_id=project.id, filename="p.pdf", original_name="paper.pdf",
        file_path="/nonexistent/p.pdf", page_count=10, status="uploaded",
    )
    db.add(paper)
    db.flush()

    # Minimum viable asset + context-link text so _build_packages_from_db_assets
    # produces at least one evidence item without needing real files on disk
    # (table/chart evidence items require a csv_path that exists; text items don't).
    asset = ExtractionAsset(
        paper_id=paper.id, project_id=project.id, docling_item_ref="#/tables/0",
        asset_type="native_table", page_number=3, classification="native_table",
        relevance_score=5.0, selected_for_llm=True,
    )
    db.add(asset)
    db.flush()
    db.add(AssetContextLink(
        asset_id=asset.id, link_type="same_section", page_number=3,
        item_ref="#/texts/0",
        text="Gouda samples were stored at 4C and evaluated for TVC and pH over 14 days.",
        score=1.0,
    ))

    # Real usage always has a completed workspace_extraction (Docling/asset) job
    # before llm_validation runs — pipeline-status's docling/assets/badge logic
    # depends on it existing, so seed one for a realistic paper state.
    ws_job = Job(project_id=project.id, paper_id=paper.id, job_type="workspace_extraction",
                 status="completed", created_by=user.id)
    db.add(ws_job)

    job = Job(project_id=project.id, paper_id=paper.id, job_type="llm_validation",
              status="queued", created_by=user.id)
    db.add(job)
    db.commit()
    db.refresh(paper)
    db.refresh(job)
    return project, paper, job


def _run_extraction(db, monkeypatch, paper_id, project_id, job_id, llm_result):
    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(extraction_workspace, "extract_food_data", lambda **kw: llm_result)
    extraction_workspace._run_llm_validation(paper_id, project_id, job_id)


def test_full_extraction_to_review_to_database_flow(db, test_user, client, auth_headers, monkeypatch):
    project, paper, job = _seed_project_and_paper(db, test_user)

    _run_extraction(db, monkeypatch, paper.id, project.id, job.id, FAKE_LLM_RESULT)

    db.refresh(job)
    assert job.status == "completed", job.error_message
    result = json.loads(job.result_json)
    assert result["experiments_reported"] == 2
    assert result["experiments_stored"] == 2
    assert result["measurements_reported"] == 6
    assert result["measurements_stored"] == 6
    assert result["warnings"] == []

    # Canonical Experiments — matches what extraction reported (requirement #24).
    resp = client.get(f"/api/experiments?project_id={project.id}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    experiments = resp.json()
    assert len(experiments) == 2

    # Canonical Observations via the review-queue API (Review/Database pages).
    resp = client.get(f"/api/projects/{project.id}/observations", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    observations = resp.json()
    assert len(observations) == 6
    assert all(o["review_status"] == "needs_review" for o in observations)
    assert all(o["paper_id"] == paper.id for o in observations)
    assert any(o["product_name"] == "Gouda" for o in observations)

    # Plain canonical /observations endpoint (used elsewhere, e.g. Trajectories)
    # must agree with the review-queue's count.
    resp = client.get(f"/api/observations?project_id={project.id}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 6

    # Chart-derived value carries graph_estimated; directly-reported table values
    # carry reported_table — requirement #27's "reported vs estimated" distinction.
    ph_obs = next(o for o in observations if o["measurement_subtype"] == "pH")
    assert ph_obs["value_origin"] == "graph_estimated"
    tvc_day0 = next(
        o for o in observations
        if o["measurement_subtype"] == "Total viable count" and o["time_days"] == 0
        and o["product_name"] == "Gouda" and o["treatment_label"] == "chitosan coating 1%"
    )
    assert tvc_day0["value_origin"] == "reported_table"

    # Provenance survived promotion, with confidence carried through.
    with_evidence = [o for o in observations if o["evidence"]]
    assert with_evidence, "expected at least one observation with linked evidence"
    assert with_evidence[0]["evidence"][0]["confidence"] is not None

    # Paper pipeline-status (the exact endpoint behind the originally-reported
    # bug) must now show real counts instead of falling through to a stuck badge.
    resp = client.get(f"/api/projects/{project.id}/papers/pipeline-status", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    status_row = next(p for p in resp.json() if p["id"] == paper.id)
    assert status_row["counts"]["rows"] == 6
    assert status_row["stages"]["promotion"] == "completed"
    # Promotion succeeded but nothing has been approved yet — "awaiting_review" is
    # the correct badge (not "completed", and not stuck on "validation_ready"
    # like the originally-reported bug produced).
    assert status_row["badge"] == "awaiting_review"

    # ── Approve one observation, then verify a second extraction run on the same
    # paper cannot silently overwrite it (requirement #37). ──────────────────────
    approve_id = observations[0]["id"]
    resp = client.post(f"/api/observations/{approve_id}/approve", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["review_status"] == "approved"
    original_value = resp.json()["numeric_value_normalized"]

    mutated_result = json.loads(json.dumps(FAKE_LLM_RESULT))  # deep copy
    for exp in mutated_result["experiments"]:
        for m in exp["measurements"]:
            m["indicator_value"] = -999.0  # a rerun must never apply this to approved data

    job2 = Job(project_id=project.id, paper_id=paper.id, job_type="llm_validation",
               status="queued", created_by=test_user.id)
    db.add(job2)
    db.commit()
    db.refresh(job2)

    _run_extraction(db, monkeypatch, paper.id, project.id, job2.id, mutated_result)

    db.refresh(job2)
    assert job2.status == "completed", job2.error_message
    result2 = json.loads(job2.result_json)
    assert result2["promotion"]["observations_skipped_approved"] == 1

    resp = client.get(f"/api/observations/{approve_id}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["numeric_value_normalized"] == original_value
    assert resp.json()["review_status"] == "approved"

    # Re-running on the same paper must update, not duplicate, canonical Experiments.
    resp = client.get(f"/api/experiments?project_id={project.id}", headers=auth_headers)
    assert len(resp.json()) == 2


def test_extraction_reports_but_stores_zero_fails_loudly(db, test_user, monkeypatch):
    """A complete reported-vs-stored drop must fail the job, never silently show 0
    (the exact failure mode the originally-reported bug produced)."""
    project, paper, job = _seed_project_and_paper(db, test_user)

    bad_result = {
        "reasoning_summary": "malformed",
        "experiments": [{"cheese_product": "", "treatment": "", "measurements": []}],
        "low_confidence_count": 0,
    }
    _run_extraction(db, monkeypatch, paper.id, project.id, job.id, bad_result)

    db.refresh(job)
    assert job.status == "failed"
    assert "reported" in job.error_message.lower()
    result = json.loads(job.result_json)
    assert result["experiments_reported"] == 1
    assert result["experiments_stored"] == 0
