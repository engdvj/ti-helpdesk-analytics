"""Descoberta dinamica das entidades GLPI que representam times de TI.

Nunca hardcodear entities_id (hoje 9=HGVC/TI, 13=UPA/TI) - uma nova unidade
adicionada ao GLPI no futuro tem que aparecer aqui sozinha, sem mudanca de
codigo. A regra e puramente nominal: qualquer Entity cujo `name` seja "TI"
(case-insensitive, ignorando espacos) e considerada uma unidade de TI.
"""
from __future__ import annotations

import pandas as pd

from ti_analytics.config import GlpiConfig
from ti_analytics.glpi.client import get_paginated


def _parse_parent_unit(completename: str) -> str:
    """'CHVC > HGVC > TI' -> 'HGVC'. Fallback pro proprio completename se a
    arvore for mais rasa do que o esperado (ex.: 'CHVC > TI' direto)."""
    parts = [p.strip() for p in completename.split(">")]
    return parts[-2] if len(parts) >= 2 else completename.strip()


def discover_ti_entities(cfg: GlpiConfig, session_token: str) -> pd.DataFrame:
    raw = get_paginated(cfg, "/Entity", session_token)
    df = pd.DataFrame(raw)
    if df.empty:
        return pd.DataFrame(columns=["entities_id", "entity_name", "completename", "unidade_pai", "unidade_slug"])

    # Seleciona so id/name/completename ANTES de renomear: o payload cru do
    # /Entity ja tem uma coluna "entities_id" propria (id da entidade-PAI na
    # arvore), diferente de "id" (a propria entidade) - renomear "id" direto
    # sem isolar as colunas primeiro cria duas colunas "entities_id" e quebra
    # a selecao por chave (vira DataFrame em vez de Series).
    mask = df["name"].fillna("").str.strip().str.casefold() == "ti"
    ti = df.loc[mask, ["id", "name", "completename"]].copy()
    ti = ti.rename(columns={"id": "entities_id", "name": "entity_name"})
    ti["unidade_pai"] = ti["completename"].apply(_parse_parent_unit)
    ti["unidade_slug"] = ti["unidade_pai"].str.lower().str.strip()
    return ti.reset_index(drop=True)


def discover_group_id(cfg: GlpiConfig, session_token: str, group_name: str) -> int:
    """Acha o id do grupo GLPI pelo nome (ex.: "Tecnologia da Informação"),
    em vez de hardcodear o id (hoje 25) - o grupo pode ser recriado/migrado."""
    raw = get_paginated(cfg, "/Group", session_token)
    for row in raw:
        if (row.get("name") or "").strip().casefold() == group_name.strip().casefold():
            return int(row["id"])
    raise ValueError(f"Grupo GLPI '{group_name}' nao encontrado")
