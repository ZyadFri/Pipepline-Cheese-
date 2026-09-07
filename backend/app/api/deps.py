from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.database import get_db
from app.db.models import Project, ProjectMember, User

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def project_scope(project_id: int, user: User, db: Session) -> Project:
    """Return the project if the user owns it or is a member; 404 otherwise.

    Always 404, never 403 - so a project ID can't be used to probe existence
    of projects the caller has no access to.
    """
    project = (
        db.query(Project)
        .outerjoin(
            ProjectMember,
            (ProjectMember.project_id == Project.id) & (ProjectMember.user_id == user.id),
        )
        .filter(
            Project.id == project_id,
            or_(Project.owner_id == user.id, ProjectMember.id.isnot(None)),
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def accessible_project_ids(user: User, db: Session) -> list[int]:
    """All project ids the user owns or is a member of - for routes where
    project_id is an optional filter rather than a required path param."""
    owned = db.query(Project.id).filter(Project.owner_id == user.id)
    member = db.query(ProjectMember.project_id).filter(ProjectMember.user_id == user.id)
    return [row[0] for row in owned.union(member).all()]
