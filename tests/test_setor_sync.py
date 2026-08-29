from __future__ import annotations

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.app.db import Base
from api.app.models.collection_run import CollectionRun
from api.app.models.sector import Sector
from api.app.services import setor_sync


@pytest.fixture
def session_factory(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(setor_sync, "SessionLocal", factory)
    return factory


def _fake_glpi(rows: list[dict]):
    return lambda: rows


def test_sync_creates_sectors_using_firstname_never_login(session_factory, monkeypatch):
    monkeypatch.setattr(setor_sync, "_fetch_sectors_from_glpi", _fake_glpi([
        {"id_glpi": 21, "nome": "Higienização", "entities_id": 2, "unidade_slug": "hgvc", "ativo": True},
    ]))

    with session_factory() as db:
        run = setor_sync.create_sector_sync_run(db, "admin")
        run_id = run.id

    setor_sync.execute_sector_sync(run_id)

    with session_factory() as db:
        sector = db.get(Sector, 21)
        assert sector is not None
        assert sector.nome == "Higienização"  # firstname, nunca "hgvc-higienizacao" (login)
        assert sector.unidade_slug == "hgvc"
        assert sector.ativo is True

        finished = db.get(CollectionRun, run_id)
        assert finished.status == "success"
        assert finished.tipo == "setores"
        assert finished.counts == {"setores_criados": 1, "setores_atualizados": 0, "setores_desativados": 0}


def test_sync_upsert_is_idempotent(session_factory, monkeypatch):
    rows = [{"id_glpi": 21, "nome": "Higienização", "entities_id": 2, "unidade_slug": "hgvc", "ativo": True}]
    monkeypatch.setattr(setor_sync, "_fetch_sectors_from_glpi", _fake_glpi(rows))

    with session_factory() as db:
        run_id_1 = setor_sync.create_sector_sync_run(db, "admin").id
    setor_sync.execute_sector_sync(run_id_1)

    # segunda sincronizacao, mesmo dado, com o nome corrigido no GLPI
    monkeypatch.setattr(setor_sync, "_fetch_sectors_from_glpi", _fake_glpi([
        {"id_glpi": 21, "nome": "Higienizacao Hospitalar", "entities_id": 2, "unidade_slug": "hgvc", "ativo": True},
    ]))
    with session_factory() as db:
        run_id_2 = setor_sync.create_sector_sync_run(db, "admin").id
    setor_sync.execute_sector_sync(run_id_2)

    with session_factory() as db:
        assert len(db.scalars(select(Sector)).all()) == 1  # nunca duplica
        sector = db.get(Sector, 21)
        assert sector.nome == "Higienizacao Hospitalar"  # upsert atualizou, nao criou outro


def test_sync_deactivates_sector_removed_from_glpi_without_deleting(session_factory, monkeypatch):
    monkeypatch.setattr(setor_sync, "_fetch_sectors_from_glpi", _fake_glpi([
        {"id_glpi": 21, "nome": "Higienização", "entities_id": 2, "unidade_slug": "hgvc", "ativo": True},
    ]))
    with session_factory() as db:
        run_id_1 = setor_sync.create_sector_sync_run(db, "admin").id
    setor_sync.execute_sector_sync(run_id_1)

    monkeypatch.setattr(setor_sync, "_fetch_sectors_from_glpi", _fake_glpi([]))  # setor sumiu do GLPI
    with session_factory() as db:
        run_id_2 = setor_sync.create_sector_sync_run(db, "admin").id
    setor_sync.execute_sector_sync(run_id_2)

    with session_factory() as db:
        sector = db.get(Sector, 21)
        assert sector is not None  # nunca deletado
        assert sector.ativo is False


def test_sync_failure_does_not_touch_local_data(session_factory, monkeypatch):
    monkeypatch.setattr(setor_sync, "_fetch_sectors_from_glpi", _fake_glpi([
        {"id_glpi": 21, "nome": "Higienização", "entities_id": 2, "unidade_slug": "hgvc", "ativo": True},
    ]))
    with session_factory() as db:
        run_id_1 = setor_sync.create_sector_sync_run(db, "admin").id
    setor_sync.execute_sector_sync(run_id_1)

    def _boom():
        raise RuntimeError("GLPI indisponivel")

    monkeypatch.setattr(setor_sync, "_fetch_sectors_from_glpi", _boom)
    with session_factory() as db:
        run_id_2 = setor_sync.create_sector_sync_run(db, "admin").id
    setor_sync.execute_sector_sync(run_id_2)

    with session_factory() as db:
        sector = db.get(Sector, 21)
        assert sector is not None
        assert sector.ativo is True  # dado local intacto, sync anterior nao foi apagada

        failed = db.get(CollectionRun, run_id_2)
        assert failed.status == "error"
        assert "GLPI indisponivel" in (failed.error or "")


def test_create_sector_sync_run_rejects_concurrent_sync(session_factory):
    with session_factory() as db:
        first = setor_sync.create_sector_sync_run(db, "admin")
        with pytest.raises(setor_sync.SectorSyncAlreadyRunningError) as exc_info:
            setor_sync.create_sector_sync_run(db, "admin")
        assert exc_info.value.run.id == first.id


def test_sector_sync_does_not_block_a_concurrent_chamados_collection(session_factory):
    from api.app.services import collection_jobs

    with session_factory() as db:
        setor_sync.create_sector_sync_run(db, "admin")
        # tipo diferente ("chamados") nao deveria colidir com o lock de "setores"
        chamados_run = collection_jobs.create_collection_run(db, "admin")
        assert chamados_run.tipo == "chamados"


def test_fetch_sectors_inclui_categoria_extra_fora_do_grupo(monkeypatch):
    """Supervisores de manutenção (TI/ME/MP) são categoria "Supervisor", fora
    do grupo "Setores", entities_id na raiz - viram setor com unidade "geral"."""
    monkeypatch.setattr(setor_sync, "_setores_config", lambda: {
        "grupo": "Setores", "categoria": "Setor",
        "categorias_extra": ["Supervisor"], "unidade_extra": "geral",
    })
    monkeypatch.setattr(setor_sync, "GlpiConfig", lambda: object())
    monkeypatch.setattr(setor_sync, "init_session", lambda cfg: "tok")
    monkeypatch.setattr(setor_sync, "kill_session", lambda cfg, tok: None)
    monkeypatch.setattr(setor_sync, "discover_group_id", lambda cfg, tok, nome: 24)
    monkeypatch.setattr(
        setor_sync, "discover_user_category_id",
        lambda cfg, tok, nome: {"Setor": 2, "Supervisor": 3}[nome],
    )

    def fake_get_paginated(cfg, endpoint, tok):
        if endpoint == "/Entity":
            return [{"id": 2, "name": "HGVC"}, {"id": 0, "name": "Root entity"}]
        if endpoint == "/Group/24/User":
            return [{"id": 100, "firstname": "Nutrição", "usercategories_id": 2, "entities_id": 2, "is_active": 1}]
        if endpoint == "/User":
            return [
                {"id": 100, "firstname": "Nutrição", "usercategories_id": 2, "entities_id": 2, "is_active": 1},
                {"id": 19, "firstname": "Tecnologia da Informação", "usercategories_id": 3, "entities_id": 0, "is_active": 1},
                {"id": 50, "firstname": "Plantonista Fulano", "usercategories_id": 1, "entities_id": 2, "is_active": 1},
            ]
        raise AssertionError(f"endpoint inesperado: {endpoint}")

    monkeypatch.setattr(setor_sync, "get_paginated", fake_get_paginated)

    fetched = {r["id_glpi"]: r for r in setor_sync._fetch_sectors_from_glpi()}
    assert len(fetched) == 2  # 100 não duplica (está no grupo E no /User)
    assert fetched[100]["unidade_slug"] == "hgvc"
    assert fetched[19]["nome"] == "Tecnologia da Informação"
    assert fetched[19]["unidade_slug"] == "geral"  # transversal, não "root entity"
    assert 50 not in fetched  # plantonista não vira setor


def test_fetch_sectors_sem_categoria_extra_nao_escaneia_todos_os_users(monkeypatch):
    monkeypatch.setattr(setor_sync, "_setores_config", lambda: {
        "grupo": "Setores", "categoria": "Setor", "categorias_extra": [], "unidade_extra": "geral",
    })
    monkeypatch.setattr(setor_sync, "GlpiConfig", lambda: object())
    monkeypatch.setattr(setor_sync, "init_session", lambda cfg: "tok")
    monkeypatch.setattr(setor_sync, "kill_session", lambda cfg, tok: None)
    monkeypatch.setattr(setor_sync, "discover_group_id", lambda cfg, tok, nome: 24)
    monkeypatch.setattr(setor_sync, "discover_user_category_id", lambda cfg, tok, nome: 2)

    def fake_get_paginated(cfg, endpoint, tok):
        if endpoint == "/User":
            raise AssertionError("não deveria escanear /User sem categorias_extra")
        if endpoint == "/Entity":
            return [{"id": 2, "name": "HGVC"}]
        if endpoint == "/Group/24/User":
            return [{"id": 100, "firstname": "Nutrição", "usercategories_id": 2, "entities_id": 2, "is_active": 1}]
        raise AssertionError(endpoint)

    monkeypatch.setattr(setor_sync, "get_paginated", fake_get_paginated)
    fetched = setor_sync._fetch_sectors_from_glpi()
    assert [r["id_glpi"] for r in fetched] == [100]
