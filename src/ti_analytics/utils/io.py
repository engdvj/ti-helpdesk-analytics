import json
import os
import time
from pathlib import Path
from typing import Any

import pandas as pd
import yaml


def ensure_dir(path: str | Path) -> Path:
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: str | Path, data: Any) -> Path:
    path = Path(path)
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2, default=str)
    return path


def read_json(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as file:
        return json.load(file)


def write_yaml(path: str | Path, data: Any) -> Path:
    path = Path(path)
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as file:
        yaml.safe_dump(data, file, sort_keys=False, allow_unicode=True)
    return path


def write_dataframe(path: str | Path, dataframe: pd.DataFrame) -> Path:
    """Grava o DataFrame em parquet de forma atomica (temp file + os.replace).

    Sem isso, uma coleta rodando enquanto a API le o mesmo arquivo pode entregar
    um parquet truncado. Com troca atomica o leitor sempre ve a versao antiga
    completa ou a nova completa (mesmo padrao do fifa_analytics/utils/io.py).
    """
    path = Path(path)
    ensure_dir(path.parent)
    tmp = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    try:
        dataframe.to_parquet(tmp, index=False)
        for attempt in range(5):
            try:
                os.replace(tmp, path)
                break
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.1)
    finally:
        if tmp.exists():
            tmp.unlink()
    return path


def read_dataframe(path: str | Path) -> pd.DataFrame:
    return pd.read_parquet(path)
