"""Motor de score por tecnico.

Pesos fixos, sem calibracao automatica - com ~5 semanas de historico real
(GLPI comecou em 11/06/2026) a amostra e pequena demais pra regressao
estavel. Mesmo raciocinio do TEAM_SCORE_WEIGHTS do fifa_analytics: julgamento
de design documentado, revisitavel conforme o historico cresce (e agora
literalmente editavel sem deploy - ver painel /admin, api/app/routers/admin.py).

  score_volume (0.31, "Creditos"):   throughput e o sinal-mae - "o trabalho
                                     saiu". peso_credito ja rateia chamado
                                     multi-tecnico (ver glpi/transforms.py).
  score_abrangencia (0.13):         numero de categorias distintas atendidas -
                                     traco descritivo (versatilidade), peso
                                     pequeno de proposito.
  score_complexidade (0.21):        usa `complexidade_categoria_media` (ver
                                     analytics/complexity.py), NAO `urgency` -
                                     urgency discrimina mal esforco real nesta
                                     base (solve_delay fica achatado ~4-5h entre
                                     urgencia 3 e 5). O indice por categoria usa
                                     o tempo historico de resolucao (com
                                     shrinkage) como baseline de dificuldade, e
                                     o admin pode sobrescrever categoria a
                                     categoria no painel /admin.
  score_qualidade (0.19):           heuristica sobre o texto do ITILSolution
                                     (ver glpi/solution_quality.py) - campo
                                     "Problema identificado"/"O que foi feito"
                                     em branco ou resposta de uma linha so
                                     pontua baixo.
  score_velocidade_resposta (0.16): takeintoaccount_delay_stat mistura esforco
                                     do tecnico com a triagem da coordenadora -
                                     pesa menos que os demais por isso.

`score_velocidade_resolucao` (baseado em solve_delay_stat) saiu do score
ponderado - `resolucao_media_h` continua calculada (fica disponivel como dado
factual), so nao entra mais em score_geral nem e mais um filtro de ordenacao
no frontend.
"""
from __future__ import annotations

import pandas as pd

from ti_analytics.config import load_config
from ti_analytics.utils.io import write_yaml
from ti_analytics.paths import CONFIG_DIR

TECH_SCORE_WEIGHTS: dict[str, float] = {
    "score_volume": 0.31,
    "score_abrangencia": 0.13,
    "score_complexidade": 0.21,
    "score_qualidade": 0.19,
    "score_velocidade_resposta": 0.16,
}

# Alvos absolutos usados no modo "metas". Cada metrica vira primeiro uma
# nota 0-100 e so depois entra na media ponderada; valores de unidades
# diferentes nunca sao somados diretamente.
DEFAULT_SCORE_TARGETS: dict[str, float] = {
    "volume_por_dia": 3.0,
    "complexidade_categoria": 1.0,  # 1.0x = dificuldade media da equipe
    "resposta_min": 60.0,
    "abrangencia_ratio": 0.35,
    "qualidade": 70.0,
}


def load_weights() -> dict[str, float]:
    """Pesos em uso agora: `pipeline/config/score_weights.yaml` se existir
    (editavel pelo painel /admin), senao o default hardcoded acima."""
    try:
        configured = load_config("score_weights.yaml")
    except FileNotFoundError:
        return dict(TECH_SCORE_WEIGHTS)
    return configured or dict(TECH_SCORE_WEIGHTS)


def save_weights_config(weights: dict[str, float]) -> None:
    write_yaml(CONFIG_DIR / "score_weights.yaml", weights)


def load_score_targets() -> dict[str, float]:
    """Metas em uso agora, editaveis pelo painel /admin."""
    try:
        configured = load_config("score_targets.yaml")
    except FileNotFoundError:
        return dict(DEFAULT_SCORE_TARGETS)
    return {**DEFAULT_SCORE_TARGETS, **(configured or {})}


def save_score_targets(targets: dict[str, float]) -> None:
    write_yaml(CONFIG_DIR / "score_targets.yaml", targets)

