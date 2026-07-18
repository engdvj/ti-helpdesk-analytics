"""Validacao real de schema (o fifa_analytics tinha o hook mas nunca chamava -
aqui load_schema() e de fato usado, no fim de cada normalize_*() em
glpi/transforms.py). Checa: colunas obrigatorias presentes e sem nulo onde
`nullable: false`. Nao valida tipo estritamente - o formato dos dados do GLPI
e simples o bastante pra isso ja pegar a maioria dos bugs reais."""
from __future__ import annotations

import pandas as pd

from ti_analytics.config import load_schema
from ti_analytics.utils.logging import get_logger

logger = get_logger(__name__)


class SchemaValidationError(ValueError):
    pass


def validate_dataframe(df: pd.DataFrame, schema_name: str, *, allow_empty: bool = True) -> None:
    schema = load_schema(schema_name)
    columns: dict = schema.get("columns", {})

    if df.empty:
        if allow_empty:
            logger.info("%s: DataFrame vazio (permitido)", schema_name)
            return
        raise SchemaValidationError(f"{schema_name}: DataFrame vazio nao permitido")

    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise SchemaValidationError(f"{schema_name}: colunas ausentes {missing}")

    problems = []
    for col, spec in columns.items():
        if not spec.get("nullable", True):
            n_null = int(df[col].isna().sum())
            if n_null:
                problems.append(f"{col}: {n_null} valores nulos (coluna obrigatoria)")
    if problems:
        raise SchemaValidationError(f"{schema_name}: " + "; ".join(problems))

    logger.info("%s: OK (%d linhas)", schema_name, len(df))
