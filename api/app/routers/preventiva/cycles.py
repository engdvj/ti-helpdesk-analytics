from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.maintenance_cycle import MaintenanceCycle
from api.app.models.maintenance_cycle_item import MaintenanceCycleItem
from api.app.routers.auth import require_session
from api.app.routers.preventiva._shared import require_admin_session, require_cycle_manager
from api.app.schemas.maintenance_cycle import CycleCreate, CycleOut, CyclePage, PlanningChecklistMark
from api.app.schemas.maintenance_cycle_item import AddItemRequest, CycleItemOut
from api.app.services import ciclos
from api.app.services.ciclos import (
    ComputerAlreadyInOpenCycleError,
    Prioridade,
    TransitionPreconditionError,
)

router = APIRouter(prefix="/preventiva/cycles", tags=["preventiva"])


class CycleDetailOut(CycleOut):
    itens: list[CycleItemOut]


@router.post("", response_model=CycleOut, status_code=201, dependencies=[Depends(require_admin_session)])
def create_cycle(payload: CycleCreate, db: Session = Depends(get_db)):
    try:
        return ciclos.criar_ciclo(
            db,
            nome=payload.nome,
            data_inicio=payload.data_inicio,
            data_prevista_encerramento=payload.data_prevista_encerramento,
            responsavel_id=payload.responsavel_id,
            intervalo_alta_meses=payload.intervalo_alta_meses,
            intervalo_normal_meses=payload.intervalo_normal_meses,
            intervalo_baixa_meses=payload.intervalo_baixa_meses,
        )
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/{ciclo_id}", dependencies=[Depends(require_admin_session)])
def delete_cycle(ciclo_id: int, db: Session = Depends(get_db)):
    """Hard delete do ciclo + itens (requisito: "hard delete mesmo")."""
    ciclo = db.get(MaintenanceCycle, ciclo_id)
    if ciclo is None:
        raise HTTPException(404, "ciclo não encontrado")
    ciclos.excluir_ciclo(db, ciclo)
    return {"ok": True}


@router.get("", response_model=CyclePage, dependencies=[Depends(require_session)])
def list_cycles(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=5, le=100),
    status_filter: Literal["planejamento", "encerrado"] | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    filters = []
    if status_filter is not None:
        filters.append(MaintenanceCycle.status == status_filter)

    count_query = select(func.count()).select_from(MaintenanceCycle)
    rows_query = select(MaintenanceCycle)
    if filters:
        count_query = count_query.where(*filters)
        rows_query = rows_query.where(*filters)

    total = int(db.scalar(count_query) or 0)
    total_pages = max(1, (total + page_size - 1) // page_size)
    safe_page = min(page, total_pages)
    items = list(
        db.scalars(
            rows_query.order_by(MaintenanceCycle.criado_em.desc())
            .offset((safe_page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return {"items": items, "page": safe_page, "page_size": page_size, "total": total, "total_pages": total_pages}


@router.get("/{ciclo_id}", response_model=CycleDetailOut, dependencies=[Depends(require_session)])
def get_cycle(ciclo_id: int, db: Session = Depends(get_db)):
    ciclo = db.get(MaintenanceCycle, ciclo_id)
    if ciclo is None:
        raise HTTPException(404, "ciclo não encontrado")
    itens = db.scalars(
        select(MaintenanceCycleItem).where(MaintenanceCycleItem.ciclo_id == ciclo_id).order_by(MaintenanceCycleItem.id)
    ).all()
    return CycleDetailOut(**CycleOut.model_validate(ciclo).model_dump(), itens=list(itens))


@router.post("/{ciclo_id}/items", response_model=CycleItemOut, status_code=201)
def add_item(ciclo_id: int, payload: AddItemRequest, ciclo: MaintenanceCycle = Depends(require_cycle_manager), db: Session = Depends(get_db)):
    try:
        return ciclos.adicionar_item(
            db, ciclo,
            computador_id=payload.computador_id,
            prioridade=Prioridade(payload.prioridade),
            tecnico_id=payload.tecnico_id,
        )
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ComputerAlreadyInOpenCycleError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.patch("/{ciclo_id}/planning-checklist", response_model=CycleOut)
def mark_planning_checklist(
    ciclo_id: int,
    payload: PlanningChecklistMark,
    ciclo: MaintenanceCycle = Depends(require_cycle_manager),
    current=Depends(require_session),
    db: Session = Depends(get_db),
):
    try:
        return ciclos.marcar_item_planejamento(db, ciclo, payload.indice, payload.ok, current.nome_completo or "")
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/{ciclo_id}/close", response_model=CycleOut)
def close_cycle(ciclo_id: int, ciclo: MaintenanceCycle = Depends(require_cycle_manager), db: Session = Depends(get_db)):
    try:
        return ciclos.fechar_ciclo(db, ciclo)
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc
