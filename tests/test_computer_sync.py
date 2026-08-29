from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.app.db import Base
from api.app.models.collection_run import CollectionRun
from api.app.models.computer import Computer
from api.app.models.computer_hardware import ComputerHardware
from api.app.models.sector import Sector
from api.app.services import computer_sync
from api.app.services.computer_sync import _sync_hardware as _real_sync_hardware  # captura antes do monkeypatch da fixture


@pytest.fixture
def session_factory(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(computer_sync, "SessionLocal", factory)
    # sem isso, execute_computer_sync tentaria abrir sessão GLPI de verdade
    # (GlpiConfig() lê env var que não existe em teste) - testes de hardware
    # de verdade sobrescrevem isto individualmente.
    monkeypatch.setattr(computer_sync, "_sync_hardware", lambda db, fetched: {"hardware_atualizado": 0})

    with factory() as db:
        db.add(Sector(id_glpi=21, nome="Nutrição", entities_id=2, unidade_slug="hgvc", ativo=True))
        db.commit()

    return factory


def _fake_glpi(rows: list[dict]):
    return lambda: rows


def _run(session_factory) -> str:
    with session_factory() as db:
        run_id = computer_sync.create_computer_sync_run(db, "admin").id
    return run_id


def test_sync_uses_otherserial_as_patrimonio_never_serial(session_factory, monkeypatch):
    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002", "serial": "01045395010057", "otherserial": "PAT-999", "users_id": 0},
    ]))
    run_id = _run(session_factory)
    computer_sync.execute_computer_sync(run_id)

    with session_factory() as db:
        computer = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1))
        assert computer is not None
        assert computer.patrimonio == "PAT-999"  # otherserial, nunca o serial do fabricante
        assert computer.hostname == "HGVC-TI-002"
        assert computer.setor_atual_id is None  # users_id=0 nao resolve setor nenhum


def test_sync_leaves_patrimonio_none_when_otherserial_empty(session_factory, monkeypatch):
    """Caso real: PC do agent sem numero de inventario preenchido no GLPI -
    NUNCA inventa valor a partir do serial (patrimonio e etiqueta externa,
    nao dado do hardware - correcao explicita do usuario)."""
    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002", "serial": "01045395010057", "otherserial": None, "users_id": 0},
    ]))
    run_id = _run(session_factory)
    computer_sync.execute_computer_sync(run_id)

    with session_factory() as db:
        computer = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1))
        assert computer.patrimonio is None

        run = db.scalars(select(CollectionRun)).all()[-1]
        assert run.counts["sem_patrimonio"] == 1
        assert run.counts["sem_setor_resolvido"] == 1


def test_sync_resolves_setor_from_users_id(session_factory, monkeypatch):
    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002", "serial": "x", "otherserial": None, "users_id": 21},
    ]))
    run_id = _run(session_factory)
    computer_sync.execute_computer_sync(run_id)

    with session_factory() as db:
        computer = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1))
        assert computer.setor_atual_id == 21


def test_sync_never_clears_a_setor_already_assigned_on_the_platform(session_factory, monkeypatch):
    """Atribuicao de setor e 100% nossa agora (nao vem do GLPI) - um sync
    repetido nao pode apagar o que foi assinalado na plataforma so porque o
    GLPI nao resolveu dessa vez."""
    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002", "serial": "x", "otherserial": None, "users_id": 0},
    ]))
    run_id_1 = _run(session_factory)
    computer_sync.execute_computer_sync(run_id_1)

    with session_factory() as db:
        computer = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1))
        computer.setor_atual_id = 21  # atribuido na plataforma, fora do sync
        db.commit()

    # roda o sync de novo - GLPI ainda nao resolve (users_id=0)
    run_id_2 = _run(session_factory)
    computer_sync.execute_computer_sync(run_id_2)

    with session_factory() as db:
        computer = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1))
        assert computer.setor_atual_id == 21  # continua atribuido


def test_sync_upsert_is_idempotent_and_updates_hostname(session_factory, monkeypatch):
    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002", "serial": "x", "otherserial": "PAT-001", "users_id": 0},
    ]))
    run_id_1 = _run(session_factory)
    computer_sync.execute_computer_sync(run_id_1)

    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002-RENOMEADO", "serial": "x", "otherserial": "PAT-001", "users_id": 0},
    ]))
    run_id_2 = _run(session_factory)
    computer_sync.execute_computer_sync(run_id_2)

    with session_factory() as db:
        assert len(db.scalars(select(Computer)).all()) == 1  # nunca duplica
        computer = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1))
        assert computer.hostname == "HGVC-TI-002-RENOMEADO"


def test_sync_never_touches_manually_created_computer(session_factory, monkeypatch):
    from datetime import datetime, timezone

    with session_factory() as db:
        db.add(Computer(
            patrimonio="PAT-MANUAL", hostname="pc-manual", setor_atual_id=21,
            criado_em=datetime.now(timezone.utc), ativo=True,
        ))
        db.commit()

    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002", "serial": "x", "otherserial": "PAT-MANUAL-2", "users_id": 0},
    ]))
    run_id = _run(session_factory)
    computer_sync.execute_computer_sync(run_id)

    with session_factory() as db:
        manual = db.scalar(select(Computer).where(Computer.patrimonio == "PAT-MANUAL"))
        assert manual is not None
        assert manual.id_glpi_computer is None  # sync nunca linka retroativamente


