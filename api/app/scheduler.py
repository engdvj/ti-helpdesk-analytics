"""Coleta automatica em intervalo configuravel, ajustavel sem reiniciar.

Diferente do scheduler do fifa_analytics (que faz polling leve do calendario
oficial e so dispara a coleta pesada quando um jogo termina de verdade) - o
GLPI nao tem um sinal leve equivalente pra "algo mudou". Entao aqui e uma
checagem leve a cada CHECK_INTERVAL_SECONDS que compara quanto tempo passou
desde a ultima coleta contra o intervalo configurado - dispara a mesma coleta
do POST /admin/collect quando vence, pulando se ja tiver uma em andamento
(create_collection_run ja rejeita concorrencia).

O intervalo mora em pipeline/config/auto_collect.yaml (mesmo padrao de
score_weights.yaml/score_targets.yaml - editavel pelo painel /admin, GET
/admin/auto-collect e publico, PUT exige admin). AUTO_COLLECT_MINUTES (env)
so serve de valor inicial pra quando esse arquivo ainda nao existe."""
from __future__ import annotations

import os
import threading
import time

from api.app.db import SessionLocal
from api.app.services import collection_jobs
from ti_analytics.config import load_config
from ti_analytics.paths import CONFIG_DIR
from ti_analytics.utils.io import write_yaml
from ti_analytics.utils.logging import get_logger

log = get_logger("auto_collect")

REQUESTED_BY_AUTO = "auto"
AUTO_COLLECT_CONFIG_FILE = "auto_collect.yaml"
# Granularidade da checagem, nao o intervalo de coleta em si - o intervalo
# real (load_auto_collect_minutes) pode ser bem maior; checar a cada minuto e
# barato e deixa mudar o valor pelo painel sem esperar a thread reiniciar.
CHECK_INTERVAL_SECONDS = 60.0


def _env_minutes(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def load_auto_collect_minutes() -> float:
    """Intervalo em uso agora (minutos, 0 = desligado)."""
    try:
        configured = load_config(AUTO_COLLECT_CONFIG_FILE)
    except FileNotFoundError:
        return _env_minutes("AUTO_COLLECT_MINUTES", 0.0)
    if not configured or "minutes" not in configured:
        return _env_minutes("AUTO_COLLECT_MINUTES", 0.0)
    try:
        return max(0.0, float(configured["minutes"]))
    except (TypeError, ValueError):
        return _env_minutes("AUTO_COLLECT_MINUTES", 0.0)


def save_auto_collect_minutes(minutes: float) -> None:
    write_yaml(CONFIG_DIR / AUTO_COLLECT_CONFIG_FILE, {"minutes": max(0.0, minutes)})


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


def _loop() -> None:
    last_collect = time.monotonic()
    while True:
        time.sleep(CHECK_INTERVAL_SECONDS)
        minutes = load_auto_collect_minutes()
        if minutes <= 0:
            continue
        if time.monotonic() - last_collect < minutes * 60:
            continue
        last_collect = time.monotonic()
        try:
            _collect_once()
        except Exception:  # noqa: BLE001 - erro isolado nunca derruba a thread
            log.exception("auto-collect: falha na coleta automatica")


def start_auto_collect() -> threading.Thread:
    """Sempre liga a thread de checagem - o intervalo e dinamico (ver
    load_auto_collect_minutes), entao 0/desligado so significa que ela nunca
    dispara, sem precisar reiniciar o container quando o admin muda o valor."""
    thread = threading.Thread(target=_loop, name="auto-collect", daemon=True)
    thread.start()
    minutes = load_auto_collect_minutes()
    status = "desligado" if minutes <= 0 else f"a cada {minutes:.0f} min"
    log.info("auto-collect ligado (checagem a cada %.0fs): %s", CHECK_INTERVAL_SECONDS, status)
    return thread
