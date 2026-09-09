"""
Regression test for a real bug that has now broken production delete twice in a
row from two DIFFERENT tables: deleting a project/paper that had gone through
extraction failed with a FOREIGN KEY / ForeignKeyViolation error. The canonical
Study -> Experiment -> TreatmentArm -> Observation tree cascades correctly via
ORM relationships, but a growing number of side tables (ExtExperiment,
ProvenanceRecord, ValidationIssue, ImputationProposal, TrajectoryDefinition,
ReviewAssignment, ExtractedRow, LLMUsageEvent, the Model Lab tables...) hold
plain foreign keys straight into paper/project/study rows with no cascade at
all. Hand-enumerating them (the first fix) missed LLMUsageEvent entirely and
was only caught live in production against real Postgres - SQLite's weaker FK
enforcement in the test suite didn't reproduce it. The fix is now a generic,
schema-introspecting cleanup (app/services/cascade_cleanup.py) instead of a
hand-written table list, specifically so a future table nobody remembers to
list here still gets handled.
"""

from app.db.models import (
    Experiment, ExtExperiment, ExtractedRow, ImputationProposal, Job,
    LabModelResult, LabTrainingRun, LLMUsageEvent, Observation,
    Paper, Project, ProvenanceRecord, ReviewAssignment, Study, TreatmentArm,
    TrajectoryDefinition, UploadedDataset, User, ValidationIssue,
)


def _full_canonical_project(db, user: User) -> Project:
    """A project carrying one row in every table that used to block deletion."""
    proj = Project(name="Full Tree Project", owner_id=user.id, description="")
    db.add(proj)
    db.commit()
    db.refresh(proj)

    paper = Paper(project_id=proj.id, filename="p.pdf", original_name="p.pdf", file_path="/tmp/p.pdf", status="completed")
    db.add(paper)
    db.flush()

    study = Study(project_id=proj.id, paper_id=paper.id, title="Study", authors_json="[]",
                   created_by=user.id, updated_by=user.id)
    db.add(study)
    db.flush()

    exp = Experiment(study_id=study.id, product_name_normalized="Cheese",
                      created_by=user.id, updated_by=user.id)
    db.add(exp)
    db.flush()

    arm = TreatmentArm(experiment_id=exp.id, arm_label="Control", is_control=True,
                        combination_treatments_json="[]", extra_treatment_json="{}",
                        created_by=user.id)
    db.add(arm)
    db.flush()

    obs = Observation(treatment_arm_id=arm.id, measurement_type="ph",
                       numeric_value_original=6.5, created_by=user.id, updated_by=user.id)
    db.add(obs)
    db.flush()

    # The confirmed real-world blocker: a staging row left over from
    # promote-to-canonical, pointing at the now-canonical Experiment.
    job = Job(project_id=proj.id, job_type="workspace_extraction", status="completed")
    db.add(job)
    db.flush()
    ext_exp = ExtExperiment(project_id=proj.id, job_id=job.id, paper_id=paper.id,
                             cheese_product="Cheese", treatment="Control",
                             promoted_experiment_id=exp.id)
    db.add(ext_exp)

    db.add(ProvenanceRecord(study_id=study.id, observation_id=obs.id, paper_id=paper.id,
                             entity_type="observation", entity_id=obs.id))
    db.add(ValidationIssue(observation_id=obs.id, rule_code="VAL-001", severity="warning", message="x"))
    db.add(ImputationProposal(project_id=proj.id, target_arm_id=arm.id,
                               target_observation_id=obs.id, predicted_value=6.4))
    db.add(TrajectoryDefinition(project_id=proj.id, experiment_id=exp.id, treatment_arm_id=arm.id,
                                 measurement_type="ph"))
    db.add(ReviewAssignment(project_id=proj.id, study_id=study.id, reviewer_id=user.id))
    row = ExtractedRow(project_id=proj.id, paper_id=paper.id, canonical_study_id=study.id, data_json="{}")
    db.add(row)

    # The two gaps a hand-written table list actually missed in production:
    db.add(LLMUsageEvent(user_id=user.id, project_id=proj.id, paper_id=paper.id,
                          feature="llm_extraction", provider="groq", model="test-model"))
    dataset = UploadedDataset(project_id=proj.id, original_name="d.csv", filename="d.csv", file_path="/tmp/d.csv")
    db.add(dataset)
    db.flush()
    training_run = LabTrainingRun(project_id=proj.id, dataset_id=dataset.id, dataset_family="kinetic")
    db.add(training_run)
    db.flush()
    db.add(LabModelResult(training_run_id=training_run.id, project_id=proj.id,
                           model_name="baranyi", model_family="kinetic"))

    db.commit()
    return proj, paper


def test_delete_project_with_full_canonical_tree(client, db, test_user, auth_headers):
    proj, _paper = _full_canonical_project(db, test_user)

    resp = client.delete(f"/api/projects/{proj.id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text
    assert db.query(Project).filter(Project.id == proj.id).first() is None


def test_delete_paper_with_full_canonical_tree(client, db, test_user, auth_headers):
    """Regression test: delete_paper used to do a bare db.delete(paper) with no
    cascade cleanup, so any paper that had gone through extraction (and therefore
    has a promoted ExtExperiment, provenance records, etc.) failed with the same
    FOREIGN KEY constraint IntegrityError delete_project used to hit."""
    proj, paper = _full_canonical_project(db, test_user)

    resp = client.delete(f"/api/projects/{proj.id}/papers/{paper.id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text
    assert db.query(Paper).filter(Paper.id == paper.id).first() is None
    # The project itself must survive a single-paper delete.
    assert db.query(Project).filter(Project.id == proj.id).first() is not None


def test_delete_project_requires_ownership(client, db, test_user, auth_headers):
    other = User(email="owner2@example.com", full_name="Owner 2",
                 hashed_password=test_user.hashed_password, is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    proj = Project(name="Not yours", owner_id=other.id, description="")
    db.add(proj)
    db.commit()
    db.refresh(proj)

    resp = client.delete(f"/api/projects/{proj.id}", headers=auth_headers)
    assert resp.status_code == 404
    assert db.query(Project).filter(Project.id == proj.id).first() is not None
