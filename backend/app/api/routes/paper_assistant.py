"""
paper_assistant.py — LLM-backed, opt-in paper features: the auto-generated
summary card and the "ask this paper" mini-chat. Kept separate from the
deterministic extraction routes: these two features are read-only sugar on
top of already-extracted text/data, never part of the core extraction
pipeline, and can fail (provider down, no key configured) without affecting
extraction itself.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, project_scope
from app.db.database import get_db
from app.db.models import Paper, Project, User
from app.services.paper_chat import answer_question_about_paper
from app.services.paper_summary import get_or_generate_summary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects/{project_id}/papers/{paper_id}", tags=["paper-assistant"])


def _require_project(project_id: int, user: User, db: Session) -> Project:
    return project_scope(project_id, user, db)


def _get_paper_or_404(project_id: int, paper_id: int, db: Session) -> Paper:
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.project_id == project_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    return paper


@router.get("/summary")
def get_paper_summary(
    project_id: int,
    paper_id: int,
    regenerate: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    paper = _get_paper_or_404(project_id, paper_id, db)
    try:
        return get_or_generate_summary(paper, project_id, db, regenerate=regenerate, user_id=user.id)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
    except Exception:
        logger.error("Paper summary generation failed for paper %s", paper_id, exc_info=True)
        raise HTTPException(502, "Could not generate the paper summary right now. Please try again shortly.")


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)


@router.post("/ask")
def ask_paper(
    project_id: int,
    paper_id: int,
    body: AskRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_project(project_id, user, db)
    _get_paper_or_404(project_id, paper_id, db)
    try:
        return answer_question_about_paper(
            paper_id, body.question.strip(), db, user_id=user.id, project_id=project_id,
        )
    except Exception:
        logger.error("Ask-this-paper failed for paper %s", paper_id, exc_info=True)
        raise HTTPException(502, "Could not answer that question right now. Please try again shortly.")
