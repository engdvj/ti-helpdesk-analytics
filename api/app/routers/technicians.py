from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.technician import Technician
from api.app.schemas.technician import TechnicianOut

router = APIRouter(prefix="/technicians", tags=["technicians"])


@router.get("", response_model=list[TechnicianOut])
def list_technicians(
    papel: str | None = Query(None, description="filtra por coordenadora/tatico/plantonista"),
    db: Session = Depends(get_db),
):
    stmt = select(Technician)
    if papel:
        stmt = stmt.where(Technician.papel == papel)
    return db.scalars(stmt.order_by(Technician.nome_completo)).all()
