"""Persistencia atomica dos presets de configuracao analitica.

Os fatos coletados do GLPI nao entram aqui. Um preset contem apenas regras
reaplicaveis (pesos, metas, overrides de categoria e visibilidade), podendo
ser transportado entre instalacoes pelo bundle JSON versionado.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from ti_analytics.paths import CONFIG_DIR

PRESETS_FORMAT = "ti-helpdesk-analytics-presets"
PRESETS_VERSION = 1
PRESETS_PATH = CONFIG_DIR / "analytics_presets.json"


def load_presets(path: Path | None = None) -> list[dict[str, Any]]:
    config_path = path or PRESETS_PATH
    if not config_path.exists():
        return []
    with config_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict) or payload.get("formato") != PRESETS_FORMAT:
        raise ValueError("arquivo de presets com formato invalido")
    if payload.get("versao") != PRESETS_VERSION or not isinstance(payload.get("presets"), list):
        raise ValueError("versao de presets nao suportada")
    return payload["presets"]


def preset_bundle(presets: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "formato": PRESETS_FORMAT,
        "versao": PRESETS_VERSION,
        "presets": presets,
    }


def save_presets(presets: list[dict[str, Any]], path: Path | None = None) -> None:
    """Grava por troca atomica: queda durante o save nao corrompe o backup."""
    config_path = path or PRESETS_PATH
    config_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = config_path.with_name(f"{config_path.name}.tmp.{os.getpid()}.{uuid4().hex}")
    try:
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(preset_bundle(presets), file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, config_path)
    finally:
        if temporary.exists():
            temporary.unlink()
