"""Indice de dificuldade por categoria de chamado.

`urgency` (usada em score_complexidade, ver scores.py) e fraca preditora de
esforco real nesta base: solve_delay fica achatado ~4-5h entre urgencia 3 e
5, e a mediana ate cai na urgencia 5 (ver analise que motivou este modulo).
Isso nao invalida seu uso no score - o objetivo la e anti-cherry-picking,
nao previsao de esforco - mas como sinal de "o quao dificil foi o trabalho
desse tecnico" ela discrimina mal.

Este indice usa o tempo HISTORICO de resolucao por categoria como baseline
de dificuldade. Calculado sobre TODO o historico coletado (nao so a janela
do snapshot) - mesmo raciocinio do `ref_stats` em scores.py: um tecnico que
pegou uma categoria dificil so na semana em que ela apareceu nao pode
distorcer a baseline dessa categoria.

E puramente informativo (vira filtro de ordenacao no frontend) - nao entra
em score_geral nem em TECH_SCORE_WEIGHTS.

O calculo automatico serve de SUGESTAO/fallback - o painel /admin
(secao "Complexidade por categoria") deixa o admin sobrescrever categoria a
categoria com julgamento proprio (mesma logica de `papel` em
team_roles.yaml: conhecimento organizacional que o GLPI nao tem como saber
sozinho). Categoria sem override usa o calculo automatico.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ti_analytics.config import load_yaml
from ti_analytics.paths import CONFIG_DIR
from ti_analytics.utils.io import write_yaml

SHRINKAGE_K = 8.0  # chamados; categoria com poucos exemplos puxa pra media geral
CATEGORY_DIFFICULTY_PATH = CONFIG_DIR / "category_difficulty.yaml"


def filter_categories_by_root(dim_categoria: pd.DataFrame, root: str) -> pd.DataFrame:
    """Mantem somente a raiz informada e suas descendentes no GLPI.

    A comparacao usa o primeiro segmento de ``categoria_completa`` para nao
    confundir uma arvore como "Tecnologia da Informacao Clinica" com a arvore
    de TI. Espacos e diferencas de maiusculas/minusculas sao ignorados.
    """
    if dim_categoria.empty:
        return dim_categoria.copy()

    path_column = "categoria_completa" if "categoria_completa" in dim_categoria.columns else "categoria_nome"
    normalized_root = root.strip().casefold()
    category_roots = (
        dim_categoria[path_column]
        .fillna("")
        .astype(str)
        .str.split(">", n=1)
        .str[0]
        .str.strip()
        .str.casefold()
    )
    return dim_categoria.loc[category_roots.eq(normalized_root)].copy()


def compute_category_difficulty(fact_chamado: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por `itilcategories_id` com `dificuldade_categoria`: razao
    entre o tempo medio (com shrinkage pra categorias de poucos chamados) de
    resolucao da categoria e a media geral. 1.0 = dificuldade tipica da
    equipe, 2.0 = leva o dobro do tempo tipico pra resolver."""
    empty = pd.DataFrame(columns=["itilcategories_id", "dificuldade_categoria"])
    if fact_chamado.empty:
        return empty

    solved = fact_chamado[fact_chamado["is_solved"] & fact_chamado["itilcategories_id"].notna()]
    if solved.empty:
        return empty

    solve_h = solved["solve_delay_stat"] / 3600
    global_mean = float(solve_h.mean())
    if not global_mean:
        return empty

    stats = solved.assign(solve_h=solve_h).groupby("itilcategories_id")["solve_h"].agg(["mean", "count"])
    shrunk = (stats["mean"] * stats["count"] + global_mean * SHRINKAGE_K) / (stats["count"] + SHRINKAGE_K)
    return (shrunk / global_mean).rename("dificuldade_categoria").reset_index()


def load_category_difficulty_overrides(path: Path | None = None) -> dict[int, float]:
    """Pesos definidos manualmente pelo admin, por `itilcategories_id` - tem
    prioridade sobre `compute_category_difficulty()`. Categoria sem entrada
    aqui usa o calculo automatico como sugestao."""
    config_path = path or CATEGORY_DIFFICULTY_PATH
    if not config_path.exists():
        return {}
    overrides = load_yaml(config_path).get("overrides", {})
    return {int(k): float(v) for k, v in overrides.items()}


