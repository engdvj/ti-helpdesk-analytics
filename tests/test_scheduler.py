"""Coleta automatica em intervalo configuravel - cobre o parsing do valor
inicial (env), o round-trip de leitura/escrita do intervalo (arquivo de
config, editavel pelo painel /admin sem reiniciar) e o pulo quando ja existe
uma coleta ativa (sem rodar o pipeline real)."""
from __future__ import annotations

import ti_analytics.config as ti_config

from api.app import db as api_db
from api.app import scheduler
from api.app.scheduler import (
    REQUESTED_BY_AUTO,
    _collect_once,
    _env_minutes,
    load_auto_collect_minutes,
    save_auto_collect_minutes,
    start_auto_collect,
)
from api.app.services import collection_jobs


def _isolate_config_dir(monkeypatch, tmp_path):
    """`load_config` (ti_analytics.config) e `save_auto_collect_minutes`
    (scheduler.py) importam CONFIG_DIR de origens diferentes - ambos
    precisam apontar pro mesmo tmp_path pra um teste isolado ver o proprio
    round-trip sem tocar em pipeline/config/ de verdade."""
    monkeypatch.setattr(ti_config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(scheduler, "CONFIG_DIR", tmp_path)


def test_env_minutes_parsing(monkeypatch):
    monkeypatch.delenv("X", raising=False)
    assert _env_minutes("X", 10.0) == 10.0
    monkeypatch.setenv("X", "")
    assert _env_minutes("X", 10.0) == 10.0
    monkeypatch.setenv("X", "abc")
    assert _env_minutes("X", 10.0) == 10.0
    monkeypatch.setenv("X", "5")
    assert _env_minutes("X", 10.0) == 5.0


def test_load_auto_collect_minutes_cai_pro_env_sem_arquivo(tmp_path, monkeypatch):
    _isolate_config_dir(monkeypatch, tmp_path)
    monkeypatch.setenv("AUTO_COLLECT_MINUTES", "45")
    assert load_auto_collect_minutes() == 45.0


def test_load_auto_collect_minutes_sem_env_e_sem_arquivo_fica_desligado(tmp_path, monkeypatch):
    _isolate_config_dir(monkeypatch, tmp_path)
    monkeypatch.delenv("AUTO_COLLECT_MINUTES", raising=False)
    assert load_auto_collect_minutes() == 0.0


def test_save_and_load_auto_collect_minutes_round_trip(tmp_path, monkeypatch):
    _isolate_config_dir(monkeypatch, tmp_path)
    save_auto_collect_minutes(90.0)
    assert load_auto_collect_minutes() == 90.0
    # sobrescreve o valor anterior, nao acumula
    save_auto_collect_minutes(15.0)
    assert load_auto_collect_minutes() == 15.0


def test_save_auto_collect_minutes_nunca_negativo(tmp_path, monkeypatch):
    _isolate_config_dir(monkeypatch, tmp_path)
    save_auto_collect_minutes(-5.0)
    assert load_auto_collect_minutes() == 0.0


def test_ligado_sempre_retorna_thread_daemon(tmp_path, monkeypatch):
    _isolate_config_dir(monkeypatch, tmp_path)
    monkeypatch.setenv("AUTO_COLLECT_MINUTES", "60")
    t = start_auto_collect()
    assert t is not None
    assert t.daemon and t.is_alive()


def test_collect_once_pula_quando_ja_tem_coleta_ativa(monkeypatch):
    calls = []

    def fake_create(db, requested_by):
        raise collection_jobs.CollectionAlreadyRunningError(run=object())

    def fake_execute(run_id):
        calls.append(run_id)

    monkeypatch.setattr(collection_jobs, "create_collection_run", fake_create)
    monkeypatch.setattr(collection_jobs, "execute_collection_run", fake_execute)
    monkeypatch.setattr(api_db, "SessionLocal", lambda: _FakeSession())

    _collect_once()

    assert calls == []  # nunca chegou a executar - so_criou/pulou


def test_collect_once_dispara_a_coleta_marcada_como_auto(monkeypatch):
    created = []
    executed = []

    class _Run:
        id = "run-123"

    def fake_create(db, requested_by):
        created.append(requested_by)
        return _Run()

    def fake_execute(run_id):
        executed.append(run_id)

    monkeypatch.setattr(collection_jobs, "create_collection_run", fake_create)
    monkeypatch.setattr(collection_jobs, "execute_collection_run", fake_execute)
    monkeypatch.setattr(api_db, "SessionLocal", lambda: _FakeSession())

    _collect_once()

    assert created == [REQUESTED_BY_AUTO]
    assert executed == ["run-123"]


class _FakeSession:
    def close(self):
        pass
