"""Sincronizacao de computadores contra o GLPI (agent/glpiinventory) - so
leitura, nunca escreve no GLPI (o usuario reportou o proprio painel web do
GLPI bugado pra trocar entidade/atribuir "Usuario" agora - decisao explicita:
o vinculo com o setor vive so na plataforma, ver docs/requisitos.md Épico A).

Mais simples que services/setor_sync.py: nao precisa descobrir grupo/
categoria, so pega `/Computer` inteiro e resolve o setor localmente contra
`sectors.id_glpi` (campo GLPI "Usuário" = Computer.users_id, ja combinado que
pode estar vazio/errado - so aproveita quando bate com um Setor conhecido,
nunca e obrigatorio). Mesmo padrao de lock/CollectionRun de setor_sync.py."""
from __future__ import annotations

from threading import Lock
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import SessionLocal
from api.app.models.collection_run import CollectionRun
from api.app.models.computer import Computer
from api.app.models.computer_hardware import ComputerHardware
from api.app.models.sector import Sector
from api.app.services.collection_jobs import (
    ACTIVE_COLLECTION_STATUSES,
    _duration,
    _mark_failed,
    prune_sync_runs,
    utc_now,
)
from api.app.services.hardware_sync import fetch_all_hardware
from ti_analytics.config import GlpiConfig
from ti_analytics.glpi.client import get_paginated, init_session, kill_session

TIPO = "computadores"

_start_lock = Lock()
_execution_lock = Lock()


class ComputerSyncAlreadyRunningError(RuntimeError):
    def __init__(self, run: CollectionRun):
        super().__init__("Ja existe uma sincronizacao de computadores em andamento.")
        self.run = run


