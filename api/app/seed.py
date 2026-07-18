"""Seed do catalogo (units/technicians) a partir do gold ja coletado pelo
pipeline - a API nunca chama o GLPI direto pra subir, so le os parquets que
`ti-analytics coletar` ja escreveu. Se ainda nao rodou nenhuma coleta, sobe
vazio mesmo (endpoints de analytics devolvem 404 ate a 1a coleta)."""
from __future__ import annotations

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.competency import CompetencyActivityType
from api.app.models.technician import Technician
from api.app.models.unit import Unit
from ti_analytics.paths import GOLD_DIR


DEFAULT_COMPETENCY_ACTIVITY_TYPES = [
    ("operacional", "Operacional", "#58a6ff"),
    ("hardware", "Hardware", "#d5ad64"),
    ("sistema", "Sistema", "#69b5e4"),
    ("rede", "Rede", "#62bba2"),
    ("seguranca", "Segurança", "#df7777"),
    ("gestao", "Gestão", "#a98add"),
    ("outro", "Outro", "#8b949e"),
]


def _read_gold(name: str) -> pd.DataFrame:
    path = GOLD_DIR / name
    if not path.exists():
        return pd.DataFrame()
    return pd.read_parquet(path)


def seed_competency_activity_types(db: Session) -> None:
    for ordem, (slug, nome, cor) in enumerate(DEFAULT_COMPETENCY_ACTIVITY_TYPES):
        existing = db.scalar(select(CompetencyActivityType).where(CompetencyActivityType.slug == slug))
        if existing is None:
            db.add(CompetencyActivityType(
                slug=slug,
                nome=nome,
                descricao="",
                cor=cor,
                ordem=ordem,
                ativa=True,
            ))
    db.commit()


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
        foto_glpi = row.get("foto_glpi")
        tem_foto_glpi = pd.notna(foto_glpi)
        existing = db.get(Technician, int(row["users_id"]))
        if existing is None:
            db.add(Technician(
                users_id=int(row["users_id"]),
                username=row["username"],
                nome_completo=row["nome_completo"],
                glpi_profile=row.get("glpi_profile") or "",
                papel=row["papel"],
                ativo=True,
                unidade_slug=None,
                foto=foto_glpi if tem_foto_glpi else None,
                foto_fonte="glpi" if tem_foto_glpi else None,
            ))
        else:
            existing.username = row["username"]
            existing.nome_completo = row["nome_completo"]
            existing.glpi_profile = row.get("glpi_profile") or ""
            existing.papel = row["papel"]
            # nunca sobrescreve foto que o admin subiu manualmente
            if existing.foto_fonte != "upload" and tem_foto_glpi:
                existing.foto = foto_glpi
                existing.foto_fonte = "glpi"
    db.commit()
