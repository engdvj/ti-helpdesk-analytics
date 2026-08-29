from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.app.db import Base
from api.app.models.computer_hardware import ComputerHardware
from api.app.models.maintenance_cycle_item import MaintenanceCycleItem
from api.app.models.sector import Sector
from api.app.routers.preventiva.computers import (
    create_computer,
    delete_computer,
    delete_computer_hardware,
    get_computer,
    list_computers,
    move_computer,
    set_computer_hardware,
    update_computer,
)
from api.app.routers.preventiva.sectors import get_sector, list_sectors
from api.app.schemas.computer import ComputerCreate, ComputerHardwareInput, ComputerMove, ComputerUpdate


@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    session.add_all([
        Sector(id_glpi=1, nome="Nutrição", entities_id=2, unidade_slug="hgvc", ativo=True),
        Sector(id_glpi=2, nome="Recepção", entities_id=12, unidade_slug="upa", ativo=True),
    ])
    session.commit()
    yield session
    session.close()


def test_create_computer_success(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname="pc-nutricao-01", setor_atual_id=1), db)
    assert computer.id is not None
    assert computer.patrimonio == "PAT-001"
    assert computer.setor_atual_id == 1
    assert computer.setor_alterado_em is None  # nunca foi movido


def test_create_computer_rejects_duplicate_patrimonio(db):
    create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    with pytest.raises(HTTPException) as exc_info:
        create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=2), db)
    assert exc_info.value.status_code == 409


def test_create_computer_rejects_unknown_sector(db):
    with pytest.raises(HTTPException) as exc_info:
        create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=999), db)
    assert exc_info.value.status_code == 404


def test_list_computers_filters_by_sector_and_patrimonio(db):
    create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    create_computer(ComputerCreate(patrimonio="PAT-002", hostname=None, setor_atual_id=2), db)

    only_sector_1 = list_computers(page=1, page_size=20, setor_atual_id=1, patrimonio=None, db=db)
    assert only_sector_1["total"] == 1
    assert only_sector_1["items"][0].patrimonio == "PAT-001"

    by_patrimonio = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio="002", db=db)
    assert by_patrimonio["total"] == 1
    assert by_patrimonio["items"][0].patrimonio == "PAT-002"


def test_list_computers_sorts_by_sector_name(db):
    create_computer(ComputerCreate(patrimonio="PAT-001", hostname="zeta", setor_atual_id=2), db)  # Recepção
    create_computer(ComputerCreate(patrimonio="PAT-002", hostname="alfa", setor_atual_id=1), db)  # Nutrição

    by_sector_asc = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, sort="setor", sort_dir="asc", db=db)
    assert [c.patrimonio for c in by_sector_asc["items"]] == ["PAT-002", "PAT-001"]  # Nutrição < Recepção

    by_hostname_desc = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, sort="hostname", sort_dir="desc", db=db)
    assert [c.hostname for c in by_hostname_desc["items"]] == ["zeta", "alfa"]


