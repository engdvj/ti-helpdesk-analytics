"""Coleta automatica em intervalo fixo.

Diferente do scheduler do fifa_analytics (que faz polling leve do calendario
oficial e so dispara a coleta pesada quando um jogo termina de verdade) - o
GLPI nao tem um sinal leve equivalente pra "algo mudou". Entao aqui e so
sleep(intervalo) + dispara a mesma coleta do POST /admin/collect, pulando se
ja tiver uma em andamento (create_collection_run ja rejeita concorrencia).

Env:
  AUTO_COLLECT_MINUTES  intervalo entre coletas automaticas (0/ausente = desligado)
"""
from __future__ import annotations

import os
import threading
import time

from api.app.db import SessionLocal
from api.app.services import collection_jobs
from ti_analytics.utils.logging import get_logger

log = get_logger("auto_collect")

REQUESTED_BY_AUTO = "auto"


def _env_minutes(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _collect_once() -> None:
    db = SessionLocal()
    try:
        run = collection_jobs.create_collection_run(db, REQUESTED_BY_AUTO)
    except collection_jobs.CollectionAlreadyRunningError:
        log.info("auto-collect: pulando, ja tem coleta em andamento")
        return
    finally:
        db.close()

    collection_jobs.execute_collection_run(run.id)  # ja cuida da propria sessao + prune_old_collections


def _loop(interval_seconds: float) -> None:
    while True:
        time.sleep(interval_seconds)
        try:
            _collect_once()
        except Exception:  # noqa: BLE001 - erro isolado nunca derruba a thread
            log.exception("auto-collect: falha na coleta automatica")


def start_auto_collect() -> threading.Thread | None:
    """Liga o agendador se AUTO_COLLECT_MINUTES > 0. Retorna a thread (ou None)."""
    minutes = _env_minutes("AUTO_COLLECT_MINUTES", 0.0)
    if minutes <= 0:
        return None
    thread = threading.Thread(
        target=_loop, args=(minutes * 60,), name="auto-collect", daemon=True
    )
    thread.start()
    log.info("auto-collect ligado: a cada %.0f min", minutes)
    return thread
