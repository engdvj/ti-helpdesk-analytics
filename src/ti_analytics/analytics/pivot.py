"""Join dos fatos de chamado com a bridge de credito por tecnico.

Uma linha por (chamado, tecnico atribuido) - direto analogo ao
team_match_wide do fifa_analytics, mas aqui e so um join (nao precisa de
pivot long->wide porque nao ha um conjunto variavel de metricas por chamado
como nas stats de partida da FIFA)."""
from __future__ import annotations

import pandas as pd

WIDE_COLUMNS = [
    "tickets_id", "users_id", "peso_credito", "n_tecnicos_atribuidos",
    "entities_id", "itilcategories_id", "date", "solvedate", "status",
    "is_solved", "urgency", "priority", "takeintoaccount_delay_stat",
    "solve_delay_stat", "foi_reaberto",
]


def build_wide_chamado_tecnico(
    fact_chamado: pd.DataFrame, bridge: pd.DataFrame, dim_tecnico: pd.DataFrame
) -> pd.DataFrame:
    if fact_chamado.empty or bridge.empty:
        return pd.DataFrame(columns=WIDE_COLUMNS)

    wide = bridge.merge(fact_chamado, on="tickets_id", how="inner", suffixes=("", "_chamado"))
    # so tecnicos que ainda existem em dim_tecnico (evita linha fantasma se um
    # usuario saiu do grupo entre coletas)
    wide = wide[wide["users_id"].isin(dim_tecnico["users_id"])]
    cols = [c for c in WIDE_COLUMNS if c in wide.columns]
    return wide[cols].reset_index(drop=True)
