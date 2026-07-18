"""Endpoints do ranking race + acumulado geral.

Recomputa a timeline SOB DEMANDA a partir de wide_chamado_tecnico.parquet +
dim_tecnico.parquet (em vez de so ler o snapshot_timeline.parquet
pre-calculado pelo pipeline) - assim o filtro por unidade (`entities_id`)
funciona sem precisar de uma timeline pre-computada por unidade. No volume
atual (~430 chamados, ~15 tecnicos, poucas semanas) isso roda em
milissegundos; se o historico crescer bastante, cachear por
(granularidade, cumulativo, entities_id) e o proximo passo."""
from __future__ import annotations

from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.technician import Technician
from api.app.models.unit import Unit
from api.app.routers.analytics._shared import read_parquet, records, safe_val
from ti_analytics.analytics.complexity import (
    compute_category_difficulty,
    load_category_difficulty_overrides,
)
from ti_analytics.analytics.skills import build_technician_skills
from ti_analytics.analytics.snapshot import (
    available_snapshot_periods,
    build_snapshots,
    filter_snapshot_range,
    snapshot_period_values,
)
from ti_analytics.paths import SILVER_DIR
from ti_analytics.utils.time import brasilia_today

router = APIRouter(prefix="/analytics", tags=["analytics"])

_GRANULARIDADE_PATTERN = "^(diaria|semanal|mensal)$"
_SCORE_MODE_PATTERN = "^(equipe|metas)$"
_FREQ_BY_GRANULARIDADE = {"diaria": "D", "semanal": "W", "mensal": "M"}


def _load_base_data() -> tuple:
    wide = read_parquet("analytics/wide_chamado_tecnico.parquet")
    dim_tecnico = read_parquet("dim_tecnico.parquet")
    if wide.empty or dim_tecnico.empty:
        raise HTTPException(404, "dados nao disponiveis ainda - rode ti-analytics coletar (ou POST /admin/collect)")
    if "resposta_qualidade" not in wide.columns:
        # gold coletado antes dessa coluna existir - fica neutro ate a
        # proxima coleta (ver mesmo fallback em analytics/scores.py).
        wide = wide.assign(resposta_qualidade=0.0)
    # O parquet guarda a versao materializada na ultima coleta, mas overrides
    # do admin precisam valer imediatamente. Recalcular aqui usa somente os
    # fatos locais (nenhuma chamada ao GLPI) e impede snapshots desatualizados.
    wide = _apply_current_category_difficulty(wide, read_parquet("fact_chamado.parquet"))
    return wide, dim_tecnico


def _apply_current_category_difficulty(
    wide: pd.DataFrame,
    fact_chamado: pd.DataFrame,
    overrides: dict[int, float] | None = None,
) -> pd.DataFrame:
    """Sobrepoe a dificuldade vigente sem regravar o parquet factual.

    A baseline automatica vem do historico coletado; configuracoes manuais
    tem prioridade. O parametro ``overrides`` existe para testes puros.
    """
    if wide.empty or "itilcategories_id" not in wide.columns:
        return wide

    baseline = compute_category_difficulty(fact_chamado)
    difficulty_by_category = (
        baseline.set_index("itilcategories_id")["dificuldade_categoria"].to_dict()
        if not baseline.empty
        else {}
    )
    difficulty_by_category.update(
        load_category_difficulty_overrides() if overrides is None else overrides
    )

    refreshed = wide.copy()
    refreshed["dificuldade_categoria"] = (
        refreshed["itilcategories_id"].map(difficulty_by_category).fillna(1.0)
    )
    return refreshed