def save_category_difficulty_override(
    itilcategories_id: int, peso: float | None, path: Path | None = None
) -> dict[int, float]:
    """peso=None remove o override (volta a usar a sugestao automatica)."""
    config_path = path or CATEGORY_DIFFICULTY_PATH
    overrides = load_category_difficulty_overrides(config_path)
    if peso is not None:
        overrides[itilcategories_id] = float(peso)
    else:
        overrides.pop(itilcategories_id, None)
    write_yaml(config_path, {"overrides": overrides})
    return overrides


def save_category_difficulty_overrides(
    overrides: dict[int, float], path: Path | None = None
) -> dict[int, float]:
    """Substitui o conjunto completo (usado ao aplicar/importar preset)."""
    normalized = {int(category_id): float(weight) for category_id, weight in overrides.items()}
    write_yaml(path or CATEGORY_DIFFICULTY_PATH, {"overrides": normalized})
    return normalized


def apply_category_difficulty_overrides(
    baseline: pd.DataFrame, path: Path | None = None
) -> pd.DataFrame:
    """Substitui o calculo automatico pelo peso manual do admin, categoria a
    categoria. Categoria com override mas ainda sem chamado resolvido (sem
    linha em `baseline`) tambem entra - so precisa do id pro merge em
    pivot.py funcionar assim que o primeiro chamado dela aparecer."""
    overrides = load_category_difficulty_overrides(path)
    if not overrides:
        return baseline
    merged = dict(zip(baseline["itilcategories_id"], baseline["dificuldade_categoria"]))
    merged.update(overrides)
    return pd.DataFrame({
        "itilcategories_id": list(merged.keys()),
        "dificuldade_categoria": list(merged.values()),
    })


def _derive_categoria_pai(categoria_completa: pd.Series) -> pd.Series:
    """'Telefonia > Reparos' -> 'Telefonia'. Categoria de topo (sem pai) ou
    sem completename disponivel vira string vazia."""
    def parent(value: object) -> str:
        parts = [p.strip() for p in str(value).split(">") if p.strip()]
        return " > ".join(parts[:-1]) if len(parts) > 1 else ""

    return categoria_completa.apply(parent)


def build_category_difficulty_table(
    fact_chamado: pd.DataFrame,
    dim_categoria: pd.DataFrame,
    overrides: dict[int, float] | None = None,
) -> pd.DataFrame:
    """Uma linha por categoria conhecida (mesmo as sem chamado historico)
    com contagem, tempo medio de resolucao, sugestao automatica e o override
    do admin (se houver) - alimenta a tabela do painel /admin."""
    overrides = overrides or {}
    columns = [
        "itilcategories_id", "categoria_pai", "categoria_nome", "categoria_completa",
        "n_chamados", "resolucao_media_h", "sugestao_automatica", "override", "dificuldade_atual",
    ]
    if dim_categoria.empty:
        return pd.DataFrame(columns=columns)
    if "categoria_completa" not in dim_categoria.columns:
        # gold coletado antes dessa coluna existir (ver glpi/transforms.py)
        # - usa o nome de folha ate a proxima coleta preencher de verdade
        # (categoria_pai fica vazio ate la, ver _derive_categoria_pai).
        dim_categoria = dim_categoria.assign(categoria_completa=dim_categoria["categoria_nome"])
    dim_categoria = dim_categoria.assign(categoria_pai=_derive_categoria_pai(dim_categoria["categoria_completa"]))

    baseline = compute_category_difficulty(fact_chamado)

    if not fact_chamado.empty:
        solved = fact_chamado[fact_chamado["is_solved"] & fact_chamado["itilcategories_id"].notna()]
    else:
        solved = fact_chamado
    if not solved.empty:
        counts = solved.groupby("itilcategories_id").agg(
            n_chamados=("tickets_id", "nunique"),
            resolucao_media_h=("solve_delay_stat", lambda s: (s / 3600).mean()),
        ).reset_index()
    else:
        counts = pd.DataFrame(columns=["itilcategories_id", "n_chamados", "resolucao_media_h"])

    table = dim_categoria.merge(counts, on="itilcategories_id", how="left")
    table = table.merge(
        baseline.rename(columns={"dificuldade_categoria": "sugestao_automatica"}),
        on="itilcategories_id", how="left",
    )
    table["n_chamados"] = table["n_chamados"].fillna(0).astype(int)
    table["sugestao_automatica"] = table["sugestao_automatica"].fillna(1.0)
    table["override"] = table["itilcategories_id"].map(overrides)
    table["dificuldade_atual"] = table["override"].fillna(table["sugestao_automatica"])
    return table[columns].sort_values("itilcategories_id").reset_index(drop=True)
