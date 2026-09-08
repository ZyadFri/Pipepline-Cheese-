"""
Tests for app/api/routes/insights.py — extraction quality score,
missing-expected-field detection, and duplicate-experiment detection.
Pure read/aggregate endpoints over the canonical model, seeded directly via
the ORM (no extraction engine involved).
"""
from app.core.security import create_access_token, hash_password
from app.db.models import (
    Experiment, Observation, Paper, Project, ProvenanceRecord, Study,
    TreatmentArm, User,
)


def _seed_project_paper(db, user, name="Cheese Study"):
    project = Project(name="Insights Test", owner_id=user.id)
    db.add(project)
    db.flush()
    paper = Paper(project_id=project.id, filename="p.pdf", original_name=name,
                  file_path="/nonexistent/p.pdf", status="extracted")
    db.add(paper)
    db.commit()
    db.refresh(project)
    db.refresh(paper)
    return project, paper


def _seed_full_experiment(db, project, paper):
    """One experiment with every checked field populated, one control arm,
    one observation carrying confidence + evidence + approved status."""
    study = Study(project_id=project.id, paper_id=paper.id, title="Full study")
    db.add(study)
    db.flush()

    exp = Experiment(
        study_id=study.id, experiment_label="Full experiment",
        product_name_original="Gouda", storage_temperature_c=4.0,
        storage_duration_days=21.0, packaging_type="vacuum", initial_ph=5.2,
    )
    db.add(exp)
    db.flush()

    arm = TreatmentArm(
        experiment_id=exp.id, arm_label="Control", is_control=True,
        ingredient_name_original="none", concentration_value_original=0.0,
        concentration_unit_original="%",
    )
    db.add(arm)
    db.flush()

    obs = Observation(
        treatment_arm_id=arm.id, measurement_type="ph", time_days=1,
        numeric_value_normalized=5.2, unit_normalized="pH",
        quality_score=0.9, review_status="approved",
    )
    db.add(obs)
    db.flush()

    prov = ProvenanceRecord(
        entity_type="observation", entity_id=obs.id, study_id=study.id,
        observation_id=obs.id, paper_id=paper.id, page_number=3,
        source_snippet="pH was 5.2 on day 1.", confidence=0.9,
    )
    db.add(prov)
    db.commit()
    return study, exp, arm, obs


def _seed_bare_experiment(db, project, paper, product="Gouda", ingredient="chitosan", paper_id=None):
    study = Study(project_id=project.id, paper_id=paper.id if paper_id is None else paper_id, title="Bare study")
    db.add(study)
    db.flush()
    exp = Experiment(study_id=study.id, experiment_label="Bare experiment", product_name_original=product)
    db.add(exp)
    db.flush()
    arm = TreatmentArm(experiment_id=exp.id, arm_label="Treated", is_control=False,
                        ingredient_name_original=ingredient)
    db.add(arm)
    db.commit()
    return study, exp, arm


# ── Quality score ────────────────────────────────────────────────────────

def test_quality_score_no_data_returns_zero(client, auth_headers, db, test_user):
    project, paper = _seed_project_paper(db, test_user)
    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/quality-score",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is False
    assert body["overall_score"] == 0.0


def test_quality_score_fully_populated_experiment_scores_high(client, auth_headers, db, test_user):
    project, paper = _seed_project_paper(db, test_user)
    _seed_full_experiment(db, project, paper)

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/quality-score",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is True
    assert body["experiment_count"] == 1
    assert body["observation_count"] == 1
    b = body["breakdown"]
    assert b["populated_field_ratio"] == 1.0
    assert b["avg_confidence"] == 0.9
    assert b["evidence_coverage"] == 1.0
    assert b["review_progress"] == 1.0
    assert body["overall_score"] > 90.0


def test_quality_score_requires_project_access(client, db, test_user):
    project, paper = _seed_project_paper(db, test_user)
    other = User(email="qs-other@example.com", full_name="Other",
                 hashed_password=hash_password("password123"), is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    other_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(other.id)})}"}

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/quality-score",
        headers=other_headers,
    )
    assert resp.status_code == 404


# ── Missing fields ───────────────────────────────────────────────────────