def _filter_by_technician_catalog(
    wide: pd.DataFrame,
    dim_tecnico: pd.DataFrame,
    catalog: pd.DataFrame,
    unidade_slug: str | None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Aplica status e lotacao organizacional antes de calcular qualquer score."""
    if catalog.empty:
        return wide.iloc[0:0].copy(), dim_tecnico.iloc[0:0].copy()

    eligible = catalog[catalog["ativo"].fillna(False)].copy()
    if unidade_slug is not None:
        eligible = eligible[
            eligible["unidade_slug"].isna() | (eligible["unidade_slug"] == unidade_slug)
        ]

    allowed_ids = set(eligible["users_id"].astype(int))
    filtered_wide = wide[wide["users_id"].isin(allowed_ids)].copy()
    filtered_dim = dim_tecnico[dim_tecnico["users_id"].isin(allowed_ids)].copy()
    config = eligible.drop_duplicates("users_id").set_index("users_id")
    configured_roles = filtered_dim["users_id"].map(config["papel"])
    filtered_dim["papel"] = configured_roles.fillna(filtered_dim["papel"])
    configured_units = filtered_dim["users_id"].map(config["unidade_slug"]).astype(object)
    configured_units[configured_units.isna()] = None
    filtered_dim["unidade_slug"] = configured_units
    return filtered_wide, filtered_dim


def _apply_technician_scope(
    wide: pd.DataFrame,
    dim_tecnico: pd.DataFrame,
    db: Session,
    entities_id: int | None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    unidade_slug = None
    if entities_id is not None:
        unit = db.scalar(select(Unit).where(Unit.entities_id == entities_id))
        if unit is None:
            raise HTTPException(404, "unidade nao encontrada")
        unidade_slug = unit.slug
        wide = wide[wide["entities_id"] == entities_id]

    technicians = db.execute(
        select(
            Technician.users_id,
            Technician.papel,
            Technician.ativo,
            Technician.unidade_slug,
        )
    ).all()
    catalog = pd.DataFrame(
        technicians,
        columns=["users_id", "papel", "ativo", "unidade_slug"],
    )
    return _filter_by_technician_catalog(wide, dim_tecnico, catalog, unidade_slug)


def _select_snapshot_window(
    wide: pd.DataFrame,
    granularidade: str,
    cumulativo: bool,
    snapshot_seq: int | None,
    data_inicio: date | str | None = None,
    data_fim: date | str | None = None,
) -> pd.DataFrame:
    """Devolve os chamados que realmente compoem um snapshot da timeline."""
    solved = wide[wide["is_solved"]].copy() if not wide.empty else wide.copy()
    if solved.empty:
        return solved

    freq = _FREQ_BY_GRANULARIDADE[granularidade]
    solved["solvedate"] = pd.to_datetime(solved["solvedate"])
    solved["periodo"] = solved["solvedate"].dt.date if freq == "D" else solved["solvedate"].dt.to_period(freq)
    periods = snapshot_period_values(
        solved["solvedate"],
        granularidade,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )
    selected_index = len(periods) - 1 if snapshot_seq is None else snapshot_seq - 1
    if selected_index < 0 or selected_index >= len(periods):
        raise HTTPException(404, "snapshot nao encontrado nesse recorte")

    period = periods[selected_index]
    if not cumulativo:
        return solved[solved["periodo"] == period].copy()

    cutoff = (
        pd.Timestamp(period) + pd.Timedelta(days=1)
        if freq == "D"
        else period.end_time + pd.Timedelta(nanoseconds=1)
    )
    return solved[solved["solvedate"] < cutoff].copy()


def _category_names() -> dict[int, str]:
    path = SILVER_DIR / "dim_categoria.parquet"
    if not path.exists():
        return {}
    categories = pd.read_parquet(path)
    if categories.empty:
        return {}
    return {
        int(row["itilcategories_id"]): str(row["categoria_nome"])
        for _, row in categories.iterrows()
        if pd.notna(row.get("itilcategories_id")) and row.get("categoria_nome")
    }


def _apply_date_range(
    wide: pd.DataFrame,
    data_inicio: date | None,
    data_fim: date | None,
) -> pd.DataFrame:
    try:
        return filter_snapshot_range(wide, data_inicio, data_fim)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def _build_snapshot_details(
    snapshot_window: pd.DataFrame,
    users_id: int,
    category_names: dict[int, str] | None = None,
) -> dict:
    rows = snapshot_window[snapshot_window["users_id"] == users_id].copy()
    if rows.empty:
        return {"categorias": [], "chamados": [], "tempos_resposta": []}

    category_names = _category_names() if category_names is None else category_names
    category_rows = rows.dropna(subset=["itilcategories_id"])
    categorias = []
    if not category_rows.empty:
        category_summary = (
            category_rows.groupby("itilcategories_id", as_index=False)
            .agg(
                credito=("peso_credito", "sum"),
                chamados=("tickets_id", "nunique"),
            )
            .sort_values(["chamados", "credito"], ascending=False)
        )
        categorias = [
            {
                "itilcategories_id": int(row["itilcategories_id"]),
                "nome": category_names.get(
                    int(row["itilcategories_id"]),
                    f"Categoria #{int(row['itilcategories_id'])}",
                ),
                "credito": float(row["credito"]),
                "chamados": int(row["chamados"]),
            }
            for _, row in category_summary.iterrows()
        ]

    ordered = rows.sort_values(["solvedate", "tickets_id"], ascending=False)
    chamados = [
        {"tickets_id": int(row["tickets_id"]), "credito": float(row["peso_credito"])}
        for _, row in ordered.iterrows()
    ]
    tempos_resposta = [
        {
            "tickets_id": int(row["tickets_id"]),
            "minutos": float(row["takeintoaccount_delay_stat"]) / 60,
        }
        for _, row in ordered.iterrows()
        if pd.notna(row.get("takeintoaccount_delay_stat"))
    ]

    return {
        "categorias": categorias,
        "chamados": chamados,
        "tempos_resposta": tempos_resposta,
    }


@router.get("/periods")
def get_periods(
    granularidade: str = Query("diaria", pattern=_GRANULARIDADE_PATTERN),
    entities_id: int | None = Query(None, description="filtra por unidade - omitido = todas combinadas (geral)"),
    db: Session = Depends(get_db),
):
    wide, dim_tecnico = _load_base_data()
    wide, _ = _apply_technician_scope(wide, dim_tecnico, db, entities_id)
    return available_snapshot_periods(wide, granularidade, data_fim=brasilia_today())


@router.get("/snapshots")
def get_snapshots(
    granularidade: str = Query("diaria", pattern=_GRANULARIDADE_PATTERN),
    cumulativo: bool = Query(True, description="True = acumula desde o inicio; False = so o proprio balde de tempo"),
    entities_id: int | None = Query(None, description="filtra por unidade - omitido = todas combinadas (geral)"),
    snapshot_seq: int | None = Query(None),
    score_mode: str = Query("equipe", pattern=_SCORE_MODE_PATTERN),
    data_inicio: date | None = Query(None, description="inicio inclusivo do intervalo"),
    data_fim: date | None = Query(None, description="fim inclusivo do intervalo"),
    db: Session = Depends(get_db),
):
    wide, dim_tecnico = _load_base_data()
    wide, dim_tecnico = _apply_technician_scope(wide, dim_tecnico, db, entities_id)
    wide = _apply_date_range(wide, data_inicio, data_fim)

    timeline = build_snapshots(
        wide,
        dim_tecnico,
        granularidade,
        cumulativo,
        score_mode,
        data_inicio=data_inicio,
        data_fim=data_fim or brasilia_today(),
    )
    if timeline.empty:
        return []
    if snapshot_seq is not None:
        timeline = timeline[timeline["snapshot_seq"] == snapshot_seq]
    return records(timeline)


@router.get("/technicians/{users_id}")
def get_technician_profile(
    users_id: int,
    entities_id: int | None = Query(None, description="filtra por unidade - omitido = todas combinadas"),
    granularidade: str = Query("diaria", pattern=_GRANULARIDADE_PATTERN),
    cumulativo: bool = Query(True, description="True = acumula desde o inicio; False = so o proprio balde de tempo"),
    snapshot_seq: int | None = Query(None, ge=1, description="snapshot exibido no dashboard; omitido = mais recente"),
    score_mode: str = Query("equipe", pattern=_SCORE_MODE_PATTERN),
    data_inicio: date | None = Query(None, description="inicio inclusivo do intervalo"),
    data_fim: date | None = Query(None, description="fim inclusivo do intervalo"),
    db: Session = Depends(get_db),
):
    wide, dim_tecnico = _load_base_data()
    wide_filtrado, dim_tecnico = _apply_technician_scope(wide, dim_tecnico, db, entities_id)
    if users_id not in dim_tecnico["users_id"].values:
        raise HTTPException(404, "tecnico inativo ou fora desta unidade")

    wide_filtrado = _apply_date_range(wide_filtrado, data_inicio, data_fim)
    historico = build_snapshots(
        wide_filtrado,
        dim_tecnico,
        granularidade,
        cumulativo,
        score_mode,
        data_inicio=data_inicio,
        data_fim=data_fim or brasilia_today(),
    )
    if historico.empty:
        raise HTTPException(404, "sem chamados resolvidos ainda nesse recorte")

    historico_tecnico = historico[historico["users_id"] == users_id].sort_values("snapshot_seq")
    if historico_tecnico.empty:
        raise HTTPException(404, "tecnico sem chamados nesse recorte")
    selected_seq = int(historico_tecnico.iloc[-1]["snapshot_seq"]) if snapshot_seq is None else snapshot_seq
    selected_snapshot = historico_tecnico[historico_tecnico["snapshot_seq"] == selected_seq]
    if selected_snapshot.empty:
        raise HTTPException(404, "snapshot do tecnico nao encontrado nesse recorte")
    atual = selected_snapshot.iloc[-1].to_dict()

    snapshot_window = _select_snapshot_window(
        wide_filtrado,
        granularidade,
        cumulativo,
        selected_seq,
        data_inicio=data_inicio,
        data_fim=data_fim or brasilia_today(),
    )
    chamados_tecnico = snapshot_window[
        (snapshot_window["users_id"] == users_id) & (snapshot_window["is_solved"])
    ].sort_values("solvedate", ascending=False).copy()
    category_names = _category_names()
    chamados_tecnico["categoria_nome"] = chamados_tecnico["itilcategories_id"].apply(
        lambda cid: category_names.get(int(cid), f"Categoria #{int(cid)}") if pd.notna(cid) else None
    )

    return {
        "atual": {k: safe_val(v) for k, v in atual.items()},
        "historico": records(historico_tecnico[["snapshot_seq", "periodo_ref", "score_geral", "confianca"]]),
        "detalhes_snapshot": _build_snapshot_details(snapshot_window, users_id, category_names),
        "habilidades": build_technician_skills(chamados_tecnico, category_names),
        "chamados_recentes": records(chamados_tecnico[[
            "tickets_id", "categoria_nome", "status", "solvedate",
            "foi_reaberto", "resposta_qualidade",
        ]]),
    }
