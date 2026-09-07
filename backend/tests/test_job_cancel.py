"""
Cooperative job cancellation tests.

Cancel used to just flip Job.status to "cancelled" while the background
worker kept running to completion regardless. Cancel now sets a separate
cancel_requested flag that the worker polls between chunks; the endpoint
only flips status immediately for a job that hasn't started yet.
"""
from sqlalchemy.orm import sessionmaker

from app.api.routes.extraction_workspace import _is_cancelled
from app.db.models import Job, Project


def _make_job(db, user, status="running", project=None):
    if project is None:
        project = Project(name="Cheese Shelf-Life", owner_id=user.id)
        db.add(project)
        db.flush()
    job = Job(project_id=project.id, job_type="workspace_extraction",
              status=status, created_by=user.id)
    db.add(job)
    db.commit()
    db.refresh(job)
    return project, job


def test_cancel_sets_flag_not_status_for_running_job(client, auth_headers, db, test_user):
    _, job = _make_job(db, test_user, status="running")

    resp = client.post(f"/api/jobs/{job.id}/cancel", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "running"          # not flipped immediately
    assert body["cancel_requested"] is True

    db.refresh(job)
    assert job.status == "running"
    assert job.cancel_requested is True


def test_cancel_flips_status_immediately_for_queued_job(client, auth_headers, db, test_user):
    _, job = _make_job(db, test_user, status="queued")

    resp = client.post(f"/api/jobs/{job.id}/cancel", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_cannot_cancel_already_completed_job(client, auth_headers, db, test_user):
    _, job = _make_job(db, test_user, status="completed")

    resp = client.post(f"/api/jobs/{job.id}/cancel", headers=auth_headers)
    assert resp.status_code == 400


def test_cannot_cancel_partial_success_job(client, auth_headers, db, test_user):
    _, job = _make_job(db, test_user, status="partial_success")

    resp = client.post(f"/api/jobs/{job.id}/cancel", headers=auth_headers)
    assert resp.status_code == 400


def test_is_cancelled_visible_across_sessions(db, test_user):
    """The worker holds a long-lived session with the Job row already in its
    identity map. Without db.expire_all() inside _is_cancelled, a second
    session's write would never be observed by the first — this is the
    single most likely way cooperative cancellation silently doesn't work."""
    _, job = _make_job(db, test_user, status="running")

    OtherSession = sessionmaker(bind=db.get_bind())
    other_db = OtherSession()
    try:
        # First read via the worker's session establishes it in db's identity map.
        assert _is_cancelled(db, job.id) is False

        # A separate session (standing in for the API request's own session)
        # sets the flag and commits.
        other_job = other_db.query(Job).filter(Job.id == job.id).first()
        other_job.cancel_requested = True
        other_db.commit()

        # The worker's session must observe it on the very next check.
        assert _is_cancelled(db, job.id) is True
    finally:
        other_db.close()
