"""Timeline de snapshots - alimenta o ranking race e o "acumulado geral".

Mesma mecanica do fifa_analytics/analytics/snapshot.py: cada snapshot e um
recompute COMPLETO (nao incremental) sobre a janela que cabe, e um
`ref_stats` populado uma unica vez (a partir da populacao so-plantonista) e
reusado em toda a serie - assim o score de um tecnico so muda quando ELE
resolve chamado, nunca so porque outro tecnico teve um dia bom.

Duas dimensoes de tempo ortogonais, combinadas tambem com o modo de score:
  - granularidade: diaria / semanal / mensal (tamanho do balde de tempo)
  - cumulativo: True = cada snapshot soma tudo desde o inicio (o ultimo
    snapshot cumulativo de qualquer granularidade E o "acumulado geral");
    False = cada snapshot so olha o proprio balde (~"melhor da semana/mes",
    ou dia isolado no caso diario).
  - score_mode: equipe = comparacao relativa normalizada; metas = valores
    absolutos convertidos contra os alvos configurados no admin.

O diario-individual (nao-cumulativo) foi deliberadamente adiado por muito
tempo por ruido - a ~0.8 chamado/tecnico/dia isso oscila bastante com pouco
volume. Existe agora porque foi pedido explicitamente; ainda vale o alerta
na hora de ler o dado.
"""
from __future__ import annotations

from datetime import date

import pandas as pd

from ti_analytics.analytics.scores import build_tech_scores, load_weights
from ti_analytics.paths import GOLD_DIR
from ti_analytics.utils.io import write_json

_FREQ_BY_GRANULARIDADE = {"diaria": "D", "semanal": "W", "mensal": "M"}


def filter_snapshot_range(
    wide: pd.DataFrame,
    data_inicio: date | str | None = None,
    data_fim: date | str | None = None,
) -> pd.DataFrame:
    """Limita a fonte a um intervalo de datas inclusivo.

    O filtro acontece antes de gerar a timeline. Assim, o acumulado passa a
    comecar em ``data_inicio`` e todas as metricas factuais (nao apenas o
    grafico) usam exatamente o mesmo recorte.
    """
    if data_inicio is None and data_fim is None:
        return wide

    inicio = pd.Timestamp(data_inicio).date() if data_inicio is not None else None
    fim = pd.Timestamp(data_fim).date() if data_fim is not None else None
    if inicio is not None and fim is not None and inicio > fim:
        raise ValueError("data_inicio deve ser anterior ou igual a data_fim")
    if wide.empty or "solvedate" not in wide.columns:
        return wide.copy()

    solvedates = pd.to_datetime(wide["solvedate"], errors="coerce").dt.date
    mask = solvedates.notna()
    if inicio is not None:
        mask &= solvedates >= inicio
    if fim is not None:
        mask &= solvedates <= fim
    return wide.loc[mask].copy()


def available_snapshot_periods(
    wide: pd.DataFrame,
    granularidade: str,
    data_inicio: date | str | None = None,
    data_fim: date | str | None = None,
) -> list[dict[str, str]]:
    """Lista os baldes disponiveis com suas fronteiras de calendario."""
    freq = _FREQ_BY_GRANULARIDADE[granularidade]
    solved = wide[wide["is_solved"]].copy() if not wide.empty else wide.copy()
    if solved.empty:
        return []

    solvedates = pd.to_datetime(solved["solvedate"], errors="coerce").dropna()
    if solvedates.empty:
        return []

    periods = snapshot_period_values(
        solvedates,
        granularidade,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )
    if freq == "D":
        return [
            {"ref": period.isoformat(), "inicio": period.isoformat(), "fim": period.isoformat()}
            for period in periods
        ]

    return [
        {
            "ref": str(period),
            "inicio": period.start_time.date().isoformat(),
            "fim": period.end_time.date().isoformat(),
        }
        for period in periods
    ]


