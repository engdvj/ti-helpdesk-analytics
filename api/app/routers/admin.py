from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.seed import seed_technicians, seed_units
from ti_analytics.analytics.scores import TECH_SCORE_WEIGHTS, load_weights, save_weights_config
from ti_analytics.glpi.pipeline import run as run_pipeline

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(
    x_admin_username: str = Header(default=""),
    x_admin_password: str = Header(default=""),
) -> None:
    """Trava simples por usuario+senha compartilhados (ADMIN_USERNAME/
    ADMIN_PASSWORD no .env) - nao e conta de usuario de verdade, so um
    portao a mais antes de disparar coleta ou mudar peso de score. Rede ja e
    interna do hospital (ver CLAUDE.md)."""
    expected_user = os.getenv("ADMIN_USERNAME")
    expected_pass = os.getenv("ADMIN_PASSWORD")
    if not expected_user or not expected_pass:
        raise HTTPException(500, "ADMIN_USERNAME/ADMIN_PASSWORD nao configurados no servidor")
    if x_admin_username != expected_user or x_admin_password != expected_pass:
        raise HTTPException(401, "usuario ou senha de admin invalidos")


@router.post("/verify", dependencies=[Depends(require_admin)])
def verify_admin():
    """So valida a senha (usado pelo frontend pra desbloquear o modo admin
    sem disparar nada pesado)."""
    return {"ok": True}


@router.post("/collect", dependencies=[Depends(require_admin)])
def trigger_collect(db: Session = Depends(get_db)):
    """Dispara a coleta GLPI -> raw -> silver -> gold -> scores sob demanda.
    Sincrono de proposito - coleta manual e o modo v1 (ver CLAUDE.md), o
    volume atual (~430 chamados) termina em minutos, nao horas."""
    counts = run_pipeline()
    seed_units(db)
    seed_technicians(db)
    return {"status": "ok", "counts": counts}


@router.get("/weights")
def get_weights():
    """Leitura publica - pesos de score nao sao segredo, so a escrita e
    protegida."""
    return load_weights()


class WeightsUpdate(BaseModel):
    score_volume: float
    score_velocidade_resolucao: float
    score_complexidade: float
    score_velocidade_resposta: float
    score_abrangencia: float

    @field_validator("*")
    @classmethod
    def _non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("peso nao pode ser negativo")
        return v


@router.put("/weights", dependencies=[Depends(require_admin)])
def update_weights(payload: WeightsUpdate):
    weights = payload.model_dump()
    total = sum(weights.values())
    if abs(total - 1.0) > 0.01:
        raise HTTPException(400, f"pesos devem somar 1.0 (soma atual: {total:.3f})")
    save_weights_config(weights)
    return weights


@router.post("/weights/reset", dependencies=[Depends(require_admin)])
def reset_weights():
    save_weights_config(TECH_SCORE_WEIGHTS)
    return TECH_SCORE_WEIGHTS
