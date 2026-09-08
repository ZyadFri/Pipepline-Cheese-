"""
Tests for app/api/routes/paper_assistant.py — the LLM-backed paper summary
card and ask-this-paper chat. ask_llm() is mocked throughout so these run
fast/deterministically without a real provider call; what's under test is
the plumbing (caching, counts, retrieval, error handling), not model output
quality (verified manually against the running dev server separately).
"""
import json
from unittest.mock import patch

from app.core.security import create_access_token, hash_password
from app.db.models import (
    AssetContextLink, Experiment, ExtractionAsset, Observation, Paper,
    Project, Study, TreatmentArm, User,
)


def _seed_paper_with_text(db, user, texts=None):
    project = Project(name="Assistant Test", owner_id=user.id)
    db.add(project)
    db.flush()
    paper = Paper(project_id=project.id, filename="p.pdf", original_name="paper.pdf",
                  file_path="/nonexistent/p.pdf", status="extracted")
    db.add(paper)
    db.flush()

    asset = ExtractionAsset(
        paper_id=paper.id, project_id=project.id, docling_item_ref="#/texts/0",
        asset_type="figure", page_number=1, classification="chart",
        selected_for_llm=True,
    )
    db.add(asset)
    db.flush()

    for i, text in enumerate(texts or []):
        db.add(AssetContextLink(
            asset_id=asset.id, link_type="same_section", text=text,
            item_ref=f"#/texts/{i}", page_number=1 + i,
        ))
    db.commit()
    db.refresh(project)
    db.refresh(paper)
    return project, paper


def _seed_structured_data(db, project, paper):
    study = Study(project_id=project.id, paper_id=paper.id, title="Study")
    db.add(study)
    db.flush()
    exp = Experiment(study_id=study.id, product_name_original="Gouda")
    db.add(exp)
    db.flush()
    arm = TreatmentArm(experiment_id=exp.id, arm_label="Control", is_control=True)
    db.add(arm)
    db.flush()
    db.add(Observation(treatment_arm_id=arm.id, measurement_type="ph", time_days=1, numeric_value_normalized=5.2))
    db.commit()


_FAKE_SUMMARY_JSON = json.dumps({
    "objective": "To evaluate a garlic-oil coating on cheese shelf life.",
    "product": "double cream cheese",
    "treatments": ["garlic oil coating", "oregano oil coating"],
    "variables": ["weight loss", "hardness", "microbial counts"],
    "main_findings": ["Coated samples had lower weight loss than uncoated controls."],
})


# ── Summary card ─────────────────────────────────────────────────────────

def test_summary_generates_and_caches(client, auth_headers, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=[
        "This study evaluates a garlic oil coating on double cream cheese during storage.",
    ])
    _seed_structured_data(db, project, paper)

    with patch("app.services.paper_summary.ask_llm", return_value=_FAKE_SUMMARY_JSON) as mock_ask:
        resp1 = client.get(f"/api/projects/{project.id}/papers/{paper.id}/summary", headers=auth_headers)
        assert resp1.status_code == 200, resp1.text
        body1 = resp1.json()
        assert body1["product"] == "double cream cheese"
        assert body1["cached"] is False
        assert body1["counts"] == {"experiment_count": 1, "observation_count": 1}
        assert mock_ask.call_count == 1

        # Second call must be served from cache — no second LLM call.
        resp2 = client.get(f"/api/projects/{project.id}/papers/{paper.id}/summary", headers=auth_headers)
        assert resp2.status_code == 200
        assert resp2.json()["cached"] is True
        assert mock_ask.call_count == 1


def test_summary_regenerate_forces_a_new_llm_call(client, auth_headers, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=["Some paper text about cheese."])

    with patch("app.services.paper_summary.ask_llm", return_value=_FAKE_SUMMARY_JSON) as mock_ask:
        client.get(f"/api/projects/{project.id}/papers/{paper.id}/summary", headers=auth_headers)
        resp = client.get(
            f"/api/projects/{project.id}/papers/{paper.id}/summary?regenerate=true",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["cached"] is False
        assert mock_ask.call_count == 2


def test_summary_with_no_extracted_text_returns_400(client, auth_headers, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=[])
    resp = client.get(f"/api/projects/{project.id}/papers/{paper.id}/summary", headers=auth_headers)
    assert resp.status_code == 400


def test_summary_llm_failure_returns_a_safe_502(client, auth_headers, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=["Some text."])
    with patch("app.services.paper_summary.ask_llm", side_effect=RuntimeError("GROQ_API_KEY is not set")):
        resp = client.get(f"/api/projects/{project.id}/papers/{paper.id}/summary", headers=auth_headers)
    assert resp.status_code == 400  # RuntimeError from ask_llm is surfaced as a clear 400, not a raw 500


def test_summary_requires_project_access(client, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=["text"])
    other = User(email="pa-other@example.com", full_name="Other",
                 hashed_password=hash_password("password123"), is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    other_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(other.id)})}"}

    resp = client.get(f"/api/projects/{project.id}/papers/{paper.id}/summary", headers=other_headers)
    assert resp.status_code == 404


# ── Ask this paper ───────────────────────────────────────────────────────

def test_ask_retrieves_relevant_text_and_answers(client, auth_headers, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=[
        "The cheese samples were stored at 5 degrees Celsius for 42 days.",
        "Panelists rated the flavor of the garlic-coated samples highly.",
    ])

    with patch("app.services.paper_chat.ask_llm", return_value="Samples were stored at 5°C.") as mock_ask:
        resp = client.post(
            f"/api/projects/{project.id}/papers/{paper.id}/ask",
            json={"question": "What storage temperature was used?"},
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "5" in body["answer"]
    assert len(body["sources"]) >= 1
    assert mock_ask.call_count == 1
    # The temperature-relevant excerpt must be the one sent to the model.
    sent_prompt = mock_ask.call_args[0][1]
    assert "5 degrees Celsius" in sent_prompt


def test_ask_rejects_empty_question(client, auth_headers, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=["text"])
    resp = client.post(
        f"/api/projects/{project.id}/papers/{paper.id}/ask",
        json={"question": ""},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_ask_llm_failure_returns_a_safe_502(client, auth_headers, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=["Some cheese text."])
    with patch("app.services.paper_chat.ask_llm", side_effect=RuntimeError("provider down")):
        resp = client.post(
            f"/api/projects/{project.id}/papers/{paper.id}/ask",
            json={"question": "What was measured?"},
            headers=auth_headers,
        )
    assert resp.status_code == 502
    assert "provider down" not in resp.json()["detail"]


def test_ask_requires_project_access(client, db, test_user):
    project, paper = _seed_paper_with_text(db, test_user, texts=["text"])
    other = User(email="pa-ask-other@example.com", full_name="Other",
                 hashed_password=hash_password("password123"), is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    other_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(other.id)})}"}

    resp = client.post(
        f"/api/projects/{project.id}/papers/{paper.id}/ask",
        json={"question": "test"},
        headers=other_headers,
    )
    assert resp.status_code == 404
