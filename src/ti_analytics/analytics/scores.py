"""Motor de score por tecnico.

Pesos fixos, sem calibracao automatica - com ~5 semanas de historico real
(GLPI comecou em 11/06/2026) a amostra e pequena demais pra regressao
estavel. Mesmo raciocinio do TEAM_SCORE_WEIGHTS do fifa_analytics: julgamento
de design documentado, revisitavel conforme o historico cresce.

  score_volume (0.30):               throughput e o sinal-mae - "o trabalho saiu".
  score_velocidade_resolucao (0.25): solve_delay_stat presente em 428/431
                                     chamados de TI amostrados - o sinal de
                                     prazo mais confiavel que existe (nao ha
                                     SLA configurado no GLPI pra usar aqui).
  score_complexidade (0.20):         urgency-weighting e o mecanismo ANTI-
                                     CHERRY-PICKING: sem isso, quem so pega
                                     chamado facil vence quem pega os dificeis.
                                     Usa `urgency`, nao `priority`/`impact` -
                                     impact e constante (sempre 3) na base real.
  score_velocidade_resposta (0.15): takeintoaccount_delay_stat mistura esforco
                                     do tecnico com a triagem da coordenadora -
                                     pesa menos que resolucao por isso.
  score_abrangencia (0.10):         numero de categorias distintas atendidas -
                                     traco descritivo (versatilidade), peso
                                     pequeno de proposito.
"""
from __future__ import annotations

import pandas as pd

TECH_SCORE_WEIGHTS: dict[str, float] = {
    "score_volume": 0.30,
    "score_velocidade_resolucao": 0.25,
    "score_complexidade": 0.20,
    "score_velocidade_resposta": 0.15,
    "score_abrangencia": 0.10,
}

FULL_CONF_TICKETS = 15.0  # chamados credit-weighted no periodo p/ confianca plena

_METRIC_KEYS = {
    "score_volume": ("chamados_resolvidos", False),
    "score_velocidade_resolucao": ("resolucao_media_h", True),
    "score_complexidade": ("urgencia_media", False),
    "score_velocidade_resposta": ("resposta_media_min", True),
    "score_abrangencia": ("n_categorias", False),
}


def _zscore_to_100(series: pd.Series, key: str, ref_stats: dict[str, tuple[float, float]], *, lower_is_better: bool = False) -> pd.Series:
    """Normaliza pra 0-100 (50 = media). `ref_stats` e populado na PRIMEIRA
    chamada (side effect) e reusado depois - e o que da estabilidade ao
    ranking race entre snapshots (mesmo truque do analytics/snapshot.py do
    fifa_analytics: a referencia nao muda so porque outro tecnico teve um dia
    bom, so quando o proprio tecnico muda)."""
    if key not in ref_stats:
        mean = float(series.mean())
        std = float(series.std(ddof=0))
        if not std or pd.isna(std):
            std = 1.0
        ref_stats[key] = (mean, std)
    mean, std = ref_stats[key]
    z = (series - mean) / std
    if lower_is_better:
        z = -z
    return (50.0 + z * 15.0).clip(lower=0, upper=100)


def build_tech_scores(
    wide: pd.DataFrame,
    dim_tecnico: pd.DataFrame,
    weights: dict[str, float] | None = None,
    ref_stats: dict[str, tuple[float, float]] | None = None,
) -> pd.DataFrame:
    """Uma linha por tecnico em `dim_tecnico` (mesmo os sem chamado nenhum no
    periodo - aparecem com confianca 0 e score neutro 50, nao ficam de fora).

    IMPORTANTE: para a populacao de referencia (`ref_stats`) nao ficar
    distorcida pelo volume baixissimo de Ananda/coordenadora e dos 2 tecnicos
    taticos, quem chama esta funcao pela PRIMEIRA vez (populando um
    `ref_stats` vazio) deve passar `wide`/`dim_tecnico` ja filtrados pra
    `papel == "plantonista"` - ver analytics/snapshot.py. Chamadas seguintes
    (inclusive pra Ananda/taticos, que ainda recebem nota propria no perfil
    deles) reusam o mesmo `ref_stats` sem filtrar.
    """
    weights = weights or TECH_SCORE_WEIGHTS
    ref_stats = ref_stats if ref_stats is not None else {}

    solved = wide[wide["is_solved"]] if not wide.empty else wide
    if solved.empty:
        agg = pd.DataFrame(columns=[
            "users_id", "chamados_resolvidos", "urgencia_media",
            "n_categorias", "resposta_media_min", "resolucao_media_h",
        ])
    else:
        agg = solved.groupby("users_id").agg(
            chamados_resolvidos=("peso_credito", "sum"),
            urgencia_media=("urgency", "mean"),
            n_categorias=("itilcategories_id", "nunique"),
            resposta_media_min=("takeintoaccount_delay_stat", lambda s: (s / 60).mean()),
            resolucao_media_h=("solve_delay_stat", lambda s: (s / 3600).mean()),
        ).reset_index()

    base = dim_tecnico[["users_id", "nome_completo", "username", "papel"]].copy()
    result = base.merge(agg, on="users_id", how="left")
    for col in ("chamados_resolvidos", "urgencia_media", "n_categorias", "resposta_media_min", "resolucao_media_h"):
        if col not in result.columns:
            result[col] = 0.0
    result["chamados_resolvidos"] = result["chamados_resolvidos"].fillna(0.0)
    for col in ("urgencia_media", "n_categorias", "resposta_media_min", "resolucao_media_h"):
        result[col] = result[col].fillna(result[col][result["chamados_resolvidos"] > 0].mean() if (result["chamados_resolvidos"] > 0).any() else 0.0)

    conf = (result["chamados_resolvidos"] / FULL_CONF_TICKETS).clip(upper=1.0)

    for score_name, (metric_key, lower_is_better) in _METRIC_KEYS.items():
        result[score_name] = _zscore_to_100(result[metric_key], metric_key, ref_stats, lower_is_better=lower_is_better)

    raw = sum(result[name] * weight for name, weight in weights.items())
    result["score_geral"] = (50.0 * (1 - conf) + raw * conf).round(1)
    result["confianca"] = conf.round(2)
    result["nivel_evidencia"] = pd.cut(
        conf, bins=[-0.01, 0.33, 0.66, 1.0], labels=["baixa", "media", "alta"]
    ).astype(str)
    result["rank"] = result["score_geral"].rank(ascending=False, method="min").astype(int)

    return result.sort_values("score_geral", ascending=False).reset_index(drop=True)
