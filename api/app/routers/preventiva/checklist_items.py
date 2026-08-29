from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.checklist_item_def import ChecklistItemDef
from api.app.routers.auth import require_session
from api.app.routers.preventiva._shared import require_admin_session
from api.app.schemas.checklist_item_def import ChecklistItemCreate, ChecklistItemOut, ChecklistItemUpdate, ChecklistTipo

router = APIRouter(prefix="/preventiva/checklist-items", tags=["preventiva"])


@router.get("", response_model=list[ChecklistItemOut], dependencies=[Depends(require_session)])
def list_checklist_items(
    tipo: ChecklistTipo | None = Query(default=None),
    ativo: bool | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Leitura aberta a qualquer sessão (técnico ou admin) - os formulários
    de checklist (reconfirmação/execução) precisam ler isso pra montar a
    tela, não é conteúdo restrito ao admin, só a edição é."""
    query = select(ChecklistItemDef).order_by(ChecklistItemDef.tipo, ChecklistItemDef.ordem, ChecklistItemDef.id)
    if tipo is not None:
        query = query.where(ChecklistItemDef.tipo == tipo)
    if ativo is not None:
        query = query.where(ChecklistItemDef.ativo == ativo)
    return db.scalars(query).all()


@router.post("", response_model=ChecklistItemOut, status_code=201, dependencies=[Depends(require_admin_session)])
def create_checklist_item(payload: ChecklistItemCreate, db: Session = Depends(get_db)):
    item = ChecklistItemDef(tipo=payload.tipo, texto=payload.texto, secao=payload.secao, ordem=payload.ordem, ativo=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=ChecklistItemOut, dependencies=[Depends(require_admin_session)])
def update_checklist_item(item_id: int, payload: ChecklistItemUpdate, db: Session = Depends(get_db)):
    item = db.get(ChecklistItemDef, item_id)
    if item is None:
        raise HTTPException(404, "item de checklist não encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", dependencies=[Depends(require_admin_session)])
def delete_checklist_item(item_id: int, db: Session = Depends(get_db)):
    """Delete de verdade (não soft-delete): o texto já congelado em
    checklists de ciclos/itens existentes é uma cópia JSON própria (ver
    services/ciclos.py), então apagar aqui nunca corrompe histórico."""
    item = db.get(ChecklistItemDef, item_id)
    if item is None:
        raise HTTPException(404, "item de checklist não encontrado")
    db.delete(item)
    db.commit()
    return {"ok": True}