def snapshot_period_values(
    solvedates: pd.Series,
    granularidade: str,
    data_inicio: date | str | None = None,
    data_fim: date | str | None = None,
) -> list:
    """Cria uma sequencia continua de baldes de calendario.

    Dias sem atividade precisam existir na timeline: no modo individual eles
    representam zero atividade e no acumulado repetem o total ate aquele dia.
    ``data_inicio``/``data_fim`` permitem que a API inclua exatamente o
    intervalo escolhido, mesmo quando uma das pontas nao tem chamados.
    """
    freq = _FREQ_BY_GRANULARIDADE[granularidade]
    parsed = pd.to_datetime(solvedates, errors="coerce").dropna()
    if parsed.empty:
        return []

    start = pd.Timestamp(data_inicio) if data_inicio is not None else parsed.min().normalize()
    end = pd.Timestamp(data_fim) if data_fim is not None else parsed.max().normalize()
    if start > end:
        return []

    if freq == "D":
        return list(pd.date_range(start=start, end=end, freq="D").date)
    return list(pd.period_range(start=start, end=end, freq=freq))


def _seed_ref_stats(wide: pd.DataFrame, dim_tecnico: pd.DataFrame) -> dict[str, tuple[float, float]]:
    plantonistas = dim_tecnico[dim_tecnico["papel"] == "plantonista"]
    wide_plantonistas = wide[wide["users_id"].isin(plantonistas["users_id"])]
    ref_stats: dict[str, tuple[float, float]] = {}
    build_tech_scores(wide_plantonistas, plantonistas, ref_stats=ref_stats)
    return ref_stats


def build_snapshots(
    wide: pd.DataFrame,
    dim_tecnico: pd.DataFrame,
    granularidade: str,
    cumulativo: bool,
    score_mode: str = "equipe",
    data_inicio: date | str | None = None,
    data_fim: date | str | None = None,
) -> pd.DataFrame:
    freq = _FREQ_BY_GRANULARIDADE[granularidade]
    solved = wide[wide["is_solved"]].copy() if not wide.empty else wide
    if solved.empty:
        return pd.DataFrame()
    solved["solvedate"] = pd.to_datetime(solved["solvedate"])

    if freq == "D":
        solved["periodo"] = solved["solvedate"].dt.date
    else:
        solved["periodo"] = solved["solvedate"].dt.to_period(freq)
    periods = snapshot_period_values(
        solved["solvedate"],
        granularidade,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )
    if not periods:
        return pd.DataFrame()

    ref_stats = _seed_ref_stats(wide, dim_tecnico) if score_mode == "equipe" else {}

    frames = []
    for i, period in enumerate(periods, start=1):
        if cumulativo:
            cutoff = (
                pd.Timestamp(period) + pd.Timedelta(days=1)
                if freq == "D"
                else period.end_time + pd.Timedelta(nanoseconds=1)
            )
            window = solved[solved["solvedate"] < cutoff]
        else:
            window = solved[solved["periodo"] == period]
        scores = build_tech_scores(
            window, dim_tecnico, ref_stats=ref_stats, score_mode=score_mode
        )
        scores["snapshot_seq"] = i
        scores["periodo_ref"] = period.isoformat() if freq == "D" else str(period)
        scores["granularidade"] = granularidade
        scores["cumulativo"] = cumulativo
        frames.append(scores)
    return pd.concat(frames, ignore_index=True)


def build_all_snapshots(
    wide: pd.DataFrame,
    dim_tecnico: pd.DataFrame,
    data_referencia: date | str | None = None,
) -> pd.DataFrame:
    parts = [
        build_snapshots(
            wide,
            dim_tecnico,
            granularidade,
            cumulativo,
            score_mode,
            data_fim=data_referencia,
        )
        for granularidade in ("diaria", "semanal", "mensal")
        for cumulativo in (True, False)
        for score_mode in ("equipe", "metas")
    ]
    parts = [p for p in parts if not p.empty]
    save_weights()
    if not parts:
        return pd.DataFrame()
    return pd.concat(parts, ignore_index=True)


def save_weights() -> None:
    write_json(GOLD_DIR / "analytics" / "weights.json", {"tipo": "configuravel", "pesos": load_weights()})
