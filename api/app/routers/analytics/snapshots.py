"""Endpoints do ranking race + acumulado geral.

Recomputa a timeline SOB DEMANDA a partir de wide_chamado_tecnico.parquet +
dim_tecnico.parquet (em vez de so ler o snapshot_timeline.parquet
pre-calculado pelo pipeline) - assim o filtro por unidade (`entities_id`)
funciona sem precisar de uma timeline pre-computada por unidade. No volume
atual (~430 chamados, ~15 tecnicos, poucas semanas) isso roda em
milissegundos; se o historico crescer bastante, cachear por
(granularidade, entities_id) e o proximo passo."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.app.routers.analytics._shared import read_parquet, records, safe_val
from ti_analytics.analytics.snapshot import (
    build_daily_cumulative_snapshots,
    build_periodic_snapshots,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

_BUILDERS = {
    "diaria_acumulada": lambda wide, dim: build_daily_cumulative_snapshots(wide, dim),
    "semanal": lambda wide, dim: build_periodic_snapshots(wide, dim, "W", "semanal"),
    "mensal": lambda wide, dim: build_periodic_snapshots(wide, dim, "M", "mensal"),
}


def _load_base_data() -> tuple:
    wide = read_parquet("analytics/wide_chamado_tecnico.parquet")
    dim_tecnico = read_parquet("dim_tecnico.parquet")
    if wide.empty or dim_tecnico.empty:
        raise HTTPException(404, "dados nao disponiveis ainda - rode ti-analytics coletar (ou POST /admin/collect)")
    return wide, dim_tecnico


@router.get("/snapshots")
def get_snapshots(
    granularidade: str = Query("diaria_acumulada", pattern="^(diaria_acumulada|semanal|mensal)$"),
    entities_id: int | None = Query(None, description="filtra por unidade - omitido = todas combinadas (geral)"),
    snapshot_seq: int | None = Query(None),
):
    wide, dim_tecnico = _load_base_data()
    if entities_id is not None:
        wide = wide[wide["entities_id"] == entities_id]

    timeline = _BUILDERS[granularidade](wide, dim_tecnico)
    if timeline.empty:
        return []
    if snapshot_seq is not None:
        timeline = timeline[timeline["snapshot_seq"] == snapshot_seq]
    return records(timeline)


@router.get("/technicians/{users_id}")
def get_technician_profile(
    users_id: int,
    entities_id: int | None = Query(None, description="filtra por unidade - omitido = todas combinadas"),
):
    wide, dim_tecnico = _load_base_data()
    if users_id not in dim_tecnico["users_id"].values:
        raise HTTPException(404, "tecnico nao encontrado")

    wide_filtrado = wide if entities_id is None else wide[wide["entities_id"] == entities_id]
    historico = build_daily_cumulative_snapshots(wide_filtrado, dim_tecnico)
    if historico.empty:
        raise HTTPException(404, "sem chamados resolvidos ainda nesse recorte")

    historico_tecnico = historico[historico["users_id"] == users_id].sort_values("snapshot_seq")
    if historico_tecnico.empty:
        raise HTTPException(404, "tecnico sem chamados nesse recorte")
    atual = historico_tecnico.iloc[-1].to_dict()

    chamados_tecnico = wide_filtrado[
        (wide_filtrado["users_id"] == users_id) & (wide_filtrado["is_solved"])
    ].sort_values("solvedate", ascending=False).head(10)

    return {
        "atual": {k: safe_val(v) for k, v in atual.items()},
        "historico": records(historico_tecnico[["snapshot_seq", "periodo_ref", "score_geral", "confianca"]]),
        "chamados_recentes": records(chamados_tecnico[[
            "tickets_id", "itilcategories_id", "urgency", "solvedate",
            "solve_delay_stat", "takeintoaccount_delay_stat", "foi_reaberto",
        ]]),
    }
