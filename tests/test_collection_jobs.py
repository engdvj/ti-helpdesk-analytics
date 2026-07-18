from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from api.app.db import Base
from api.app.models.collection_run import CollectionRun
from api.app.routers.admin import list_collection_runs
from api.app.schemas.collection_run import CollectionRunPage
from api.app.services import collection_jobs


@pytest.fixture
def session_factory(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(collection_jobs, "SessionLocal", factory)
    return factory


def test_collection_run_persists_success(session_factory, monkeypatch):
    monkeypatch.setattr(collection_jobs, "run_pipeline", lambda: {"chamados_ti": 42, "tecnicos": 7})
    monkeypatch.setattr(collection_jobs, "seed_units", lambda db: None)
    monkeypatch.setattr(collection_jobs, "seed_technicians", lambda db: None)

    with session_factory() as db:
        created = collection_jobs.create_collection_run(db, "admin")
        run_id = created.id

    collection_jobs.execute_collection_run(run_id)

    with session_factory() as db:
        finished = db.get(CollectionRun, run_id)
        assert finished is not None
        assert finished.status == "success"
        assert finished.counts == {"chamados_ti": 42, "tecnicos": 7}
        assert finished.started_at is not None
        assert finished.finished_at is not None
        assert finished.duration_seconds is not None
        assert finished.duration_seconds >= 0
        assert finished.error is None


def test_collection_run_persists_error_and_traceback(session_factory, monkeypatch):
    def fail_pipeline():
        raise RuntimeError("GLPI indisponivel")

    monkeypatch.setattr(collection_jobs, "run_pipeline", fail_pipeline)

    with session_factory() as db:
        created = collection_jobs.create_collection_run(db, "admin")
        run_id = created.id

    collection_jobs.execute_collection_run(run_id)

    with session_factory() as db:
        failed = db.get(CollectionRun, run_id)
        assert failed is not None
        assert failed.status == "error"
        assert failed.error == "RuntimeError: GLPI indisponivel"
        assert failed.error_details is not None
        assert "fail_pipeline" in failed.error_details
        assert failed.finished_at is not None


def test_collection_run_rejects_a_second_active_job(session_factory):
    with session_factory() as db:
        first = collection_jobs.create_collection_run(db, "admin")
        with pytest.raises(collection_jobs.CollectionAlreadyRunningError) as exc_info:
            collection_jobs.create_collection_run(db, "admin")
        assert exc_info.value.run.id == first.id


def test_startup_marks_abandoned_job_as_interrupted(session_factory):
    with session_factory() as db:
        run = collection_jobs.create_collection_run(db, "admin")
        run.status = "running"
        run.started_at = collection_jobs.utc_now() - timedelta(seconds=15)
        db.commit()

        assert collection_jobs.mark_interrupted_collection_runs(db) == 1
        db.refresh(run)
        assert run.status == "error"
        assert "reiniciado" in (run.error or "")
        assert run.duration_seconds is not None
        assert run.duration_seconds >= 15


def test_collection_history_supports_sort_filter_and_pagination(session_factory):
    with session_factory() as db:
        oldest = collection_jobs.create_collection_run(db, "ana")
        oldest.status = "success"
        oldest.duration_seconds = 30
        oldest.requested_at = collection_jobs.utc_now() - timedelta(hours=2)
        db.commit()

        failed = collection_jobs.create_collection_run(db, "bruno")
        failed.status = "error"
        failed.duration_seconds = 5
        failed.requested_at = collection_jobs.utc_now() - timedelta(hours=1)
        db.commit()

        active = collection_jobs.create_collection_run(db, "carla")

        response = list_collection_runs(
            page=1,
            page_size=5,
            sort_by="duration_seconds",
            sort_dir="asc",
            status_filter=None,
            db=db,
        )
        parsed = CollectionRunPage.model_validate(response)
        assert parsed.total == 3
        assert parsed.total_pages == 1
        assert [item.id for item in parsed.items] == [failed.id, oldest.id, active.id]
        assert parsed.active is not None
        assert parsed.active.id == active.id

        only_errors = list_collection_runs(
            page=1,
            page_size=5,
            sort_by="requested_at",
            sort_dir="desc",
            status_filter="error",
            db=db,
        )
        parsed_errors = CollectionRunPage.model_validate(only_errors)
        assert parsed_errors.total == 1
        assert [item.id for item in parsed_errors.items] == [failed.id]
        # A execucao ativa continua vindo separada mesmo quando o filtro da
        # tabela esta em outro status, mantendo o botao protegido.
        assert parsed_errors.active is not None
        assert parsed_errors.active.id == active.id


def test_collection_schema_restores_utc_timezone_from_sqlite():
    run = CollectionRun(
        id="timezone-test",
        status="running",
        requested_by="admin",
        requested_at=datetime(2026, 7, 18, 20, 57, 25),
        started_at=datetime(2026, 7, 18, 20, 57, 26),
    )

    parsed = CollectionRunPage.model_validate({
        "items": [run],
        "page": 1,
        "page_size": 10,
        "total": 1,
        "total_pages": 1,
        "active": run,
    })
    serialized = parsed.model_dump(mode="json")

    assert parsed.items[0].requested_at.tzinfo == timezone.utc
    assert serialized["items"][0]["requested_at"] == "2026-07-18T20:57:25Z"
    assert serialized["items"][0]["started_at"] == "2026-07-18T20:57:26Z"