def test_missing_fields_flags_unpopulated_fields_and_missing_control(client, auth_headers, db, test_user):
    project, paper = _seed_project_paper(db, test_user)
    study, exp, arm = _seed_bare_experiment(db, project, paper)
    # arm has ingredient_name_original set but not concentration value/unit;
    # experiment has no storage_temperature_c/duration/packaging/pH; no
    # control arm exists at all.

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/missing-fields",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    fields = {(m["scope"], m.get("field")) for m in body["missing"]}
    assert ("experiment", "storage_temperature_c") in fields
    assert ("experiment", "control_arm") in fields
    assert ("treatment_arm", "concentration_value_original") in fields
    assert ("treatment_arm", "concentration_unit_original") in fields
    # ingredient_name_original WAS populated, must not be flagged
    assert ("treatment_arm", "ingredient_name_original") not in fields


def test_missing_fields_fully_populated_experiment_has_nothing_missing(client, auth_headers, db, test_user):
    project, paper = _seed_project_paper(db, test_user)
    _seed_full_experiment(db, project, paper)

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/missing-fields",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total_missing"] == 0


# ── Duplicate experiments ───────────────────────────────────────────────

def test_duplicate_experiments_are_flagged_across_papers(client, auth_headers, db, test_user):
    project, paper_a = _seed_project_paper(db, test_user, name="Paper A")
    # seed a second paper under the SAME project directly
    paper_b = Paper(project_id=project.id, filename="p2.pdf", original_name="Paper B",
                     file_path="/nonexistent/p2.pdf", status="extracted")
    db.add(paper_b)
    db.commit()
    db.refresh(paper_b)

    _seed_bare_experiment(db, project, paper_a, product="Gouda", ingredient="chitosan")
    _seed_bare_experiment(db, project, paper_b, product="Gouda", ingredient="chitosan")
    # a clearly different experiment that should NOT match
    _seed_bare_experiment(db, project, paper_b, product="Feta", ingredient="rosemary oil")

    resp = client.get(
        f"/api/projects/{project.id}/experiments/duplicates",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["experiments_scanned"] == 3
    assert len(body["pairs"]) == 1
    pair = body["pairs"][0]
    assert pair["similarity"] >= 85.0
    assert {pair["experiment_a"]["product_name"], pair["experiment_b"]["product_name"]} == {"Gouda"}


def test_duplicates_use_experiment_label_when_ingredient_and_product_are_uninformative(client, auth_headers, db, test_user):
    """Regression test for a real bug found on a real paper (project 43,
    paper 30): every experiment shared the same generic product name
    ('double cream cheese') and had NO ingredient_name_original populated
    (only a short arm code like 'C1g'/'EXo') — so the signature collapsed to
    the same value for all 21 experiments and every single pair (210 of
    them) came back as a 100% duplicate. experiment_label/arm_label must be
    used to keep genuinely different treatment arms apart even when
    product/ingredient fields carry no distinguishing information."""
    project, paper = _seed_project_paper(db, test_user)
    study = Study(project_id=project.id, paper_id=paper.id, title="Coating study")
    db.add(study)
    db.flush()

    labels = ["C1g (no coating, control)", "C2g (coating without oil)", "EXg (coating with garlic oil)"]
    for label in labels:
        exp = Experiment(study_id=study.id, experiment_label=label, product_name_original="double cream cheese")
        db.add(exp)
        db.flush()
        arm = TreatmentArm(experiment_id=exp.id, arm_label=label, is_control="control" in label)
        db.add(arm)
    db.commit()

    resp = client.get(
        f"/api/projects/{project.id}/experiments/duplicates",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["experiments_scanned"] == 3
    # Three genuinely distinct arms of the same product must NOT all pair up
    # as duplicates just because the product name is identical.
    assert len(body["pairs"]) == 0


def test_duplicate_experiments_requires_project_access(client, db, test_user):
    project, paper = _seed_project_paper(db, test_user)
    other = User(email="dup-other@example.com", full_name="Other",
                 hashed_password=hash_password("password123"), is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    other_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(other.id)})}"}

    resp = client.get(
        f"/api/projects/{project.id}/experiments/duplicates",
        headers=other_headers,
    )
    assert resp.status_code == 404
