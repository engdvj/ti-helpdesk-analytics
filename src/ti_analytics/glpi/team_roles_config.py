"""Escrita programatica em team_roles.yaml - so o campo `overrides` (por
users_id), nunca `default_por_profile`. Usado pelo painel /admin pra editar
papel sem precisar abrir o YAML na mao.

IMPORTANTE: papel so e realmente recalculado numa proxima coleta -
`normalize_technicians()` (glpi/transforms.py) le team_roles.yaml no
momento da coleta e grava o resultado em dim_tecnico.parquet, que por sua
vez alimenta tanto o catalogo Postgres (seed_technicians, reseedado a cada
coleta) quanto o motor de score. Mudar aqui sem rodar `ti-analytics coletar`
(ou POST /admin/collect) depois nao muda o que ja esta servido."""
from __future__ import annotations

from pathlib import Path

from ti_analytics.config import load_yaml
from ti_analytics.paths import CONFIG_DIR
from ti_analytics.utils.io import write_yaml

TEAM_ROLES_PATH = CONFIG_DIR / "team_roles.yaml"
VALID_PAPEIS = {"plantonista", "tatico", "coordenadora"}


def set_papel_override(users_id: int, papel: str | None, path: Path | None = None) -> dict:
    """papel=None remove o override (volta a usar default_por_profile)."""
    config_path = path or TEAM_ROLES_PATH
    config = load_yaml(config_path) if config_path.exists() else {}
    overrides: dict[int, str] = {int(k): v for k, v in config.get("overrides", {}).items()}
    if papel:
        overrides[users_id] = papel
    else:
        overrides.pop(users_id, None)
    config["overrides"] = overrides
    write_yaml(config_path, config)
    return config
