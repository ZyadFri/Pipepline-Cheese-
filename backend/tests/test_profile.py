"""
Tests for the user profile endpoints (app/api/routes/auth.py): profile field
updates and avatar upload/serve/delete.
"""
import base64
import io

import pytest

from app.api.routes import auth as auth_routes
from app.db.models import User

# A minimal valid 1x1 transparent PNG, used instead of a fixture file.
_TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


@pytest.fixture(autouse=True)
def _avatar_dir_in_tmp(tmp_path, monkeypatch):
    """Redirect avatar storage to a tmp dir so tests never write into the
    real backend/uploads/avatars/ directory."""
    monkeypatch.setattr(auth_routes, "AVATAR_DIR", tmp_path / "avatars")


def test_update_profile_fields(client, auth_headers, db, test_user):
    resp = client.patch(
        "/api/auth/me",
        json={"full_name": "Jane Updated", "bio": "Food scientist.", "job_title": "PhD Candidate", "organization": "McGill"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["full_name"] == "Jane Updated"
    assert body["bio"] == "Food scientist."
    assert body["job_title"] == "PhD Candidate"
    assert body["organization"] == "McGill"
    assert body["has_avatar"] is False


def test_update_profile_rejects_empty_name(client, auth_headers, db, test_user):
    resp = client.patch("/api/auth/me", json={"full_name": "   "}, headers=auth_headers)
    assert resp.status_code == 400


def test_update_profile_partial_update_leaves_other_fields_untouched(client, auth_headers, db, test_user):
    client.patch("/api/auth/me", json={"bio": "Original bio"}, headers=auth_headers)
    resp = client.patch("/api/auth/me", json={"job_title": "Researcher"}, headers=auth_headers)
    body = resp.json()
    assert body["bio"] == "Original bio"
    assert body["job_title"] == "Researcher"


def test_avatar_upload_and_fetch(client, auth_headers, db, test_user):
    resp = client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.png", io.BytesIO(_TINY_PNG), "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["has_avatar"] is True

    img_resp = client.get("/api/auth/me/avatar", headers=auth_headers)
    assert img_resp.status_code == 200
    assert img_resp.headers["content-type"] == "image/png"
    assert img_resp.content == _TINY_PNG


def test_avatar_upload_rejects_bad_content_type(client, auth_headers, db, test_user):
    resp = client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.txt", io.BytesIO(b"not an image"), "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_avatar_upload_rejects_oversized_file(client, auth_headers, db, test_user):
    huge = b"\x00" * (6 * 1024 * 1024)
    resp = client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.png", io.BytesIO(huge), "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 413


def test_avatar_delete(client, auth_headers, db, test_user):
    client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.png", io.BytesIO(_TINY_PNG), "image/png")},
        headers=auth_headers,
    )
    resp = client.delete("/api/auth/me/avatar", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["has_avatar"] is False

    img_resp = client.get("/api/auth/me/avatar", headers=auth_headers)
    assert img_resp.status_code == 404


def test_get_avatar_when_none_set_returns_404(client, auth_headers, db, test_user):
    resp = client.get("/api/auth/me/avatar", headers=auth_headers)
    assert resp.status_code == 404


def test_another_user_can_view_this_users_avatar(client, auth_headers, db, test_user):
    from app.core.security import create_access_token, hash_password

    client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.png", io.BytesIO(_TINY_PNG), "image/png")},
        headers=auth_headers,
    )

    other = User(email="viewer@example.com", full_name="Viewer",
                 hashed_password=hash_password("password123"), is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    other_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(other.id)})}"}

    resp = client.get(f"/api/auth/users/{test_user.id}/avatar", headers=other_headers)
    assert resp.status_code == 200
    assert resp.content == _TINY_PNG


def test_avatar_endpoints_require_auth(client, db, test_user):
    resp = client.get("/api/auth/me/avatar")
    assert resp.status_code == 401
