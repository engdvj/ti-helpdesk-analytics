"""Perfil de habilidades por tecnico - aba "Habilidades" do modal de perfil.

Reusa sinais que ja existem por chamado (categoria, complexidade real,
qualidade da resposta, reabertura) pra responder duas perguntas que
score_geral sozinho nao responde: "em que tipo de chamado esse tecnico e
forte/fraco" e "ele pega chamado dificil ou so o facil". Nao e um score novo
pro ranking - e so descritivo/diagnostico, especifico do perfil individual.

Complexidade aqui usa `dificuldade_categoria` (ver analytics/complexity.py -
"Complexidade real", baseline historica de tempo de resolucao por categoria),
NAO `urgency` - mesmo motivo documentado em scores.py: urgency discrimina mal
esforco real nesta base.
"""
from __future__ import annotations

import pandas as pd

MIN_CHAMADOS_PARA_CLASSIFICAR = 3
REABERTURA_LIMITE_GAP = 0.15
SCORE_PONTO_FORTE = 70.0
SCORE_GAP = 50.0
CONF_PLENA_CHAMADOS = 5.0

# dificuldade_categoria e uma razao centrada em 1.0 (media da equipe) - faixa
# usa uma banda de +-15% em torno disso, mesmo espirito de "media da equipe"
# que o resto do app usa (score 50 = media, etc.).
LIMITE_FAIXA_BAIXA = 0.85
LIMITE_FAIXA_ALTA = 1.15

_COMPLEXIDADE_FAIXAS = ["baixa", "media", "alta"]


def _faixa_complexidade(dificuldade_categoria: float) -> str:
    if dificuldade_categoria < LIMITE_FAIXA_BAIXA:
        return "baixa"
    if dificuldade_categoria > LIMITE_FAIXA_ALTA:
        return "alta"
    return "media"


def _habilidade_score(qualidade_media: float, taxa_reabertura: float, chamados: int) -> float:
    """0-100, com shrinkage por volume (mesma logica de `confianca` em
    scores.py): poucos chamados na categoria puxam a nota pra 50 (neutro),
    nao dá pra confiar tanto numa amostra de 1-2 chamados."""
    bruto = max(0.0, min(100.0, qualidade_media - taxa_reabertura * 40.0))
    conf = min(chamados / CONF_PLENA_CHAMADOS, 1.0)
    return round(50.0 * (1 - conf) + bruto * conf, 1)


def _classificar(chamados: int, habilidade_score: float, taxa_reabertura: float) -> str:
    if chamados < MIN_CHAMADOS_PARA_CLASSIFICAR:
        return "pouca_experiencia"
    if habilidade_score >= SCORE_PONTO_FORTE and taxa_reabertura <= REABERTURA_LIMITE_GAP:
        return "ponto_forte"
    if habilidade_score < SCORE_GAP or taxa_reabertura > REABERTURA_LIMITE_GAP:
        return "gap"
    return "consistente"


def build_technician_skills(rows: pd.DataFrame, category_names: dict[int, str]) -> dict:
    """`rows` = chamados resolvidos por UM tecnico no recorte (ja filtrado
    por users_id) - mesma fatia que alimenta `_build_snapshot_details`."""
    empty = {"por_categoria": [], "por_complexidade": []}
    if rows.empty:
        return empty

    rows = rows.copy()
    if "resposta_qualidade" not in rows.columns:
        rows["resposta_qualidade"] = 0.0
    if "foi_reaberto" not in rows.columns:
        rows["foi_reaberto"] = False
    if "dificuldade_categoria" not in rows.columns:
        # gold coletado antes dessa coluna existir (ver analytics/complexity.py)
        # - 1.0 = dificuldade neutra/media, ate a proxima coleta preencher.
        rows["dificuldade_categoria"] = 1.0

    por_categoria = []
    category_rows = rows.dropna(subset=["itilcategories_id"])
    if not category_rows.empty:
        grouped = category_rows.groupby("itilcategories_id").agg(
            chamados=("tickets_id", "nunique"),
            qualidade_media=("resposta_qualidade", "mean"),
            resolucao_media_h=("solve_delay_stat", lambda s: (s / 3600).mean()),
            taxa_reabertura=("foi_reaberto", "mean"),
            complexidade_media=("dificuldade_categoria", "mean"),
        )
        for itilcategories_id, row in grouped.iterrows():
            habilidade_score = _habilidade_score(
                row["qualidade_media"], row["taxa_reabertura"], int(row["chamados"])
            )
            por_categoria.append({
                "itilcategories_id": int(itilcategories_id),
                "nome": category_names.get(int(itilcategories_id), f"Categoria #{int(itilcategories_id)}"),
                "chamados": int(row["chamados"]),
                "qualidade_media": round(float(row["qualidade_media"]), 1),
                "resolucao_media_h": round(float(row["resolucao_media_h"]), 1),
                "taxa_reabertura": round(float(row["taxa_reabertura"]), 3),
                "complexidade_media": round(float(row["complexidade_media"]), 2),
                "habilidade_score": habilidade_score,
                "classificacao": _classificar(int(row["chamados"]), habilidade_score, row["taxa_reabertura"]),
            })
        por_categoria.sort(key=lambda item: item["chamados"], reverse=True)

    complexity_rows = rows.dropna(subset=["dificuldade_categoria"]).assign(
        faixa=lambda df: df["dificuldade_categoria"].apply(_faixa_complexidade)
    )
    por_complexidade_stats = (
        complexity_rows.groupby("faixa").agg(
            chamados=("tickets_id", "nunique"),
            qualidade_media=("resposta_qualidade", "mean"),
            resolucao_media_h=("solve_delay_stat", lambda s: (s / 3600).mean()),
        )
        if not complexity_rows.empty
        else pd.DataFrame(columns=["chamados", "qualidade_media", "resolucao_media_h"])
    )
    por_complexidade = [
        {
            "faixa": faixa,
            "chamados": int(por_complexidade_stats.loc[faixa, "chamados"]) if faixa in por_complexidade_stats.index else 0,
            "qualidade_media": (
                round(float(por_complexidade_stats.loc[faixa, "qualidade_media"]), 1)
                if faixa in por_complexidade_stats.index else None
            ),
            "resolucao_media_h": (
                round(float(por_complexidade_stats.loc[faixa, "resolucao_media_h"]), 1)
                if faixa in por_complexidade_stats.index else None
            ),
        }
        for faixa in _COMPLEXIDADE_FAIXAS
    ]

    return {"por_categoria": por_categoria, "por_complexidade": por_complexidade}
