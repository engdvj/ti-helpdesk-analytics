"""Timeline de snapshots - alimenta o ranking race e o "acumulado geral".

Mesma mecanica do fifa_analytics/analytics/snapshot.py: cada snapshot e um
recompute COMPLETO (nao incremental) sobre "tudo ate aqui", e um `ref_stats`
populado uma unica vez (a partir da populacao so-plantonista) e reusado em
toda a serie - assim o score de um tecnico so muda quando ELE resolve
chamado, nunca so porque outro tecnico teve um dia bom.

Tres series:
  - diaria_acumulada: evento = cada dia com >=1 chamado novo resolvido;
    cumulativo; o ultimo snapshot da serie E o "acumulado geral" (standings
    atuais).
  - semanal / mensal: janelas NAO cumulativas ("melhor da semana/mes"), cada
    uma com seu proprio ref_stats (variancia de volume semanal != variancia
    de volume acumulado, nao da pra compartilhar).

Deliberadamente sem leaderboard diario NAO-cumulativo: a ~0.8 chamado/
tecnico/dia isso seria ruido puro com o volume atual.
"""
from __future__ import annotations

import pandas as pd

from ti_analytics.analytics.scores import TECH_SCORE_WEIGHTS, build_tech_scores
from ti_analytics.paths import GOLD_DIR
from ti_analytics.utils.io import write_json


def _seed_ref_stats(wide: pd.DataFrame, dim_tecnico: pd.DataFrame) -> dict[str, tuple[float, float]]:
    plantonistas = dim_tecnico[dim_tecnico["papel"] == "plantonista"]
    wide_plantonistas = wide[wide["users_id"].isin(plantonistas["users_id"])]
    ref_stats: dict[str, tuple[float, float]] = {}
    build_tech_scores(wide_plantonistas, plantonistas, ref_stats=ref_stats)
    return ref_stats


def build_daily_cumulative_snapshots(wide: pd.DataFrame, dim_tecnico: pd.DataFrame) -> pd.DataFrame:
    solved = wide[wide["is_solved"]].copy() if not wide.empty else wide
    if solved.empty:
        return pd.DataFrame()
    solved["solvedate"] = pd.to_datetime(solved["solvedate"])
    days = sorted(solved["solvedate"].dt.date.dropna().unique())
    if not days:
        return pd.DataFrame()

    ref_stats = _seed_ref_stats(wide, dim_tecnico)

    frames = []
    for i, day in enumerate(days, start=1):
        cutoff = pd.Timestamp(day) + pd.Timedelta(days=1)
        window = solved[solved["solvedate"] < cutoff]
        scores = build_tech_scores(window, dim_tecnico, ref_stats=ref_stats)
        scores["snapshot_seq"] = i
        scores["periodo_ref"] = day.isoformat()
        scores["granularidade"] = "diaria_acumulada"
        frames.append(scores)
    return pd.concat(frames, ignore_index=True)


def build_periodic_snapshots(
    wide: pd.DataFrame, dim_tecnico: pd.DataFrame, freq: str, granularidade: str
) -> pd.DataFrame:
    solved = wide[wide["is_solved"]].copy() if not wide.empty else wide
    if solved.empty:
        return pd.DataFrame()
    solved["solvedate"] = pd.to_datetime(solved["solvedate"])
    solved["periodo"] = solved["solvedate"].dt.to_period(freq)
    periods = sorted(solved["periodo"].dropna().unique())
    if not periods:
        return pd.DataFrame()

    ref_stats = _seed_ref_stats(wide, dim_tecnico)

    frames = []
    for i, period in enumerate(periods, start=1):
        window = solved[solved["periodo"] == period]
        scores = build_tech_scores(window, dim_tecnico, ref_stats=ref_stats)
        scores["snapshot_seq"] = i
        scores["periodo_ref"] = str(period)
        scores["granularidade"] = granularidade
        frames.append(scores)
    return pd.concat(frames, ignore_index=True)


def build_all_snapshots(wide: pd.DataFrame, dim_tecnico: pd.DataFrame) -> pd.DataFrame:
    parts = [
        build_daily_cumulative_snapshots(wide, dim_tecnico),
        build_periodic_snapshots(wide, dim_tecnico, "W", "semanal"),
        build_periodic_snapshots(wide, dim_tecnico, "M", "mensal"),
    ]
    parts = [p for p in parts if not p.empty]
    save_weights()
    if not parts:
        return pd.DataFrame()
    return pd.concat(parts, ignore_index=True)


def save_weights() -> None:
    write_json(GOLD_DIR / "analytics" / "weights.json", {"tipo": "fixo", "pesos": TECH_SCORE_WEIGHTS})
