from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.seed import seed_technicians, seed_units
from ti_analytics.glpi.pipeline import run as run_pipeline

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/collect")
def trigger_collect(db: Session = Depends(get_db)):
    """Dispara a coleta GLPI -> raw -> silver -> gold -> scores sob demanda.
    Sincrono de proposito - coleta manual e o modo v1 (ver CLAUDE.md), o
    volume atual (~430 chamados) termina em minutos, nao horas."""
    counts = run_pipeline()
    seed_units(db)
    seed_technicians(db)
    return {"status": "ok", "counts": counts}
