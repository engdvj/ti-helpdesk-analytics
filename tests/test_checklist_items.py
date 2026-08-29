from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.app.db import Base
from api.app.routers.preventiva.checklist_items import (
    create_checklist_item,
    delete_checklist_item,
    list_checklist_items,
    update_checklist_item,
)
from api.app.schemas.checklist_item_def import ChecklistItemCreate, ChecklistItemUpdate


@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


def test_create_and_list_filters_by_tipo(db):
    create_checklist_item(ChecklistItemCreate(tipo="execucao", texto="Item A", ordem=0), db)
    create_checklist_item(ChecklistItemCreate(tipo="planejamento", texto="Item B", ordem=0), db)

    execucao = list_checklist_items(tipo="execucao", ativo=None, db=db)
    assert [i.texto for i in execucao] == ["Item A"]

    todos = list_checklist_items(tipo=None, ativo=None, db=db)
    assert len(todos) == 2


def test_update_toggles_ativo_and_edits_texto(db):
    item = create_checklist_item(ChecklistItemCreate(tipo="execucao", texto="Original", ordem=0), db)

    updated = update_checklist_item(item.id, ChecklistItemUpdate(texto="Editado", ativo=False), db)
    assert updated.texto == "Editado"
    assert updated.ativo is False

    only_active = list_checklist_items(tipo="execucao", ativo=True, db=db)
    assert only_active == []


def test_update_unknown_item_404(db):
    with pytest.raises(HTTPException) as exc:
        update_checklist_item(999, ChecklistItemUpdate(ativo=False), db)
    assert exc.value.status_code == 404


def test_delete_removes_item(db):
    item = create_checklist_item(ChecklistItemCreate(tipo="reconfirmacao", texto="X", ordem=0), db)
    delete_checklist_item(item.id, db)
    assert list_checklist_items(tipo="reconfirmacao", ativo=None, db=db) == []


def test_delete_unknown_item_404(db):
    with pytest.raises(HTTPException) as exc:
        delete_checklist_item(999, db)
    assert exc.value.status_code == 404