def create_computer_sync_run(db: Session, requested_by: str) -> CollectionRun:
    with _start_lock:
        active = db.scalar(
            select(CollectionRun)
            .where(CollectionRun.tipo == TIPO, CollectionRun.status.in_(ACTIVE_COLLECTION_STATUSES))
            .order_by(CollectionRun.requested_at.desc())
            .limit(1)
        )
        if active is not None:
            raise ComputerSyncAlreadyRunningError(active)

        run = CollectionRun(
            id=str(uuid4()),
            tipo=TIPO,
            status="queued",
            requested_by=requested_by,
            requested_at=utc_now(),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run


def _fetch_computers_from_glpi() -> list[dict]:
    """So leitura - busca tudo antes de qualquer escrita local (mesmo
    principio de _fetch_sectors_from_glpi: falha aqui nao apaga dado local).
    is_template/is_deleted filtrados fora - nao sao PC de verdade em uso."""
    cfg = GlpiConfig()
    session_token = init_session(cfg)
    try:
        rows = get_paginated(cfg, "/Computer", session_token)
    finally:
        kill_session(cfg, session_token)
    return [row for row in rows if not row.get("is_template") and not row.get("is_deleted")]


def _upsert_computers(db: Session, fetched: list[dict]) -> dict[str, int]:
    setores_por_glpi_id = {sector.id_glpi: sector for sector in db.scalars(select(Sector)).all()}
    existentes = {
        computer.id_glpi_computer: computer
        for computer in db.scalars(select(Computer).where(Computer.id_glpi_computer.is_not(None))).all()
    }

    criados = atualizados = sem_setor = sem_patrimonio = 0
    for row in fetched:
        glpi_id = int(row["id"])
        hostname = (row.get("name") or "").strip() or None
        # patrimonio NAO vem do `serial` (nº de serie do fabricante) - e uma
        # etiqueta externa (setor de patrimonio do hospital), so `otherserial`
        # ("Número de inventário" no GLPI) e digitado por humano igual ao
        # nosso patrimonio. Vazio fica None (nunca inventa valor).
        patrimonio = (row.get("otherserial") or "").strip() or None
        if patrimonio is None:
            sem_patrimonio += 1

        users_id = int(row.get("users_id") or 0)
        setor = setores_por_glpi_id.get(users_id) if users_id else None
        if setor is None:
            sem_setor += 1

        computer = existentes.get(glpi_id)
        if computer is None:
            # colisao de patrimonio com um PC ja cadastrado (manual ou de
            # outro Computer do GLPI) - so acontece quando `otherserial` bate
            # com algo existente; nunca derruba o sync inteiro por causa de 1
            # item, so evita a violacao de unique com um sufixo visivel.
            if patrimonio is not None and db.scalar(
                select(Computer).where(Computer.patrimonio == patrimonio)
            ) is not None:
                patrimonio = f"{patrimonio}-glpi{glpi_id}"
            db.add(Computer(
                id_glpi_computer=glpi_id,
                patrimonio=patrimonio,
                hostname=hostname,
                setor_atual_id=setor.id_glpi if setor else None,
                criado_em=utc_now(),
                ativo=True,
            ))
            criados += 1
        else:
            computer.hostname = hostname
            computer.patrimonio = patrimonio
            # nunca zera um setor ja atribuido na plataforma so porque o GLPI
            # nao resolveu dessa vez (users_id vazio/apontando pra outro User)
            # - atribuicao de setor e 100% nossa agora, nao do GLPI.
            if setor is not None:
                computer.setor_atual_id = setor.id_glpi
            atualizados += 1

    return {
        "computadores_criados": criados,
        "computadores_atualizados": atualizados,
        "sem_setor_resolvido": sem_setor,
        "sem_patrimonio": sem_patrimonio,
    }


def _sync_hardware(db: Session, fetched: list[dict]) -> dict[str, int]:
    """Roda depois de `_upsert_computers` (precisa do `Computer.id` local já
    existindo). Sessão GLPI própria - `_fetch_computers_from_glpi` já fechou
    a dela antes de `_upsert_computers` commitar (mesmo motivo: nunca segurar
    conexão HTTP aberta por cima de um commit de banco)."""
    glpi_ids = [int(row["id"]) for row in fetched]
    if not glpi_ids:
        return {"hardware_atualizado": 0}

    cfg = GlpiConfig()
    session_token = init_session(cfg)
    try:
        hardware_por_glpi_id = fetch_all_hardware(cfg, session_token, glpi_ids)
    finally:
        kill_session(cfg, session_token)

    computers = {
        computer.id_glpi_computer: computer
        for computer in db.scalars(select(Computer).where(Computer.id_glpi_computer.in_(glpi_ids))).all()
    }
    existentes = {hw.computer_id: hw for hw in db.scalars(select(ComputerHardware)).all()}

    atualizados = 0
    for glpi_id, dados in hardware_por_glpi_id.items():
        computer = computers.get(glpi_id)
        if computer is None:
            continue
        hw = existentes.get(computer.id)
        if hw is None:
            hw = ComputerHardware(computer_id=computer.id, **dados)
            db.add(hw)
        else:
            for campo, valor in dados.items():
                setattr(hw, campo, valor)
        atualizados += 1

    return {"hardware_atualizado": atualizados}


def execute_computer_sync(run_id: str) -> None:
    """Executa em background - mesmo formato de execute_sector_sync."""
    with _execution_lock:
        db = SessionLocal()
        try:
            run = db.get(CollectionRun, run_id)
            if run is None or run.status != "queued":
                return

            run.status = "running"
            run.started_at = utc_now()
            db.commit()

            try:
                fetched = _fetch_computers_from_glpi()
                counts = _upsert_computers(db, fetched)
                db.commit()
                counts.update(_sync_hardware(db, fetched))

                run = db.get(CollectionRun, run_id)
                if run is None:
                    return
                finished_at = utc_now()
                run.status = "success"
                run.finished_at = finished_at
                run.duration_seconds = _duration(run.started_at, finished_at)
                run.counts = counts
                run.error = None
                run.error_details = None
                db.commit()
                prune_sync_runs(db, TIPO)
            except Exception as exc:
                _mark_failed(db, run_id, exc)
        finally:
            db.close()
