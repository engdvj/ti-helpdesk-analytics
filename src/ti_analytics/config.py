import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

from ti_analytics.paths import CONFIG_DIR, PROJECT_ROOT, SCHEMAS_DIR

load_dotenv(PROJECT_ROOT / ".env")


def load_yaml(path: str | Path) -> dict[str, Any]:
    """Le um YAML e devolve dict vazio se o arquivo estiver vazio."""
    with Path(path).open("r", encoding="utf-8") as file:
        return yaml.safe_load(file) or {}


def load_config(name: str) -> dict[str, Any]:
    return load_yaml(CONFIG_DIR / name)


def load_schema(name: str) -> dict[str, Any]:
    return load_yaml(SCHEMAS_DIR / name)


class GlpiConfig:
    """Credenciais do GLPI - sempre via env, nunca hardcoded."""

    def __init__(self) -> None:
        self.base_url = os.environ["GLPI_URL"]
        self.api_path = os.environ.get("GLPI_API_PATH", "/api.php/v1")
        self.app_token = os.environ["GLPI_APP_TOKEN"]
        self.user_token = os.environ["GLPI_USER_TOKEN"]

    @property
    def api_url(self) -> str:
        return self.base_url + self.api_path
