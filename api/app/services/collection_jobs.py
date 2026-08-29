"""Agendamento e execucao persistente da coleta GLPI.

O navegador apenas cria o registro. A tarefa de fundo usa uma sessao propria,
portanto continua executando depois que a resposta HTTP termina ou a pagina e
desmontada.
"""
from __future__ import annotations

import shutil
import traceback
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import SessionLocal
from api.app.models.collection_run import CollectionRun
from api.app.seed import seed_technicians, seed_units
from ti_analytics.glpi.pipeline import run as run_pipeline
from ti_analytics.paths import RAW_DIR

ACTIVE_COLLECTION_STATUSES = ("queued", "running")
_start_lock = Lock()
_execution_lock = Lock()
# Cada coleta bem-sucedida grava ~10 arquivos brutos em pipeline/data/raw/glpi
# (um por endpoint - ver pipeline.py::_raw_path) e uma linha em CollectionRun.
# Silver/gold nunca entram aqui: sao sobrescritos a cada coleta, nao acumulam.
COLLECTION_RETENTION = 10


class CollectionAlreadyRunningError(RuntimeError):
    def __init__(self, run: CollectionRun):
        super().__init__("Ja existe uma coleta em andamento.")
        self.run = run


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_collection_run(db: Session, requested_by: str, tipo: str = "chamados") -> CollectionRun:
    """Cria uma execucao em fila, rejeitando concorrencia no mesmo processo.

    `tipo` distingue a coleta de chamados (default, unico tipo ate a feature
    de Manutencao Preventiva) da sincronizacao de setores
    (services/setor_sync.py, tipo="setores") - mesma tabela/historico
    (CollectionRun), concorrencia e retencao contadas por tipo, nunca juntas."""
    with _start_lock:
        active = db.scalar(
            select(CollectionRun)
            .where(CollectionRun.tipo == tipo, CollectionRun.status.in_(ACTIVE_COLLECTION_STATUSES))
            .order_by(CollectionRun.requested_at.desc())
            .limit(1)
        )
        if active is not None:
            raise CollectionAlreadyRunningError(active)

        run = CollectionRun(
            id=str(uuid4()),
            tipo=tipo,
            status="queued",
            requested_by=requested_by,
            requested_at=utc_now(),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run


def _mark_failed(db: Session, run_id: str, exc: Exception) -> None:
    db.rollback()
    run = db.get(CollectionRun, run_id)
    if run is None:
        return
    finished_at = utc_now()
    message = str(exc).strip() or "Erro sem mensagem."
    run.status = "error"
    run.finished_at = finished_at
    run.duration_seconds = _duration(run.started_at, finished_at)
    run.error = f"{type(exc).__name__}: {message}"[:20_000]
    run.error_details = traceback.format_exc()[-50_000:]
    db.commit()


def _duration(started_at: datetime | None, finished_at: datetime) -> float | None:
    if started_at is None:
        return None
    # SQLite pode devolver datetime sem tzinfo mesmo quando a coluna declara
    # timezone=True. Normaliza os dois lados antes da subtracao.
    start = started_at if started_at.tzinfo else started_at.replace(tzinfo=timezone.utc)
    finish = finished_at if finished_at.tzinfo else finished_at.replace(tzinfo=timezone.utc)
    return max(0.0, (finish - start).total_seconds())


def execute_collection_run(run_id: str) -> None:
    """Executa o pipeline em background e persiste qualquer resultado/erro."""
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
                raw_counts = run_pipeline()
                seed_units(db)
                seed_technicians(db)

                run = db.get(CollectionRun, run_id)
                if run is None:
                    return
                finished_at = utc_now()
                run.status = "success"
                run.finished_at = finished_at
                run.duration_seconds = _duration(run.started_at, finished_at)
                run.counts = {str(key): int(value) for key, value in raw_counts.items()}
                run.error = None
                run.error_details = None
                db.commit()
                prune_old_collections(db)
            except Exception as exc:
                _mark_failed(db, run_id, exc)
        finally:
            db.close()


def _snapshot_timestamps() -> list[str]:
    """`collected_at=` distintos em pipeline/data/raw/glpi/*/date=*/, do mais
    recente pro mais antigo. Uma coleta grava o mesmo `ts` em ~10 subpastas
    (uma por endpoint - ver pipeline.py::_raw_path), entao cada timestamp
    aqui corresponde a exatamente uma coleta."""
    glpi_dir = RAW_DIR / "glpi"
    if not glpi_dir.exists():
        return []
    timestamps = {
        p.name.removeprefix("collected_at=")
        for p in glpi_dir.glob("*/date=*/collected_at=*")
        if p.is_dir()
    }
    return sorted(timestamps, reverse=True)


def prune_old_collections(db: Session, keep: int = COLLECTION_RETENTION) -> None:
    """Mantem so as `keep` coletas mais recentes: apaga o snapshot bruto
    (pipeline/data/raw/glpi/.../collected_at=...) das mais antigas - o que
    realmente ocupa espaco - e as linhas correspondentes de CollectionRun,
    que ficam leves o bastante pra nao precisar de retencao separada.
    Silver/gold nao entram aqui - sao sobrescritos a cada coleta."""
    for ts in _snapshot_timestamps()[keep:]:
        for collected_dir in (RAW_DIR / "glpi").glob(f"*/date=*/collected_at={ts}"):
            shutil.rmtree(collected_dir, ignore_errors=True)
            date_dir = collected_dir.parent
            if date_dir.exists() and not any(date_dir.iterdir()):
                date_dir.rmdir()

    old_runs = list(
        db.scalars(
            select(CollectionRun)
            .where(
                CollectionRun.tipo == "chamados",  # setor sync (tipo="setores") tem retencao propria
                CollectionRun.status.notin_(ACTIVE_COLLECTION_STATUSES),
            )
            .order_by(CollectionRun.requested_at.desc())
            .offset(keep)
        ).all()
    )
    for run in old_runs:
        db.delete(run)
    if old_runs:
        db.commit()


def mark_interrupted_collection_runs(db: Session) -> int:
    """Fecha jobs deixados ativos por uma reinicializacao anterior da API."""
    interrupted = list(
        db.scalars(
            select(CollectionRun).where(CollectionRun.status.in_(ACTIVE_COLLECTION_STATUSES))
        ).all()
    )
    if not interrupted:
        return 0

    finished_at = utc_now()
    for run in interrupted:
        run.status = "error"
        run.finished_at = finished_at
        run.duration_seconds = _duration(run.started_at, finished_at)
        run.error = "Coleta interrompida porque o servico da API foi reiniciado."
        run.error_details = None
    db.commit()
    return len(interrupted)
