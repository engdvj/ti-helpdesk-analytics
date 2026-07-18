from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.unit import Unit
from api.app.schemas.unit import UnitOut

router = APIRouter(prefix="/units", tags=["units"])


@router.get("", response_model=list[UnitOut])
def list_units(db: Session = Depends(get_db)):
    return db.scalars(select(Unit).order_by(Unit.ordem, Unit.nome)).all()