FULL_CONF_TICKETS = 15.0  # chamados credit-weighted no periodo p/ confianca plena

_METRIC_KEYS = {
    "score_volume": ("chamados_resolvidos", False),
    "score_complexidade": ("complexidade_categoria_media", False),
    "score_velocidade_resposta": ("resposta_media_min", True),
    "score_abrangencia": ("n_categorias", False),
    "score_qualidade": ("resposta_qualidade_media", False),
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


def _target_to_100(series: pd.Series, target: float, *, lower_is_better: bool = False) -> pd.Series:
    """Converte uma metrica absoluta em nota comparavel.

    Nas metricas em que mais e melhor, atingir a meta vale 100. Nas de tempo,
    a meta ou menos vale 100 e o dobro do tempo vale 50. O recorte em 0-100
    evita que uma unica metrica compense todas as demais.
    """
    if lower_is_better:
        safe = series.clip(lower=0.000001)
        score = target / safe * 100.0
        score = score.where(series > 0, 100.0)
    else:
        score = series / target * 100.0
    return score.clip(lower=0, upper=100)


def build_tech_scores(
    wide: pd.DataFrame,
    dim_tecnico: pd.DataFrame,
    weights: dict[str, float] | None = None,
    ref_stats: dict[str, tuple[float, float]] | None = None,
    score_mode: str = "equipe",
    targets: dict[str, float] | None = None,
) -> pd.DataFrame:
    """Uma linha por tecnico em `dim_tecnico` (mesmo os sem chamado nenhum no
    periodo; estes aparecem como sem atividade, sem nota e sem posicao).

    IMPORTANTE: para a populacao de referencia (`ref_stats`) nao ficar
    distorcida pelo volume baixissimo de Ananda/coordenadora e dos 2 tecnicos
    taticos, quem chama esta funcao pela PRIMEIRA vez (populando um
    `ref_stats` vazio) deve passar `wide`/`dim_tecnico` ja filtrados pra
    `papel == "plantonista"` - ver analytics/snapshot.py. Chamadas seguintes
    (inclusive pra Ananda/taticos, que ainda recebem nota propria no perfil
    deles) reusam o mesmo `ref_stats` sem filtrar.
    """
    if score_mode not in {"equipe", "metas"}:
        raise ValueError(f"modo de score invalido: {score_mode}")
    weights = weights or load_weights()
    targets = targets or load_score_targets()
    ref_stats = ref_stats if ref_stats is not None else {}

    solved = wide[wide["is_solved"]] if not wide.empty else wide
    if not solved.empty and "resposta_qualidade" not in solved.columns:
        # gold coletado antes dessa coluna existir (ver glpi/solution_quality.py)
        # - fica neutro ate a proxima coleta preencher de verdade, em vez de
        # quebrar o app inteiro por falta de uma coluna nova.
        solved = solved.assign(resposta_qualidade=0.0)
    if not solved.empty and "dificuldade_categoria" not in solved.columns:
        # gold coletado antes dessa coluna existir (ver analytics/complexity.py)
        # - 1.0 = dificuldade neutra/media, ate a proxima coleta preencher.
        solved = solved.assign(dificuldade_categoria=1.0)
    if solved.empty:
        agg = pd.DataFrame(columns=[
            "users_id", "chamados_resolvidos", "chamados_atendidos", "urgencia_media",
            "n_categorias", "resposta_media_min", "resolucao_media_h",
            "resposta_qualidade_media", "complexidade_categoria_media",
        ])
    else:
        agg = solved.groupby("users_id").agg(
            chamados_resolvidos=("peso_credito", "sum"),
            chamados_atendidos=("tickets_id", "nunique"),
            urgencia_media=("urgency", "mean"),
            n_categorias=("itilcategories_id", "nunique"),
            resposta_media_min=("takeintoaccount_delay_stat", lambda s: (s / 60).mean()),
            resolucao_media_h=("solve_delay_stat", lambda s: (s / 3600).mean()),
            resposta_qualidade_media=("resposta_qualidade", "mean"),
            complexidade_categoria_media=("dificuldade_categoria", "mean"),
        ).reset_index()

    base_columns = ["users_id", "nome_completo", "username", "papel"]
    if "unidade_slug" in dim_tecnico.columns:
        base_columns.append("unidade_slug")
    base = dim_tecnico[base_columns].copy()
    if "unidade_slug" not in base.columns:
        base["unidade_slug"] = None
    result = base.merge(agg, on="users_id", how="left")
    _AGG_COLS = (
        "chamados_resolvidos", "chamados_atendidos", "urgencia_media", "n_categorias",
        "resposta_media_min", "resolucao_media_h", "resposta_qualidade_media",
        "complexidade_categoria_media",
    )
    for col in _AGG_COLS:
        if col not in result.columns:
            result[col] = 0.0
    result["chamados_resolvidos"] = result["chamados_resolvidos"].fillna(0.0)
    result["chamados_atendidos"] = result["chamados_atendidos"].fillna(0).astype(int)
    # Categoria distinta e uma contagem factual. Um tecnico sem chamados tem
    # zero categorias, nao a media (possivelmente decimal) da equipe.
    result["n_categorias"] = result["n_categorias"].fillna(0).astype(int)
    for col in (
        "urgencia_media",
        "resposta_media_min",
        "resolucao_media_h",
        "resposta_qualidade_media",
        "complexidade_categoria_media",
    ):
        result[col] = result[col].fillna(result[col][result["chamados_resolvidos"] > 0].mean() if (result["chamados_resolvidos"] > 0).any() else 0.0)

    dias_ativos = 1
    if not solved.empty and "solvedate" in solved.columns:
        datas = pd.to_datetime(solved["solvedate"], errors="coerce").dt.normalize()
        dias_ativos = max(int(datas.nunique()), 1)
    result["dias_ativos_periodo"] = dias_ativos
    result["volume_por_dia"] = result["chamados_resolvidos"] / dias_ativos
    result["abrangencia_ratio"] = (
        result["n_categorias"] / result["chamados_atendidos"].replace(0, pd.NA)
    ).fillna(0.0)
    result["elegivel"] = result["chamados_atendidos"] > 0

    conf = (result["chamados_resolvidos"] / FULL_CONF_TICKETS).clip(upper=1.0)

    if score_mode == "equipe":
        for score_name, (metric_key, lower_is_better) in _METRIC_KEYS.items():
            result[score_name] = _zscore_to_100(
                result[metric_key], metric_key, ref_stats, lower_is_better=lower_is_better
            )
    else:
        result["score_volume"] = _target_to_100(
            result["volume_por_dia"], targets["volume_por_dia"]
        )
        result["score_complexidade"] = _target_to_100(
            result["complexidade_categoria_media"], targets["complexidade_categoria"]
        )
        result["score_velocidade_resposta"] = _target_to_100(
            result["resposta_media_min"], targets["resposta_min"], lower_is_better=True
        )
        result["score_abrangencia"] = _target_to_100(
            result["abrangencia_ratio"], targets["abrangencia_ratio"]
        )
        result["score_qualidade"] = _target_to_100(
            result["resposta_qualidade_media"], targets["qualidade"]
        )

    raw = sum(result[name] * weight for name, weight in weights.items())
    result["score_geral"] = (50.0 * (1 - conf) + raw * conf).where(result["elegivel"]).round(1)
    result["confianca"] = conf.round(2)
    result["nivel_evidencia"] = pd.cut(
        conf, bins=[-0.01, 0.33, 0.66, 1.0], labels=["baixa", "media", "alta"]
    ).astype(str)
    result["rank"] = result["score_geral"].rank(ascending=False, method="min").astype("Int64")
    result["score_mode"] = score_mode

    return result.sort_values(
        ["elegivel", "score_geral"], ascending=[False, False], na_position="last"
    ).reset_index(drop=True)