def test_sync_disambiguates_patrimonio_collision_on_insert(session_factory, monkeypatch):
    from datetime import datetime, timezone

    with session_factory() as db:
        db.add(Computer(
            patrimonio="PAT-001", hostname=None, setor_atual_id=21,
            criado_em=datetime.now(timezone.utc), ativo=True,
        ))
        db.commit()

    monkeypatch.setattr(computer_sync, "_fetch_computers_from_glpi", _fake_glpi([
        {"id": 1, "name": "HGVC-TI-002", "serial": "x", "otherserial": "PAT-001", "users_id": 0},
    ]))
    run_id = _run(session_factory)
    computer_sync.execute_computer_sync(run_id)

    with session_factory() as db:
        imported = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1))
        assert imported.patrimonio == "PAT-001-glpi1"  # sufixo, nao quebrou o sync


def _fake_hardware_glpi(monkeypatch, hardware_por_glpi_id: dict[int, dict]):
    """Substitui as pecas que falam com o GLPI de verdade dentro de
    `_sync_hardware`, sem tocar rede (mesmo espirito de `_fake_glpi` acima,
    so que num nivel mais fundo porque `_sync_hardware` abre sessao propria)."""
    monkeypatch.setattr(computer_sync, "GlpiConfig", lambda: object())
    monkeypatch.setattr(computer_sync, "init_session", lambda cfg: "token")
    monkeypatch.setattr(computer_sync, "kill_session", lambda cfg, token: None)
    monkeypatch.setattr(
        computer_sync, "fetch_all_hardware",
        lambda cfg, token, glpi_ids: {gid: dados for gid, dados in hardware_por_glpi_id.items() if gid in glpi_ids},
    )


def test_sync_hardware_cria_registro_para_pc_linkado(session_factory, monkeypatch):
    with session_factory() as db:
        db.add(Computer(
            id_glpi_computer=1, patrimonio=None, hostname="HGVC-TI-002", setor_atual_id=21,
            criado_em=datetime.now(timezone.utc), ativo=True,
        ))
        db.commit()
        computer_id = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1)).id

    _fake_hardware_glpi(monkeypatch, {1: {
        "ram_mb": 8192, "disco_tipo": "SSD", "disco_total_mb": 243570, "disco_livre_mb": 11386,
        "so_nome": "Microsoft Windows 10 Pro", "so_instalado_em": date(2026, 2, 11),
        "cpu_designacao": "12th Gen Intel(R) Core(TM) i3-12100T",
        "gpu_designacao": "Intel(R) UHD Graphics 730", "gpu_memoria_mb": 2047,
        "atualizado_em": datetime.now(timezone.utc),
    }})

    with session_factory() as db:
        counts = _real_sync_hardware(db, [{"id": 1}])
        db.commit()
    assert counts == {"hardware_atualizado": 1}

    with session_factory() as db:
        hw = db.get(ComputerHardware, computer_id)
        assert hw is not None
        assert hw.ram_mb == 8192
        assert hw.disco_tipo == "SSD"
        assert hw.so_nome == "Microsoft Windows 10 Pro"


def test_sync_hardware_atualiza_registro_existente(session_factory, monkeypatch):
    with session_factory() as db:
        db.add(Computer(
            id_glpi_computer=1, patrimonio=None, hostname="PC", setor_atual_id=21,
            criado_em=datetime.now(timezone.utc), ativo=True,
        ))
        db.commit()
        computer_id = db.scalar(select(Computer).where(Computer.id_glpi_computer == 1)).id

    _fake_hardware_glpi(monkeypatch, {1: {
        "ram_mb": 4096, "disco_tipo": "HDD", "disco_total_mb": None, "disco_livre_mb": None,
        "so_nome": None, "so_instalado_em": None,
        "cpu_designacao": None, "gpu_designacao": None, "gpu_memoria_mb": None,
        "atualizado_em": datetime.now(timezone.utc),
    }})
    with session_factory() as db:
        _real_sync_hardware(db, [{"id": 1}])
        db.commit()

    _fake_hardware_glpi(monkeypatch, {1: {
        "ram_mb": 16384, "disco_tipo": "SSD", "disco_total_mb": None, "disco_livre_mb": None,
        "so_nome": None, "so_instalado_em": None,
        "cpu_designacao": None, "gpu_designacao": None, "gpu_memoria_mb": None,
        "atualizado_em": datetime.now(timezone.utc),
    }})
    with session_factory() as db:
        _real_sync_hardware(db, [{"id": 1}])
        db.commit()

    with session_factory() as db:
        assert len(db.scalars(select(ComputerHardware)).all()) == 1  # upsert, nunca duplica
        hw = db.get(ComputerHardware, computer_id)
        assert hw.ram_mb == 16384
        assert hw.disco_tipo == "SSD"


def test_sync_hardware_ignora_pc_sem_link_glpi(session_factory, monkeypatch):
    """PC importado desapareceu do fetch (ex. filtrado is_deleted) - nunca
    quebra o hardware sync por causa de um id que nao resolve pra Computer
    nenhum local."""
    _fake_hardware_glpi(monkeypatch, {999: {
        "ram_mb": 8192, "disco_tipo": "SSD", "disco_total_mb": None, "disco_livre_mb": None,
        "so_nome": None, "so_instalado_em": None,
        "cpu_designacao": None, "gpu_designacao": None, "gpu_memoria_mb": None,
        "atualizado_em": datetime.now(timezone.utc),
    }})
    with session_factory() as db:
        counts = _real_sync_hardware(db, [{"id": 999}])
        db.commit()
    assert counts == {"hardware_atualizado": 0}


def test_create_computer_sync_run_rejects_concurrent_sync(session_factory):
    with session_factory() as db:
        first = computer_sync.create_computer_sync_run(db, "admin")
        with pytest.raises(computer_sync.ComputerSyncAlreadyRunningError) as exc_info:
            computer_sync.create_computer_sync_run(db, "admin")
        assert exc_info.value.run.id == first.id
