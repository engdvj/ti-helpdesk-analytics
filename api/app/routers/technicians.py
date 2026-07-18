from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.technician import Technician
from api.app.schemas.technician import TechnicianOut

router = APIRouter(prefix="/technicians", tags=["technicians"])


@router.get("", response_model=list[TechnicianOut])
def list_technicians(
    papel: str | None = Query(None, description="filtra por coordenadora/tatico/plantonista"),
    include_inactive: bool = Query(False, description="inclui tecnicos inativos (uso do admin)"),
    unidade_slug: str | None = Query(None, description="filtra pela lotacao do tecnico"),
    db: Session = Depends(get_db),
):
    stmt = select(Technician)
    if not include_inactive:
        stmt = stmt.where(Technician.ativo.is_(True))
    if papel:
        stmt = stmt.where(Technician.papel == papel)
    if unidade_slug:
        stmt = stmt.where(or_(Technician.unidade_slug == unidade_slug, Technician.unidade_slug.is_(None)))
    return db.scalars(stmt.order_by(Technician.nome_completo)).all()