def test_move_computer_updates_sector_and_timestamp(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    moved = move_computer(computer.id, ComputerMove(setor_atual_id=2), db)
    assert moved.setor_atual_id == 2
    assert moved.setor_alterado_em is not None


def test_move_computer_rejects_unknown_target_sector(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    with pytest.raises(HTTPException) as exc_info:
        move_computer(computer.id, ComputerMove(setor_atual_id=999), db)
    assert exc_info.value.status_code == 404


def test_list_sectors_includes_computer_count_and_zero_for_empty_sector(db):
    create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    create_computer(ComputerCreate(patrimonio="PAT-002", hostname=None, setor_atual_id=1), db)

    sectors = {s.id_glpi: s for s in list_sectors(ativo=None, db=db)}
    assert sectors[1].qtd_computadores == 2
    assert sectors[2].qtd_computadores == 0  # setor sem PC nunca some da lista, mostra 0


def test_update_computer_changes_hostname_only(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname="antigo", setor_atual_id=1), db)
    updated = update_computer(computer.id, ComputerUpdate(hostname="novo"), db)
    assert updated.hostname == "novo"
    assert updated.patrimonio == "PAT-001"  # inalterado
    assert updated.setor_alterado_em is None  # setor não mexeu


def test_update_computer_changes_patrimonio(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    updated = update_computer(computer.id, ComputerUpdate(patrimonio="PAT-999"), db)
    assert updated.patrimonio == "PAT-999"


def test_update_computer_rejects_duplicate_patrimonio(db):
    create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    outro = create_computer(ComputerCreate(patrimonio="PAT-002", hostname=None, setor_atual_id=1), db)
    with pytest.raises(HTTPException) as exc_info:
        update_computer(outro.id, ComputerUpdate(patrimonio="PAT-001"), db)
    assert exc_info.value.status_code == 409


def test_update_computer_same_patrimonio_is_noop(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    updated = update_computer(computer.id, ComputerUpdate(patrimonio="PAT-001", hostname="h"), db)
    assert updated.patrimonio == "PAT-001"
    assert updated.hostname == "h"


def test_update_computer_transfers_sector_and_stamps_timestamp(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    updated = update_computer(computer.id, ComputerUpdate(setor_atual_id=2), db)
    assert updated.setor_atual_id == 2
    assert updated.setor_alterado_em is not None


def test_update_computer_rejects_unknown_sector(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    with pytest.raises(HTTPException) as exc_info:
        update_computer(computer.id, ComputerUpdate(setor_atual_id=999), db)
    assert exc_info.value.status_code == 404


def test_update_computer_unknown_id(db):
    with pytest.raises(HTTPException) as exc_info:
        update_computer(999, ComputerUpdate(hostname="x"), db)
    assert exc_info.value.status_code == 404


def test_deactivated_computer_hidden_by_default_shown_with_flag(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    create_computer(ComputerCreate(patrimonio="PAT-002", hostname=None, setor_atual_id=1), db)
    update_computer(computer.id, ComputerUpdate(ativo=False), db)

    padrao = list_computers(
        page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=False, db=db
    )
    assert {c.patrimonio for c in padrao["items"]} == {"PAT-002"}

    com_inativos = list_computers(
        page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=True, db=db
    )
    assert {c.patrimonio for c in com_inativos["items"]} == {"PAT-001", "PAT-002"}


def test_sector_count_ignores_deactivated_computers(db):
    a = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    create_computer(ComputerCreate(patrimonio="PAT-002", hostname=None, setor_atual_id=1), db)
    update_computer(a.id, ComputerUpdate(ativo=False), db)

    assert get_sector(1, db=db).qtd_computadores == 1
    assert {s.id_glpi: s.qtd_computadores for s in list_sectors(ativo=None, db=db)}[1] == 1


def test_get_sector_unknown_id(db):
    with pytest.raises(HTTPException) as exc_info:
        get_sector(999, db=db)
    assert exc_info.value.status_code == 404


def _cycle_item(db, computador_id, proxima, item_id):
    db.add(MaintenanceCycleItem(
        id=item_id, ciclo_id=1, computador_id=computador_id, prioridade="normal",
        status="concluido", proxima_preventiva=proxima, criado_em=datetime.now(timezone.utc),
    ))
    db.commit()


def test_list_computers_proxima_preventiva_none_sem_ciclo(db):
    create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    result = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=False, db=db)
    assert result["items"][0].proxima_preventiva is None


def test_list_computers_proxima_preventiva_do_item_mais_recente(db):
    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    _cycle_item(db, pc.id, date(2026, 9, 1), item_id=1)
    _cycle_item(db, pc.id, date(2027, 3, 1), item_id=2)  # ciclo posterior (id maior)
    _cycle_item(db, pc.id, None, item_id=3)  # rascunho/sem data - ignorado

    result = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=False, db=db)
    assert result["items"][0].proxima_preventiva == date(2027, 3, 1)


def test_create_computer_without_patrimonio(db):
    """Patrimonio e etiqueta externa (setor de patrimonio do hospital) - existe
    PC sem ela, nunca deve ser obrigatorio."""
    computer = create_computer(ComputerCreate(patrimonio=None, hostname="pc-sem-etiqueta", setor_atual_id=1), db)
    assert computer.patrimonio is None


def test_create_computer_two_without_patrimonio_never_collide(db):
    a = create_computer(ComputerCreate(patrimonio=None, hostname="pc-a", setor_atual_id=1), db)
    b = create_computer(ComputerCreate(patrimonio=None, hostname="pc-b", setor_atual_id=1), db)
    assert a.patrimonio is None
    assert b.patrimonio is None


def test_update_computer_clears_patrimonio_explicitly(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    updated = update_computer(computer.id, ComputerUpdate(patrimonio=None), db)
    assert updated.patrimonio is None


def test_update_computer_clears_setor_explicitly(db):
    computer = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    updated = update_computer(computer.id, ComputerUpdate(setor_atual_id=None), db)
    assert updated.setor_atual_id is None
    assert updated.setor_alterado_em is not None  # "mudou de setor" tambem conta pra "sem setor"


def test_list_computers_hardware_score_none_sem_sincronizacao(db):
    create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    result = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=False, db=db)
    assert result["items"][0].hardware_score is None
    assert result["items"][0].hardware_nivel is None


def test_list_computers_hardware_score_calculado_quando_sincronizado(db):
    from api.app.models.computer_hardware import ComputerHardware

    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    db.add(ComputerHardware(
        computer_id=pc.id, ram_mb=16384, disco_tipo="SSD", disco_total_mb=200_000, disco_livre_mb=150_000,
        so_nome="Microsoft Windows 11 Pro", so_instalado_em=date(2026, 1, 1),
        cpu_designacao="Intel Core i7-1165G7", gpu_designacao="NVIDIA GeForce MX450", gpu_memoria_mb=2048,
        atualizado_em=datetime.now(timezone.utc),
    ))
    db.commit()

    result = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=False, db=db)
    item = result["items"][0]
    assert item.hardware_score is not None
    assert item.hardware_nivel == "bom"
    assert item.hardware_detalhes and len(item.hardware_detalhes) == 7


def test_get_computer_detail_includes_hardware_and_score_breakdown(db):
    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname="pc-01", setor_atual_id=1), db)
    db.add(ComputerHardware(
        computer_id=pc.id, ram_mb=8192, disco_tipo="HDD", disco_total_mb=500_000, disco_livre_mb=20_000,
        so_nome="Microsoft Windows 10 Pro", so_instalado_em=date(2021, 1, 1),
        cpu_designacao="Intel Celeron N4020", gpu_designacao="Intel UHD Graphics", gpu_memoria_mb=None,
        atualizado_em=datetime.now(timezone.utc),
    ))
    db.commit()

    detalhe = get_computer(pc.id, db=db)
    assert detalhe.hardware is not None
    assert detalhe.hardware.disco_tipo == "HDD"
    assert detalhe.hardware.cpu_designacao == "Intel Celeron N4020"
    assert detalhe.hardware_score is not None
    assert detalhe.score_componentes and len(detalhe.score_componentes) == 7
    ram = next(c for c in detalhe.score_componentes if c.dimensao == "RAM")
    assert ram.peso == 25 and 0 <= ram.pontos <= 25


def test_get_computer_detail_without_hardware(db):
    pc = create_computer(ComputerCreate(patrimonio=None, hostname="pc-manual", setor_atual_id=1), db)
    detalhe = get_computer(pc.id, db=db)
    assert detalhe.hardware is None
    assert detalhe.hardware_score is None
    assert detalhe.score_componentes is None


def test_get_computer_unknown_id(db):
    with pytest.raises(HTTPException) as exc_info:
        get_computer(999, db=db)
    assert exc_info.value.status_code == 404


def test_set_hardware_manually_and_score_calculado(db):
    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    detalhe = set_computer_hardware(pc.id, ComputerHardwareInput(
        ram_mb=16384, disco_tipo="SSD", disco_total_mb=250_000, disco_livre_mb=120_000,
        so_nome="Windows 11 Pro", so_instalado_em=date(2026, 1, 1), cpu_designacao="Core i5-12400",
    ), db)
    assert detalhe.hardware is not None
    assert detalhe.hardware.disco_tipo == "SSD"
    assert detalhe.hardware_score is not None and detalhe.hardware_score >= 80  # config boa
    # segunda chamada = upsert (não duplica, atualiza)
    detalhe2 = set_computer_hardware(pc.id, ComputerHardwareInput(ram_mb=2048), db)
    assert detalhe2.hardware.ram_mb == 2048
    assert detalhe2.hardware.disco_tipo is None  # payload novo sobrescreve tudo


def test_set_hardware_blocked_for_glpi_linked_pc(db):
    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    pc.id_glpi_computer = 42
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        set_computer_hardware(pc.id, ComputerHardwareInput(ram_mb=8192), db)
    assert exc_info.value.status_code == 422


def test_delete_hardware_volta_pra_sem_dados(db):
    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    set_computer_hardware(pc.id, ComputerHardwareInput(ram_mb=8192), db)
    delete_computer_hardware(pc.id, db=db)
    detalhe = get_computer(pc.id, db=db)
    assert detalhe.hardware is None
    assert detalhe.hardware_score is None


def test_hard_delete_computer(db):
    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    set_computer_hardware(pc.id, ComputerHardwareInput(ram_mb=8192), db)  # tem hardware junto
    delete_computer(pc.id, db=db)
    with pytest.raises(HTTPException) as exc_info:
        get_computer(pc.id, db=db)
    assert exc_info.value.status_code == 404


def test_hard_delete_computer_blocked_when_in_cycle(db):
    pc = create_computer(ComputerCreate(patrimonio="PAT-001", hostname=None, setor_atual_id=1), db)
    db.add(MaintenanceCycleItem(
        ciclo_id=1, computador_id=pc.id, prioridade="normal", status="planejado",
        criado_em=datetime.now(timezone.utc),
    ))
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        delete_computer(pc.id, db=db)
    assert exc_info.value.status_code == 409


def test_hard_delete_computer_unknown_id(db):
    with pytest.raises(HTTPException) as exc_info:
        delete_computer(999, db=db)
    assert exc_info.value.status_code == 404


def test_list_computers_includes_pc_without_setor(db):
    create_computer(ComputerCreate(patrimonio=None, hostname="pc-glpi", setor_atual_id=1), db)
    result = update_computer(
        list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=False, db=db)
        ["items"][0].id,
        ComputerUpdate(setor_atual_id=None),
        db,
    )
    assert result.setor_atual_id is None
    listado = list_computers(page=1, page_size=20, setor_atual_id=None, patrimonio=None, incluir_inativos=False, db=db)
    assert listado["items"][0].setor_atual_id is None  # nunca some da lista
