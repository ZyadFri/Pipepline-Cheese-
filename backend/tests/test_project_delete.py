"""
Regression test for a real bug: deleting a project that had gone through
extraction always failed with a 500 (sqlite3.IntegrityError: FOREIGN KEY
constraint failed). The canonical Study -> Experiment -> TreatmentArm ->
Observation tree cascades correctly via ORM relationships, but several side
tables (ExtExperiment.promoted_experiment_id, ProvenanceRecord, ValidationIssue,
ImputationProposal, TrajectoryDefinition, ReviewAssignment, ExtractedRow's
optional canonical_study_id) hold plain foreign keys straight into that tree
with no cascade at all, so SQLite's FK enforcement rejected the delete as soon
as any of them held a live row.
"""

from app.db.models import (
    Experiment, ExtExperiment, ExtractedRow, ImputationProposal, Job, Observation,
    Paper, Project, ProvenanceRecord, ReviewAssignment, Study, TreatmentArm,
    TrajectoryDefinition, User, ValidationIssue,
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

    db.commit()
    return proj


def test_delete_project_with_full_canonical_tree(client, db, test_user, auth_headers):
    proj = _full_canonical_project(db, test_user)

    resp = client.delete(f"/api/projects/{proj.id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text
    assert db.query(Project).filter(Project.id == proj.id).first() is None


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
