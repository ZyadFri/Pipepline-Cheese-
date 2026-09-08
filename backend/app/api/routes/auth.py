from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import UPLOAD_PATH
from app.core.security import hash_password, verify_password, create_access_token
from app.db.database import get_db
from app.db.models import User
from app.schemas.auth import (
    LoginRequest, ProfileUpdateRequest, RegisterRequest, TokenResponse, UserOut,
)
from app.api.deps import get_current_user
from app.services.llm_usage import summarize_usage_for_user

router = APIRouter(prefix="/auth", tags=["auth"])

AVATAR_DIR = UPLOAD_PATH / "avatars"
_AVATAR_CONTENT_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_MAX_AVATAR_BYTES = 5 * 1024 * 1024


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.full_name is not None:
        stripped = body.full_name.strip()
        if not stripped:
            raise HTTPException(400, "Full name cannot be empty")
        current_user.full_name = stripped
    if body.bio is not None:
        current_user.bio = body.bio.strip() or None
    if body.job_title is not None:
        current_user.job_title = body.job_title.strip() or None
    if body.organization is not None:
        current_user.organization = body.organization.strip() or None
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return current_user


def _remove_existing_avatar(user: User) -> None:
    if user.avatar_path:
        old = Path(user.avatar_path)
        if old.exists():
            old.unlink(missing_ok=True)


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in _AVATAR_CONTENT_TYPES:
        raise HTTPException(400, "Only PNG, JPEG, or WebP images are allowed")
    content = await file.read()
    if len(content) > _MAX_AVATAR_BYTES:
        raise HTTPException(413, "Avatar image must be smaller than 5 MB")
    if not content:
        raise HTTPException(400, "Uploaded file is empty")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    _remove_existing_avatar(current_user)

    ext = _AVATAR_CONTENT_TYPES[file.content_type]
    dest = AVATAR_DIR / f"user_{current_user.id}.{ext}"
    with open(dest, "wb") as f:
        f.write(content)

    current_user.avatar_path = str(dest)
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me/avatar", response_model=UserOut)
def delete_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _remove_existing_avatar(current_user)
    current_user.avatar_path = None
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me/avatar", status_code=status.HTTP_200_OK)
def get_my_avatar(current_user: User = Depends(get_current_user)):
    return _serve_avatar(current_user)


def _serve_avatar(user: User):
    if not user.avatar_path or not Path(user.avatar_path).exists():
        raise HTTPException(404, "No avatar set for this user")
    return FileResponse(user.avatar_path, headers={"Cache-Control": "max-age=3600"})


@router.get("/me/llm-usage")
def get_my_llm_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """LLM/vision API consumption for the current user: total calls and
    tokens, a breakdown by model and by feature, recent activity, and — only
    where the provider's response actually included it — the most recent
    rate-limit snapshot per provider. There is no "total quota remaining"
    figure here: no provider exposes an account credit balance on the same
    endpoint this app calls for chat completions, so showing one would mean
    making it up."""
    return summarize_usage_for_user(db, current_user.id)


@router.get("/users/{user_id}/avatar")
def get_user_avatar(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any authenticated user can view another user's avatar — it's a plain
    profile picture, not sensitive data, and other pages (Team, audit
    history, comments) need to render teammates' avatars too."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    return _serve_avatar(target)
