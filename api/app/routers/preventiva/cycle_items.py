from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.maintenance_cycle import MaintenanceCycle
from api.app.models.maintenance_cycle_item import MaintenanceCycleItem
from api.app.routers.auth import CurrentIdentity, require_session
from api.app.routers.preventiva._shared import require_cycle_manager, require_item_actor, require_item_executor
from api.app.schemas.maintenance_cycle_item import CycleItemOut, ExecuteRequest, ReconfirmRequest, RescheduleRequest, ScheduleRequest
from api.app.services import ciclos
from api.app.services.ciclos import InvalidTransitionError, Resultado, TransitionPreconditionError

router = APIRouter(prefix="/preventiva/cycles/{ciclo_id}/items", tags=["preventiva"])


def _item_in_cycle(item: MaintenanceCycleItem, ciclo_id: int) -> MaintenanceCycleItem:
    if item.ciclo_id != ciclo_id:
        raise HTTPException(404, "item não pertence a este ciclo")
    return item


@router.post("/{item_id}/schedule", response_model=CycleItemOut)
def schedule_item(
    ciclo_id: int,
    item_id: int,
    payload: ScheduleRequest,
    ciclo: MaintenanceCycle = Depends(require_cycle_manager),
    db: Session = Depends(get_db),
):
    item = db.get(MaintenanceCycleItem, item_id)
    if item is None:
        raise HTTPException(404, "item não encontrado")
    _item_in_cycle(item, ciclo_id)
    try:
        return ciclos.confirmar_item(db, item, data_agendada=payload.data_agendada, tecnico_id=payload.tecnico_id)
    except InvalidTransitionError as exc:
        raise HTTPException(422, str(exc)) from exc
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/{item_id}/reconfirm", response_model=CycleItemOut)
def reconfirm_item(
    ciclo_id: int,
    payload: ReconfirmRequest,
    item: MaintenanceCycleItem = Depends(require_item_actor),
    db: Session = Depends(get_db),
):
    _item_in_cycle(item, ciclo_id)
    try:
        return ciclos.reconfirmar_item(db, item, marcas=payload.marcas)
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/{item_id}/execute", response_model=CycleItemOut)
def execute_item(
    ciclo_id: int,
    payload: ExecuteRequest,
    item: MaintenanceCycleItem = Depends(require_item_executor),
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
):
    """Tecnico so preenche enquanto o item ainda nao foi finalizado
    (Confirmado); depois de Concluido/Pendente, so o admin edita - requisito
    explicito do usuario ("tecnico nao pode editar, admin sim")."""
    _item_in_cycle(item, ciclo_id)
    if item.status in ("concluido", "pendente") and current.subject_type != "admin":
        raise HTTPException(403, "checklist já finalizado - só o admin pode editar")
    try:
        return ciclos.executar_item(
            db,
            item,
            itens=payload.itens,
            observacoes=payload.observacoes,
            resultado=Resultado(payload.resultado) if payload.resultado else None,
            resumo=payload.resumo,
            chamado_glpi=payload.chamado_glpi,
            pendencia_responsavel=payload.pendencia_responsavel,
            pendencia_prazo=payload.pendencia_prazo,
            ponto_focal_nome=payload.ponto_focal_nome,
            ponto_focal_data=payload.ponto_focal_data,
            proxima_preventiva=payload.proxima_preventiva,
            rascunho=payload.rascunho,
            permitir_edicao=current.subject_type == "admin",
        )
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/{item_id}")
def remove_item(
    ciclo_id: int,
    item_id: int,
    ciclo: MaintenanceCycle = Depends(require_cycle_manager),
    db: Session = Depends(get_db),
):
    """Tira um computador do ciclo (admin ou responsável do ciclo) - ex.:
    entrou por engano ou não vai mais entrar nesta rodada."""
    item = db.get(MaintenanceCycleItem, item_id)
    if item is None:
        raise HTTPException(404, "item não encontrado")
    _item_in_cycle(item, ciclo_id)
    try:
        ciclos.remover_item(db, item)
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"ok": True}


@router.post("/{item_id}/reschedule", response_model=CycleItemOut)
def reschedule_item(
    ciclo_id: int,
    payload: RescheduleRequest,
    item: MaintenanceCycleItem = Depends(require_item_actor),
    db: Session = Depends(get_db),
):
    _item_in_cycle(item, ciclo_id)
    try:
        return ciclos.remarcar_item(db, item, motivo=payload.motivo, nova_data=payload.nova_data)
    except InvalidTransitionError as exc:
        raise HTTPException(422, str(exc)) from exc
    except TransitionPreconditionError as exc:
        raise HTTPException(422, str(exc)) from exc
