"""Coleta automatica em intervalo fixo - cobre o gating por env e o
pulo quando ja existe uma coleta ativa (sem rodar o pipeline real)."""
from __future__ import annotations

from api.app import db as api_db
from api.app import scheduler
from api.app.scheduler import REQUESTED_BY_AUTO, _collect_once, _env_minutes, start_auto_collect
from api.app.services import collection_jobs


def test_desligado_sem_env(monkeypatch):
    monkeypatch.delenv("AUTO_COLLECT_MINUTES", raising=False)
    assert start_auto_collect() is None


def test_desligado_com_zero(monkeypatch):
    monkeypatch.setenv("AUTO_COLLECT_MINUTES", "0")
    assert start_auto_collect() is None


def test_valor_invalido_nao_quebra(monkeypatch):
    monkeypatch.setenv("AUTO_COLLECT_MINUTES", "abc")
    assert start_auto_collect() is None


def test_env_minutes_parsing(monkeypatch):
    monkeypatch.delenv("X", raising=False)
    assert _env_minutes("X", 10.0) == 10.0
    monkeypatch.setenv("X", "")
    assert _env_minutes("X", 10.0) == 10.0
    monkeypatch.setenv("X", "abc")
    assert _env_minutes("X", 10.0) == 10.0
    monkeypatch.setenv("X", "5")
    assert _env_minutes("X", 10.0) == 5.0


def test_ligado_retorna_thread_daemon(monkeypatch):
    # intervalo grande: a thread so dorme durante o teste (daemon, morre com o processo).
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
