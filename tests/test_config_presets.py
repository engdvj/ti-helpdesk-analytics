from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from api.app.routers import admin
from ti_analytics.analytics.presets import load_presets, save_presets


def _parameters(*, volume: float = 0.31) -> admin.PresetParameters:
    remainder = 1.0 - volume
    return admin.PresetParameters.model_validate({
        "score_weights": {
            "score_volume": volume,
            "score_complexidade": remainder * 0.21 / 0.69,
            "score_velocidade_resposta": remainder * 0.16 / 0.69,
            "score_abrangencia": remainder * 0.13 / 0.69,
            "score_qualidade": remainder * 0.19 / 0.69,
        },
        "score_targets": {
            "volume_por_dia": 3.0,
            "complexidade_categoria": 1.0,
            "resposta_min": 60.0,
            "abrangencia_ratio": 0.35,
            "qualidade": 70.0,
        },
        "category_overrides": {41: 4.0},
        "role_visibility": {
            "mostrar_plantonistas": True,
            "mostrar_taticos": False,
            "mostrar_coordenacao": False,
        },
    })


def _preset(name: str = "Operação normal") -> admin.ConfigPreset:
    now = datetime.now(timezone.utc)
    return admin.ConfigPreset(
        id="a" * 32,
        nome=name,
        criado_em=now,
        atualizado_em=now,
        parametros=_parameters(),
    )


def test_preset_file_round_trip_and_rejects_unknown_format(tmp_path):
    path = tmp_path / "presets.json"
    payload = [_preset().model_dump(mode="json")]
    save_presets(payload, path)
    assert load_presets(path) == payload

    path.write_text('{"formato":"outro","versao":1,"presets":[]}', encoding="utf-8")
    with pytest.raises(ValueError, match="formato invalido"):
        load_presets(path)


def test_preset_rejects_weights_that_do_not_sum_one():
    payload = _parameters().model_dump()
    payload["score_weights"]["score_volume"] = 0.9
    with pytest.raises(ValidationError, match="pesos devem somar 1.0"):
        admin.PresetParameters.model_validate(payload)


def test_apply_restores_previous_parameters_when_write_fails(monkeypatch):
    previous = _parameters()
    requested = _parameters(volume=0.4)
    writes: list[admin.PresetParameters] = []

    monkeypatch.setattr(admin, "_current_preset_parameters", lambda: previous)

    def write(parameters: admin.PresetParameters):
        writes.append(parameters)
        if len(writes) == 1:
            raise OSError("disco indisponivel")

    monkeypatch.setattr(admin, "_write_preset_parameters", write)

    with pytest.raises(OSError, match="disco indisponivel"):
        admin._apply_preset_parameters(requested)
    assert writes == [requested, previous]


def test_import_replaces_preset_with_same_name(monkeypatch):
    existing = _preset()
    imported = existing.model_copy(update={
        "id": "b" * 32,
        "parametros": _parameters(volume=0.4),
    })
    saved: list[admin.ConfigPreset] = []
    monkeypatch.setattr(admin, "_load_config_presets", lambda: [existing])
    monkeypatch.setattr(admin, "_save_config_presets", lambda presets: saved.extend(presets))

    result = admin.import_config_presets(admin.PresetBundle(
        formato="ti-helpdesk-analytics-presets",
        versao=1,
        presets=[imported],
    ))

    assert len(result) == 1
    assert result[0].id == imported.id
    assert saved[0].parametros.score_weights.score_volume == 0.4
