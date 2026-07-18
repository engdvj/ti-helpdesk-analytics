"""Seed do catalogo (units/technicians) a partir do gold ja coletado pelo
pipeline - a API nunca chama o GLPI direto pra subir, so le os parquets que
`ti-analytics coletar` ja escreveu. Se ainda nao rodou nenhuma coleta, sobe
vazio mesmo (endpoints de analytics devolvem 404 ate a 1a coleta)."""
from __future__ import annotations

import pandas as pd
from sqlalchemy.orm import Session

from api.app.models.technician import Technician
from api.app.models.unit import Unit
from ti_analytics.paths import GOLD_DIR


def _read_gold(name: str) -> pd.DataFrame:
    path = GOLD_DIR / name
    if not path.exists():
        return pd.DataFrame()
    return pd.read_parquet(path)


def seed_units(db: Session) -> None:
    df = _read_gold("dim_unidade.parquet")
    for _, row in df.iterrows():
        existing = db.get(Unit, row["unidade_slug"])
        if existing is None:
            db.add(Unit(
                slug=row["unidade_slug"],
                nome=row["unidade_pai"],
                entities_id=int(row["entities_id"]),
                completename=row["completename"],
                ativa=True,
                ordem=0,
            ))
        else:
            existing.nome = row["unidade_pai"]
            existing.entities_id = int(row["entities_id"])
            existing.completename = row["completename"]
    db.commit()


def seed_technicians(db: Session) -> None:
    df = _read_gold("dim_tecnico.parquet")
    for _, row in df.iterrows():
        existing = db.get(Technician, int(row["users_id"]))
        if existing is None:
            db.add(Technician(
                users_id=int(row["users_id"]),
                username=row["username"],
                nome_completo=row["nome_completo"],
                glpi_profile=row.get("glpi_profile") or "",
                papel=row["papel"],
                ativo=True,
            ))
        else:
            existing.username = row["username"]
            existing.nome_completo = row["nome_completo"]
            existing.glpi_profile = row.get("glpi_profile") or ""
            existing.papel = row["papel"]
    db.commit()
