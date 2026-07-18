import pandas as pd
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.app.db import Base
from api.app.models.technician import Technician
from api.app.models.unit import Unit
from api.app.routers import admin
from api.app.routers.analytics.snapshots import (
    _apply_current_category_difficulty,
    _filter_by_technician_catalog,
)


def test_current_category_override_replaces_materialized_parquet_value():
    wide = pd.DataFrame([
        {"tickets_id": 1, "itilcategories_id": 10, "dificuldade_categoria": 1.25},
        {"tickets_id": 2, "itilcategories_id": 20, "dificuldade_categoria": 99.0},
        {"tickets_id": 3, "itilcategories_id": 30, "dificuldade_categoria": 99.0},
    ])
    fact = pd.DataFrame([
        {"tickets_id": 1, "itilcategories_id": 10, "is_solved": True, "solve_delay_stat": 3600},
        {"tickets_id": 2, "itilcategories_id": 20, "is_solved": True, "solve_delay_stat": 7200},
    ])

    refreshed = _apply_current_category_difficulty(wide, fact, overrides={10: 4.0})
    difficulty = refreshed.set_index("itilcategories_id")["dificuldade_categoria"]

    assert difficulty.loc[10] == 4.0
    assert difficulty.loc[20] != 99.0
    assert difficulty.loc[30] == 1.0


def test_scope_excludes_inactive_and_respects_unit_assignment():
    wide = pd.DataFrame([
        {"users_id": 1, "tickets_id": 10},
        {"users_id": 2, "tickets_id": 20},
        {"users_id": 3, "tickets_id": 30},
        {"users_id": 4, "tickets_id": 40},
    ])
    dim = pd.DataFrame([
        {"users_id": 1, "nome_completo": "A", "username": "a", "papel": "plantonista"},
        {"users_id": 2, "nome_completo": "B", "username": "b", "papel": "plantonista"},
        {"users_id": 3, "nome_completo": "C", "username": "c", "papel": "plantonista"},
        {"users_id": 4, "nome_completo": "D", "username": "d", "papel": "plantonista"},
    ])
    catalog = pd.DataFrame([
        {"users_id": 1, "papel": "tatico", "ativo": True, "unidade_slug": "hgvc"},
        {"users_id": 2, "papel": "plantonista", "ativo": True, "unidade_slug": "upa"},
        {"users_id": 3, "papel": "coordenadora", "ativo": True, "unidade_slug": None},
        {"users_id": 4, "papel": "plantonista", "ativo": False, "unidade_slug": "hgvc"},
    ])

    scoped_wide, scoped_dim = _filter_by_technician_catalog(wide, dim, catalog, "hgvc")
    assert set(scoped_wide["users_id"]) == {1, 3}
    assert set(scoped_dim["users_id"]) == {1, 3}
    configured = scoped_dim.set_index("users_id")
    assert configured.loc[1, "papel"] == "tatico"
    assert configured.loc[1, "unidade_slug"] == "hgvc"
    assert configured.loc[3, "unidade_slug"] is None

    general_wide, _ = _filter_by_technician_catalog(wide, dim, catalog, None)
    assert set(general_wide["users_id"]) == {1, 2, 3}


def _catalog_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine)
    session.add(Unit(slug="hgvc", nome="HGVC", entities_id=9, completename="HGVC > TI", ativa=True, ordem=0))
    session.add(Technician(
        users_id=1,
        username="tecnico",
        nome_completo="Tecnico",
        glpi_profile="Technician",
        papel="plantonista",
        ativo=True,
    ))
    session.commit()
    return session


def test_admin_updates_status_unit_and_role_immediately(monkeypatch):
    session = _catalog_session()
    monkeypatch.setattr(admin, "set_papel_override", lambda *_args, **_kwargs: None)

    updated = admin.update_technician_profile(
        1,
        admin.TechnicianProfileUpdate(papel="tatico", ativo=False, unidade_slug="hgvc"),
        session,
    )

    assert updated.papel == "tatico"
    assert updated.ativo is False
    assert updated.unidade_slug == "hgvc"
    session.close()


def test_admin_rejects_unknown_unit():
    session = _catalog_session()
    with pytest.raises(HTTPException) as exc:
        admin.update_technician_profile(
            1,
            admin.TechnicianProfileUpdate(unidade_slug="inexistente"),
            session,
        )
    assert exc.value.status_code == 400
    session.close()
