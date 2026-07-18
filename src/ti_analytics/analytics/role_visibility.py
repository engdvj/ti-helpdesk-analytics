from __future__ import annotations

from pathlib import Path

from ti_analytics.config import load_yaml
from ti_analytics.paths import CONFIG_DIR
from ti_analytics.utils.io import write_yaml

DEFAULT_ROLE_VISIBILITY: dict[str, bool] = {
    "mostrar_plantonistas": True,
    "mostrar_taticos": True,
    "mostrar_coordenacao": True,
}

ROLE_VISIBILITY_PATH = CONFIG_DIR / "role_visibility.yaml"


def load_role_visibility(path: Path | None = None) -> dict[str, bool]:
    """Carrega quais papeis podem aparecer nas paginas publicas.

    Plantonistas permanecem ativos por padrao, inclusive ao carregar um
    arquivo antigo que ainda nao possua a chave correspondente.
    """
    config_path = path or ROLE_VISIBILITY_PATH
    if not config_path.exists():
        return dict(DEFAULT_ROLE_VISIBILITY)

    configured = load_yaml(config_path)
    return {
        key: value if isinstance(value, bool) else DEFAULT_ROLE_VISIBILITY[key]
        for key, value in ((key, configured.get(key)) for key in DEFAULT_ROLE_VISIBILITY)
    }


def save_role_visibility(settings: dict[str, bool], path: Path | None = None) -> dict[str, bool]:
    normalized = {
        key: bool(settings.get(key, default))
        for key, default in DEFAULT_ROLE_VISIBILITY.items()
    }
    write_yaml(path or ROLE_VISIBILITY_PATH, normalized)
    return normalized
