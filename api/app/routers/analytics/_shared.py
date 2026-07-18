"""Leitura de parquet direto com pandas p/ os endpoints de analytics - mesmo
padrao do fifa_analytics/api/app/routers/analytics/_shared.py. Nao ha uma
arvore por unidade aqui (ver CLAUDE.md - divergencia deliberada do padrao
"competition island" do fifa): um unico `pipeline/data/gold/`, `entities_id`
como coluna filtravel."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pandas as pd

from ti_analytics.paths import GOLD_DIR


def read_parquet(name: str) -> pd.DataFrame:
    path = Path(GOLD_DIR) / name
    if not path.exists():
        return pd.DataFrame()
    return pd.read_parquet(path)


def safe_val(v: Any) -> Any:
    if isinstance(v, float) and math.isnan(v):
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


def records(df: pd.DataFrame, cols: list[str] | None = None) -> list[dict]:
    if df.empty:
        return []
    if cols:
        df = df[cols]
    return [{k: safe_val(v) for k, v in row.items()} for row in df.to_dict("records")]
