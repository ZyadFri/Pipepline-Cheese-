"""Normalization mappings CRUD + apply endpoint."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import accessible_project_ids, get_current_user, project_scope
from app.db.database import get_db
from app.db.models import NormalizationMapping, User
from app.schemas.canonical import NormalizationMappingCreate, NormalizationMappingOut

router = APIRouter(prefix="/normalization", tags=["normalization"])


@router.get("/mappings", response_model=list[NormalizationMappingOut])
def list_mappings(
    project_id: Optional[int] = Query(None),
    mapping_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(NormalizationMapping)
    if project_id is not None:
        project_scope(project_id, current_user, db)
        query = query.filter(
            (NormalizationMapping.project_id == project_id) |
            (NormalizationMapping.project_id == None)
        )
    else:
        query = query.filter(
            NormalizationMapping.project_id.in_(accessible_project_ids(current_user, db))
            | (NormalizationMapping.project_id == None)
        )
    if mapping_type:
        query = query.filter(NormalizationMapping.mapping_type == mapping_type)
    if q:
        query = query.filter(NormalizationMapping.original_term.ilike(f"%{q}%"))
    return query.order_by(NormalizationMapping.mapping_type, NormalizationMapping.original_term)\
                .offset(skip).limit(limit).all()


@router.post("/mappings", response_model=NormalizationMappingOut, status_code=status.HTTP_201_CREATED)
def create_mapping(
    payload: NormalizationMappingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.project_id is not None:
        project_scope(payload.project_id, current_user, db)
    existing = (db.query(NormalizationMapping)
                  .filter_by(project_id=payload.project_id,
                              mapping_type=payload.mapping_type,
                              original_term=payload.original_term)
                  .first())
    if existing:
        raise HTTPException(status_code=409, detail="Mapping already exists")
    m = NormalizationMapping(**payload.model_dump(), created_by=current_user.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = db.query(NormalizationMapping).filter(NormalizationMapping.id == mapping_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Mapping not found")
    if m.project_id is not None and m.project_id not in accessible_project_ids(current_user, db):
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(m)
    db.commit()


@router.post("/apply/{project_id}")
def apply_normalization(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger normalization service to apply all mappings to unapplied entities."""
    project_scope(project_id, current_user, db)
    from app.services.normalization import run_normalization
    result = run_normalization(project_id, db)
    return {"applied": result}
