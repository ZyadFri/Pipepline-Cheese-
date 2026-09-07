"""
Tests for the SSE workspace progress stream
(GET .../workspace/stream?since_seq=).

The endpoint replays persisted JobEvent rows (so a browser refresh
mid-processing sees the same history instead of the job appearing to
restart) and terminates with an `end` event once the job reaches a
terminal status and no events remain. These tests use an already-terminal
job so the generator's poll loop resolves immediately without needing to
sleep or run across threads.
"""
import json

from app.api.routes import extraction_workspace
from app.core.security import create_access_token, hash_password
from app.db.models import Job, JobEvent, Paper, Project, User


class _NonClosingSession:
    """The SSE endpoint deliberately opens its own SessionLocal() rather than
    reusing the request-scoped session (which closes before the generator
    finishes) — correct in production, but it means tests must repoint
    SessionLocal at the in-memory test database or the stream would silently
    poll the real dev database (finding nothing, never reaching a terminal
    status, looping until its 30-minute hard deadline)."""
    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def close(self):
        pass


def _seed_job_with_events(db, user, n_events=5, job_status="completed"):
    project = Project(name="Cheese Shelf-Life", owner_id=user.id)
    db.add(project)
    db.flush()

    paper = Paper(project_id=project.id, filename="p.pdf", original_name="paper.pdf",
                  file_path="/nonexistent/p.pdf", status="extracted")
    db.add(paper)
    db.flush()

    job = Job(project_id=project.id, paper_id=paper.id, job_type="workspace_extraction",
              status=job_status, created_by=user.id)
    db.add(job)
    db.flush()

    for i in range(1, n_events + 1):
        db.add(JobEvent(
            job_id=job.id, seq=i, event_type="chunk_done",
            message=f"chunk {i}", payload_json=json.dumps({"n": i}),
        ))
    db.commit()
    db.refresh(project)
    db.refresh(paper)
    db.refresh(job)
    return project, paper, job


def _parse_sse(text: str):
    """Return [(event_type, seq_or_None, data_dict), ...] in order."""
    frames = []
    for block in text.split("\n\n"):
        block = block.strip("\n")
        if not block or block.startswith(":"):
            continue
        event_type, seq, data = None, None, None
        for line in block.split("\n"):
            if line.startswith("event:"):
                event_type = line[len("event:"):].strip()
            elif line.startswith("id:"):
                seq = int(line[len("id:"):].strip())
            elif line.startswith("data:"):
                raw = line[len("data:"):].strip()
                data = json.loads(raw) if raw else {}
        if event_type:
            frames.append((event_type, seq, data))
    return frames


def test_events_persist_and_replay_in_order(client, auth_headers, db, test_user, monkeypatch):
    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    project, paper, job = _seed_job_with_events(db, test_user, n_events=5)

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/workspace/stream?since_seq=0",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    frames = _parse_sse(resp.text)
    chunk_frames = [f for f in frames if f[0] == "chunk_done"]
    assert [f[1] for f in chunk_frames] == [1, 2, 3, 4, 5]
    assert chunk_frames[0][2]["payload"]["n"] == 1
    assert frames[-1][0] == "end"


def test_since_seq_resumes_from_the_right_point(client, auth_headers, db, test_user, monkeypatch):
    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    project, paper, job = _seed_job_with_events(db, test_user, n_events=5)

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/workspace/stream?since_seq=3",
        headers=auth_headers,
    )
    frames = _parse_sse(resp.text)
    chunk_frames = [f for f in frames if f[0] == "chunk_done"]
    assert [f[1] for f in chunk_frames] == [4, 5]


def test_stream_requires_project_access(client, db, test_user, monkeypatch):
    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    project, paper, job = _seed_job_with_events(db, test_user, n_events=2)

    other = User(email="stream-other@example.com", full_name="Other",
                 hashed_password=hash_password("password123"), is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    other_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(other.id)})}"}

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/workspace/stream",
        headers=other_headers,
    )
    assert resp.status_code == 404


def test_stream_with_no_job_returns_no_job_event(client, auth_headers, db, test_user, monkeypatch):
    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    project = Project(name="Empty Project", owner_id=test_user.id)
    db.add(project)
    db.flush()
    paper = Paper(project_id=project.id, filename="p.pdf", original_name="paper.pdf",
                  file_path="/nonexistent/p.pdf", status="uploaded")
    db.add(paper)
    db.commit()
    db.refresh(project)
    db.refresh(paper)

    resp = client.get(
        f"/api/projects/{project.id}/papers/{paper.id}/workspace/stream",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    frames = _parse_sse(resp.text)
    assert frames[0][0] == "no_job"
