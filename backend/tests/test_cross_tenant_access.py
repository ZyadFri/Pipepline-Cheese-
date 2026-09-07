"""
Cross-tenant authorization tests.

Regression guard for a real, previously-exploitable hole: most canonical-data
routes accepted `project_id` (or an entity id chaining back to a project) with
no ownership check, so any authenticated user could read/write another user's
project data by guessing IDs. Every route below must 404 for a foreign user
(never leak existence via 403), and a ProjectMember row must actually grant
access rather than being purely decorative.
"""

import pytest

from app.core.security import create_access_token, hash_password
from app.db.models import (
    Experiment, Job, Observation, Project, ProjectMember, Study,
    ThresholdDefinition, TreatmentArm, User,
)


@pytest.fixture
def second_user(db) -> User:
    user = User(
        email="other@example.com",
        full_name="Other User",
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def second_auth_headers(second_user: User) -> dict:
    token = create_access_token({"sub": str(second_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_project_full(db, second_user: User):
    """A project owned by second_user, carrying one row in each canonical
    table plus a Job — used to prove test_user (the default fixture user)
    cannot read or write into it."""
    proj = Project(name="Other User's Project", owner_id=second_user.id, description="")
    db.add(proj)
    db.commit()
    db.refresh(proj)

    study = Study(project_id=proj.id, title="Secret Study", authors_json="[]",
                   created_by=second_user.id, updated_by=second_user.id)
    db.add(study)
    db.flush()

    exp = Experiment(study_id=study.id, product_name_normalized="Secret Cheese",
                      created_by=second_user.id, updated_by=second_user.id)
    db.add(exp)
    db.flush()

    arm = TreatmentArm(experiment_id=exp.id, arm_label="Control", is_control=True,
                        combination_treatments_json="[]", extra_treatment_json="{}",
                        created_by=second_user.id)
    db.add(arm)
    db.flush()

    obs = Observation(treatment_arm_id=arm.id, measurement_type="ph",
                       numeric_value_original=6.5, created_by=second_user.id,
                       updated_by=second_user.id)
    db.add(obs)

    job = Job(project_id=proj.id, job_type="workspace_extraction", status="running")
    db.add(job)

    threshold = ThresholdDefinition(project_id=proj.id, name="Yeast limit",
                                     measurement_type="yeast_count",
                                     threshold_value=4.0, created_by=second_user.id)
    db.add(threshold)

    db.commit()
    db.refresh(study)
    db.refresh(exp)
    db.refresh(arm)
    db.refresh(obs)
    db.refresh(job)
    db.refresh(threshold)

    return {
        "project": proj, "study": study, "experiment": exp,
        "arm": arm, "observation": obs, "job": job, "threshold": threshold,
    }


class TestForeignProjectIsInvisible:
    """test_user (not a member/owner of other_project_full) must get 404
    everywhere, never the other user's data and never a 403 (which would
    confirm the project's existence)."""

    def test_studies_list_by_project_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(
            f"/api/studies?project_id={other_project_full['project'].id}",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_study_by_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(f"/api/studies/{other_project_full['study'].id}", headers=auth_headers)
        assert resp.status_code == 404

    def test_experiment_by_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(
            f"/api/experiments/{other_project_full['experiment'].id}", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_treatment_arm_by_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(
            f"/api/treatment-arms/{other_project_full['arm'].id}", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_observation_by_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(
            f"/api/observations/{other_project_full['observation'].id}", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_observations_list_never_contains_foreign_rows(
        self, client, auth_headers, other_project_full,
    ):
        resp = client.get("/api/observations", headers=auth_headers)
        assert resp.status_code == 200
        ids = [o["id"] for o in resp.json()]
        assert other_project_full["observation"].id not in ids

    def test_jobs_list_by_project_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(
            f"/api/jobs?project_id={other_project_full['project'].id}", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_job_by_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(f"/api/jobs/{other_project_full['job'].id}", headers=auth_headers)
        assert resp.status_code == 404

    def test_cannot_cancel_foreign_job(self, client, auth_headers, other_project_full):
        resp = client.post(
            f"/api/jobs/{other_project_full['job'].id}/cancel", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_audit_list_by_project_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(
            f"/api/audit?project_id={other_project_full['project'].id}", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_threshold_by_id_404s(self, client, auth_headers, other_project_full):
        resp = client.get(
            f"/api/thresholds/{other_project_full['threshold'].id}", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_project_assets_list_404s(self, client, auth_headers, other_project_full):
        """extraction_workspace.list_project_assets had NO guard at all before this fix."""
        resp = client.get(
            f"/api/projects/{other_project_full['project'].id}/assets", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_cannot_create_experiment_under_foreign_study(
        self, client, auth_headers, other_project_full,
    ):
        resp = client.post(
            "/api/experiments",
            json={"study_id": other_project_full["study"].id, "product_name_normalized": "x"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_cannot_create_observation_under_foreign_arm(
        self, client, auth_headers, other_project_full,
    ):
        resp = client.post(
            "/api/observations",
            json={"treatment_arm_id": other_project_full["arm"].id, "measurement_type": "ph"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_bulk_approve_ignores_foreign_observation_ids(
        self, client, auth_headers, other_project_full, db,
    ):
        resp = client.post(
            "/api/observations/bulk-approve",
            json={"observation_ids": [other_project_full["observation"].id]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []
        db.refresh(other_project_full["observation"])
        assert other_project_full["observation"].review_status != "approved"


class TestProjectMemberGrantsRealAccess:
    """Regression guard: adding a ProjectMember row must actually grant
    access, not just show up decoratively on the Team page."""

    def test_member_can_read_studies(self, client, auth_headers, test_user, other_project_full, db):
        db.add(ProjectMember(
            project_id=other_project_full["project"].id,
            user_id=test_user.id,
            role="viewer",
        ))
        db.commit()

        resp = client.get(
            f"/api/studies?project_id={other_project_full['project'].id}", headers=auth_headers
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["id"] == other_project_full["study"].id

    def test_member_can_read_study_by_id(
        self, client, auth_headers, test_user, other_project_full, db,
    ):
        db.add(ProjectMember(
            project_id=other_project_full["project"].id,
            user_id=test_user.id,
            role="viewer",
        ))
        db.commit()

        resp = client.get(
            f"/api/studies/{other_project_full['study'].id}", headers=auth_headers
        )
        assert resp.status_code == 200
