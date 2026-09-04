"""Matriz de autorizacao por recurso (backend.md §5) - chama as dependencies
direto (mesmo molde de tests/test_competencies.py), sem subir HTTP."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.app.db import Base
from api.app.models.computer import Computer
from api.app.models.sector import Sector
from api.app.models.technician import Technician
from api.app.routers.auth import CurrentIdentity
from api.app.routers.preventiva._shared import (
    require_admin_session,
    require_cycle_manager,
    require_item_actor,
    require_item_executor,
)
from api.app.services import ciclos


@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    session.add_all([
        Technician(users_id=1, username="responsavel", nome_completo="Responsável", papel="tatico"),
        Technician(users_id=2, username="tecnico", nome_completo="Técnico Atribuído", papel="plantonista"),
        Technician(users_id=3, username="outro", nome_completo="Técnico Qualquer", papel="plantonista"),
        Sector(id_glpi=1, nome="Nutrição", entities_id=2, unidade_slug="hgvc", ativo=True),
    ])
    session.commit()
    session.add(Computer(id=1, patrimonio="PAT-001", setor_atual_id=1, criado_em=ciclos.utc_now()))
    session.commit()
    ciclo = ciclos.criar_ciclo(session, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(session, ciclo, computador_id=1)
    item.tecnico_id = 2
    session.commit()
    yield session, ciclo, item
    session.close()


def _identity(subject_type: str, users_id: int | None) -> CurrentIdentity:
    return CurrentIdentity(subject_type=subject_type, users_id=users_id, nome_completo="x")


# --- require_admin_session ---------------------------------------------------

def test_require_admin_session_allows_admin():
    assert require_admin_session(_identity("admin", None)).subject_type == "admin"


def test_require_admin_session_rejects_tecnico():
    with pytest.raises(HTTPException) as exc:
        require_admin_session(_identity("tecnico", 1))
    assert exc.value.status_code == 403


# --- require_cycle_manager ----------------------------------------------------

def test_require_cycle_manager_allows_admin(db):
    session, ciclo, _ = db
    assert require_cycle_manager(ciclo.id, _identity("admin", None), session).id == ciclo.id


def test_require_cycle_manager_allows_responsavel(db):
    session, ciclo, _ = db
    assert require_cycle_manager(ciclo.id, _identity("tecnico", 1), session).id == ciclo.id


def test_require_cycle_manager_rejects_outro_tecnico(db):
    session, ciclo, _ = db
    with pytest.raises(HTTPException) as exc:
        require_cycle_manager(ciclo.id, _identity("tecnico", 3), session)
    assert exc.value.status_code == 403


def test_require_cycle_manager_404_ciclo_inexistente(db):
    session, _, _ = db
    with pytest.raises(HTTPException) as exc:
        require_cycle_manager(999, _identity("admin", None), session)
    assert exc.value.status_code == 404


# --- require_item_executor (C3 - admin, responsavel do ciclo OU tecnico do item) --

def test_require_item_executor_allows_admin(db):
    session, _, item = db
    assert require_item_executor(item.id, _identity("admin", None), session).id == item.id


def test_require_item_executor_allows_tecnico_atribuido(db):
    session, _, item = db
    assert require_item_executor(item.id, _identity("tecnico", 2), session).id == item.id


def test_require_item_executor_allows_responsavel_do_ciclo(db):
    session, _, item = db
    # responsavel do ciclo (users_id=1), mesmo nao sendo o tecnico do item (2)
    assert require_item_executor(item.id, _identity("tecnico", 1), session).id == item.id


def test_require_item_executor_rejects_tecnico_qualquer(db):
    session, _, item = db
    with pytest.raises(HTTPException) as exc:
        require_item_executor(item.id, _identity("tecnico", 3), session)
    assert exc.value.status_code == 403


# --- inventario (require_admin_session) - so o admin muta, o resto so le ----

def test_inventario_bloqueado_para_tecnico(db):
    # as mutacoes de /preventiva/computers/* usam require_admin_session; um
    # tecnico (mesmo responsavel de ciclo) nao passa.
    session, _, _ = db
    with pytest.raises(HTTPException) as exc:
        require_admin_session(_identity("tecnico", 1))
    assert exc.value.status_code == 403


# --- require_item_actor (C2b/C4 - admin OU responsavel OU tecnico atribuido) -

def test_require_item_actor_allows_responsavel(db):
    session, _, item = db
    assert require_item_actor(item.id, _identity("tecnico", 1), session).id == item.id


def test_require_item_actor_allows_tecnico_atribuido(db):
    session, _, item = db
    assert require_item_actor(item.id, _identity("tecnico", 2), session).id == item.id


def test_require_item_actor_rejects_tecnico_qualquer(db):
    session, _, item = db
    with pytest.raises(HTTPException) as exc:
        require_item_actor(item.id, _identity("tecnico", 3), session)
    assert exc.value.status_code == 403
