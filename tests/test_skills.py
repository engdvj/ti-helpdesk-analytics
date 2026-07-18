import pandas as pd

from ti_analytics.analytics.skills import build_technician_skills

CATEGORY_NAMES = {5: "Hardware", 9: "Wi-Fi"}


def _rows(rows: list[dict]) -> pd.DataFrame:
    defaults = {"foi_reaberto": False, "resposta_qualidade": 80.0}
    return pd.DataFrame([
        {"tickets_id": i, **defaults, **row} for i, row in enumerate(rows, start=1)
    ])


def test_empty_rows_returns_empty_skill_lists():
    result = build_technician_skills(pd.DataFrame(), CATEGORY_NAMES)
    assert result == {"por_categoria": [], "por_complexidade": []}


def test_high_quality_low_reopen_is_ponto_forte():
    rows = _rows([
        {"itilcategories_id": 5, "solve_delay_stat": 3600, "resposta_qualidade": 90}
        for _ in range(5)
    ])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    cat = result["por_categoria"][0]
    assert cat["nome"] == "Hardware"
    assert cat["chamados"] == 5
    assert cat["classificacao"] == "ponto_forte"


def test_low_quality_high_reopen_is_gap():
    rows = _rows([
        {"itilcategories_id": 5, "solve_delay_stat": 3600, "resposta_qualidade": 20, "foi_reaberto": True}
        for _ in range(5)
    ])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    cat = result["por_categoria"][0]
    assert cat["classificacao"] == "gap"


def test_few_tickets_is_pouca_experiencia_regardless_of_quality():
    rows = _rows([
        {"itilcategories_id": 5, "solve_delay_stat": 3600, "resposta_qualidade": 95},
    ])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    assert result["por_categoria"][0]["classificacao"] == "pouca_experiencia"


def test_categories_sorted_by_volume_descending():
    rows = _rows([
        *[{"itilcategories_id": 5, "solve_delay_stat": 3600} for _ in range(2)],
        *[{"itilcategories_id": 9, "solve_delay_stat": 3600} for _ in range(6)],
    ])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    assert [c["nome"] for c in result["por_categoria"]] == ["Wi-Fi", "Hardware"]


def test_unknown_category_falls_back_to_placeholder_name():
    rows = _rows([{"itilcategories_id": 999, "solve_delay_stat": 3600}])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    assert result["por_categoria"][0]["nome"] == "Categoria #999"


def test_tickets_without_category_are_excluded_from_por_categoria():
    rows = _rows([{"itilcategories_id": None, "solve_delay_stat": 3600}])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    assert result["por_categoria"] == []


def test_complexidade_media_uses_dificuldade_categoria_not_urgency():
    # duas categorias com a MESMA urgencia mas dificuldade_categoria (a
    # "Complexidade real") diferente - tem que refletir a diferenca.
    rows = _rows([
        *[{"itilcategories_id": 5, "urgency": 3, "dificuldade_categoria": 0.6, "solve_delay_stat": 3600} for _ in range(3)],
        *[{"itilcategories_id": 9, "urgency": 3, "dificuldade_categoria": 1.8, "solve_delay_stat": 3600} for _ in range(3)],
    ])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    by_nome = {c["nome"]: c for c in result["por_categoria"]}
    assert by_nome["Hardware"]["complexidade_media"] == 0.6
    assert by_nome["Wi-Fi"]["complexidade_media"] == 1.8


def test_complexidade_media_defaults_to_neutral_when_column_absent():
    rows = _rows([{"itilcategories_id": 5, "solve_delay_stat": 3600} for _ in range(3)])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    assert result["por_categoria"][0]["complexidade_media"] == 1.0


def test_por_complexidade_buckets_dificuldade_categoria_into_three_faixas():
    rows = _rows([
        {"itilcategories_id": 5, "dificuldade_categoria": 0.5, "solve_delay_stat": 3600},
        {"itilcategories_id": 5, "dificuldade_categoria": 0.7, "solve_delay_stat": 3600},
        {"itilcategories_id": 5, "dificuldade_categoria": 1.0, "solve_delay_stat": 7200},
        {"itilcategories_id": 5, "dificuldade_categoria": 1.3, "solve_delay_stat": 10800},
        {"itilcategories_id": 5, "dificuldade_categoria": 1.6, "solve_delay_stat": 10800},
    ])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    by_faixa = {f["faixa"]: f for f in result["por_complexidade"]}
    assert by_faixa["baixa"]["chamados"] == 2
    assert by_faixa["media"]["chamados"] == 1
    assert by_faixa["alta"]["chamados"] == 2


def test_por_complexidade_includes_zero_count_faixas():
    rows = _rows([{"itilcategories_id": 5, "dificuldade_categoria": 0.5, "solve_delay_stat": 3600}])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    faixas = {f["faixa"]: f for f in result["por_complexidade"]}
    assert set(faixas) == {"baixa", "media", "alta"}
    assert faixas["alta"]["chamados"] == 0
    assert faixas["alta"]["qualidade_media"] is None


def test_por_complexidade_order_is_always_baixa_media_alta():
    rows = _rows([{"itilcategories_id": 5, "dificuldade_categoria": 1.6, "solve_delay_stat": 3600}])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    assert [f["faixa"] for f in result["por_complexidade"]] == ["baixa", "media", "alta"]


def test_por_complexidade_defaults_to_media_when_column_absent():
    # sem dificuldade_categoria (gold antigo), tudo cai neutro (1.0 = media).
    rows = _rows([{"itilcategories_id": 5, "solve_delay_stat": 3600} for _ in range(3)])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    by_faixa = {f["faixa"]: f for f in result["por_complexidade"]}
    assert by_faixa["media"]["chamados"] == 3
    assert by_faixa["baixa"]["chamados"] == 0
    assert by_faixa["alta"]["chamados"] == 0


def test_shrinkage_pulls_score_toward_neutral_with_few_tickets():
    # 1 chamado com qualidade maxima ainda nao deveria virar 100 - confianca baixa.
    rows = _rows([{"itilcategories_id": 5, "solve_delay_stat": 3600, "resposta_qualidade": 100}])
    result = build_technician_skills(rows, CATEGORY_NAMES)
    assert result["por_categoria"][0]["habilidade_score"] < 100
    assert result["por_categoria"][0]["habilidade_score"] > 50
