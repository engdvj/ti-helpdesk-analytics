"""Autorizacao por recurso (nao so por subject_type global) - ver
.claude/docs/standards/backend.md §5. Cada dependency declara o path param do
recurso e devolve o proprio recurso ja carregado; FastAPI resolve isso contra
o path da rota quando o nome do parametro bate, mesmo a dependency nao sendo
a funcao da rota."""
from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.maintenance_cycle import MaintenanceCycle
from api.app.models.maintenance_cycle_item import MaintenanceCycleItem
from api.app.routers.auth import CurrentIdentity, require_session


def require_admin_session(current: CurrentIdentity = Depends(require_session)) -> CurrentIdentity:
    """Admin via sessao (nao o header X-Admin-Username/Password de
    admin.py::require_admin - aquele e senha compartilhada sem identidade
    propria, esta feature precisa saber "qual admin fez o que"). Usado em
    criar_ciclo (C1) e em TODA mutacao de inventario (cadastrar/editar/mover/
    baixar/excluir PC, hardware manual) - decisao do usuario (2026-08-31):
    inventario e so do admin, o resto so visualiza (GET /computers, GET
    /sectors continuam em require_session)."""
    if current.subject_type != "admin":
        raise HTTPException(403, "essa ação exige sessão de admin")
    return current


def require_cycle_manager(
    ciclo_id: int,
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
) -> MaintenanceCycle:
    """So admin OU o tecnico designado responsavel deste ciclo especifico -
    usado em agendar (C2), reatribuir, fechar (C5)."""
    ciclo = db.get(MaintenanceCycle, ciclo_id)
    if ciclo is None:
        raise HTTPException(404, "ciclo não encontrado")
    if current.subject_type != "admin" and ciclo.responsavel_id != current.users_id:
        raise HTTPException(403, "só o admin ou o responsável designado gerencia este ciclo")
    return ciclo


def require_item_executor(
    item_id: int,
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
) -> MaintenanceCycleItem:
    """Admin, responsavel do ciclo do item, OU o tecnico atribuido a ESTE item
    - preenche o checklist de execucao (C3). O responsavel do ciclo passou a
    entrar aqui em 2026-08-31 (antes so o tecnico do item): decisao do usuario
    de que "responsavel = pode tudo no ciclo dele". Tecnico comum so age nos
    itens atribuidos a ele. (Hoje coincide com require_item_actor; os nomes
    seguem separados porque marcam intencoes diferentes no call site e podem
    divergir de novo.)"""
    item = db.get(MaintenanceCycleItem, item_id)
    if item is None:
        raise HTTPException(404, "item não encontrado")
    if current.subject_type == "admin":
        return item
    ciclo = db.get(MaintenanceCycle, item.ciclo_id)
    is_responsavel = ciclo is not None and ciclo.responsavel_id == current.users_id
    if not is_responsavel and item.tecnico_id != current.users_id:
        raise HTTPException(403, "só o responsável do ciclo ou o técnico atribuído executa este item")
    return item


def require_item_actor(
    item_id: int,
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
) -> MaintenanceCycleItem:
    """Admin OU responsavel do ciclo OU tecnico atribuido ao item - usado em
    agendar/reconfirmar (C2/C2b) e remarcar (C4), que o requisito
    explicitamente permite tanto pro responsavel quanto pro tecnico
    designado."""
    item = db.get(MaintenanceCycleItem, item_id)
    if item is None:
        raise HTTPException(404, "item não encontrado")
    ciclo = db.get(MaintenanceCycle, item.ciclo_id)
    is_responsavel = ciclo is not None and ciclo.responsavel_id == current.users_id
    is_tecnico = item.tecnico_id == current.users_id
    if current.subject_type != "admin" and not (is_responsavel or is_tecnico):
        raise HTTPException(403, "só o responsável do ciclo ou o técnico atribuído age neste item")
    return item
