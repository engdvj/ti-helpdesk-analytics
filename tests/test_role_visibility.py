import pytest
from fastapi import HTTPException

from api.app.routers import admin
from ti_analytics.analytics import role_visibility
from ti_analytics.analytics.role_visibility import (
    DEFAULT_ROLE_VISIBILITY,
    load_role_visibility,
    save_role_visibility,
)


def test_role_visibility_uses_defaults_when_file_is_missing(tmp_path):
    assert load_role_visibility(tmp_path / "missing.yaml") == DEFAULT_ROLE_VISIBILITY


def test_role_visibility_round_trip(tmp_path):
    path = tmp_path / "role_visibility.yaml"
    expected = {
        "mostrar_plantonistas": True,
        "mostrar_taticos": False,
        "mostrar_coordenacao": True,
    }

    assert save_role_visibility(expected, path) == expected
    assert load_role_visibility(path) == expected


def test_role_visibility_ignores_invalid_values(tmp_path):
    path = tmp_path / "role_visibility.yaml"
    path.write_text("mostrar_taticos: invalido\nmostrar_coordenacao: false\n", encoding="utf-8")

    assert load_role_visibility(path) == {
        "mostrar_plantonistas": True,
        "mostrar_taticos": True,
        "mostrar_coordenacao": False,
    }


def test_admin_role_visibility_handlers_require_auth_and_persist(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_USERNAME", "test-admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "test-password")
    monkeypatch.setattr(role_visibility, "ROLE_VISIBILITY_PATH", tmp_path / "role_visibility.yaml")

    payload = {
        "mostrar_plantonistas": True,
        "mostrar_taticos": False,
        "mostrar_coordenacao": True,
    }

    with pytest.raises(HTTPException) as exc:
        admin.require_admin(x_admin_username="", x_admin_password="")
    assert exc.value.status_code == 401

    admin.require_admin(x_admin_username="test-admin", x_admin_password="test-password")
    saved = admin.update_role_visibility(admin.RoleVisibilityUpdate(**payload))

    assert saved == payload
    assert admin.get_role_visibility() == payload
