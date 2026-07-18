import pandas as pd

from ti_analytics.analytics.complexity import (
    apply_category_difficulty_overrides,
    build_category_difficulty_table,
    compute_category_difficulty,
    filter_categories_by_root,
    load_category_difficulty_overrides,
    save_category_difficulty_override,
)


def _fact(rows: list[dict]) -> pd.DataFrame:
    defaults = {"is_solved": True}
    return pd.DataFrame([
        {"tickets_id": i, **defaults, **row} for i, row in enumerate(rows, start=1)
    ])


def test_category_with_average_delay_gets_ratio_near_one():
    fact = _fact([
        {"itilcategories_id": 1, "solve_delay_stat": 3600 * 2},
        {"itilcategories_id": 2, "solve_delay_stat": 3600 * 2},
    ])
    result = compute_category_difficulty(fact)
    assert set(result["itilcategories_id"]) == {1, 2}
    assert result["dificuldade_categoria"].round(2).tolist() == [1.0, 1.0]


def test_slower_category_gets_ratio_above_one():
    fact = _fact([
        # categoria 1: rapida, bastante volume (shrinkage nao puxa muito)
        *[{"itilcategories_id": 1, "solve_delay_stat": 3600 * 1} for _ in range(20)],
        # categoria 2: bem mais lenta, bastante volume
        *[{"itilcategories_id": 2, "solve_delay_stat": 3600 * 10} for _ in range(20)],
    ])
    result = compute_category_difficulty(fact).set_index("itilcategories_id")
    assert result.loc[1, "dificuldade_categoria"] < 1.0
    assert result.loc[2, "dificuldade_categoria"] > 1.0


def test_low_sample_category_shrinks_toward_global_mean():
    fact = _fact([
        *[{"itilcategories_id": 1, "solve_delay_stat": 3600 * 1} for _ in range(50)],
        # categoria 2: um unico chamado extremo - shrinkage deve puxar pra perto de 1.0
        {"itilcategories_id": 2, "solve_delay_stat": 3600 * 100},
    ])
    result = compute_category_difficulty(fact).set_index("itilcategories_id")
    naive_ratio = 100 / 1  # sem shrinkage seria isso
    assert result.loc[2, "dificuldade_categoria"] < naive_ratio / 2


def test_unsolved_tickets_are_ignored():
    fact = _fact([
        {"itilcategories_id": 1, "solve_delay_stat": 3600, "is_solved": False},
    ])
    result = compute_category_difficulty(fact)
    assert result.empty


def test_empty_fact_returns_empty_frame():
    result = compute_category_difficulty(pd.DataFrame())
    assert result.empty
    assert list(result.columns) == ["itilcategories_id", "dificuldade_categoria"]


def test_tickets_without_category_are_ignored():
    fact = _fact([
        {"itilcategories_id": None, "solve_delay_stat": 3600},
        {"itilcategories_id": 1, "solve_delay_stat": 3600},
    ])
    result = compute_category_difficulty(fact)
    assert result["itilcategories_id"].tolist() == [1]


def test_save_category_difficulty_override_adds_and_creates_file(tmp_path):
    path = tmp_path / "category_difficulty.yaml"

    overrides = save_category_difficulty_override(38, 2.5, path)

    assert overrides == {38: 2.5}
    assert path.exists()
    assert load_category_difficulty_overrides(path) == {38: 2.5}


def test_save_category_difficulty_override_none_removes_existing(tmp_path):
    path = tmp_path / "category_difficulty.yaml"
    save_category_difficulty_override(38, 2.5, path)
    save_category_difficulty_override(41, 0.8, path)

    overrides = save_category_difficulty_override(38, None, path)

    assert overrides == {41: 0.8}


def test_load_category_difficulty_overrides_missing_file_returns_empty(tmp_path):
    path = tmp_path / "does_not_exist.yaml"
    assert load_category_difficulty_overrides(path) == {}


def test_apply_category_difficulty_overrides_replaces_computed_value(tmp_path):
    path = tmp_path / "category_difficulty.yaml"
    save_category_difficulty_override(1, 3.0, path)
    baseline = pd.DataFrame({"itilcategories_id": [1, 2], "dificuldade_categoria": [1.1, 0.9]})

    result = apply_category_difficulty_overrides(baseline, path).set_index("itilcategories_id")

    assert result.loc[1, "dificuldade_categoria"] == 3.0
    assert result.loc[2, "dificuldade_categoria"] == 0.9


def test_apply_category_difficulty_overrides_adds_category_without_history(tmp_path):
    path = tmp_path / "category_difficulty.yaml"
    save_category_difficulty_override(99, 4.0, path)
    baseline = pd.DataFrame({"itilcategories_id": [1], "dificuldade_categoria": [1.0]})

    result = apply_category_difficulty_overrides(baseline, path).set_index("itilcategories_id")

    assert result.loc[99, "dificuldade_categoria"] == 4.0


def test_apply_category_difficulty_overrides_noop_when_no_overrides(tmp_path):
    path = tmp_path / "category_difficulty.yaml"
    baseline = pd.DataFrame({"itilcategories_id": [1], "dificuldade_categoria": [1.2]})

    result = apply_category_difficulty_overrides(baseline, path)

    assert result.equals(baseline)


def test_build_category_difficulty_table_includes_categories_without_tickets():
    fact = _fact([{"itilcategories_id": 1, "solve_delay_stat": 3600}])
    dim_categoria = pd.DataFrame([
        {"itilcategories_id": 1, "categoria_nome": "Hardware"},
        {"itilcategories_id": 2, "categoria_nome": "Sem chamado ainda"},
    ])
    table = build_category_difficulty_table(fact, dim_categoria).set_index("itilcategories_id")

    assert table.loc[2, "n_chamados"] == 0
    assert pd.isna(table.loc[2, "resolucao_media_h"])
    assert table.loc[2, "sugestao_automatica"] == 1.0
    assert table.loc[2, "dificuldade_atual"] == 1.0


def test_build_category_difficulty_table_reflects_admin_override():
    fact = _fact([
        {"itilcategories_id": 1, "solve_delay_stat": 3600},
        {"itilcategories_id": 2, "solve_delay_stat": 3600},
    ])
    dim_categoria = pd.DataFrame([
        {"itilcategories_id": 1, "categoria_nome": "Hardware"},
        {"itilcategories_id": 2, "categoria_nome": "Wi-Fi"},
    ])
    table = build_category_difficulty_table(fact, dim_categoria, overrides={2: 5.0}).set_index("itilcategories_id")

    assert table.loc[2, "override"] == 5.0
    assert table.loc[2, "dificuldade_atual"] == 5.0
    assert table.loc[1, "dificuldade_atual"] == table.loc[1, "sugestao_automatica"]


def test_build_category_difficulty_table_empty_dim_categoria_returns_empty_frame():
    table = build_category_difficulty_table(pd.DataFrame(), pd.DataFrame())
    assert table.empty
    assert "dificuldade_atual" in table.columns


def test_build_category_difficulty_table_exposes_categoria_completa():
    fact = _fact([{"itilcategories_id": 41, "solve_delay_stat": 3600}])
    dim_categoria = pd.DataFrame([
        {"itilcategories_id": 41, "categoria_nome": "Reparos", "categoria_completa": "Telefonia > Reparos"},
    ])
    table = build_category_difficulty_table(fact, dim_categoria).set_index("itilcategories_id")
    assert table.loc[41, "categoria_completa"] == "Telefonia > Reparos"


def test_build_category_difficulty_table_falls_back_to_categoria_nome_without_completa():
    # dim_categoria coletado antes de categoria_completa existir (ver
    # glpi/transforms.py) - nao pode quebrar, so perde a desambiguacao.
    fact = _fact([{"itilcategories_id": 41, "solve_delay_stat": 3600}])
    dim_categoria = pd.DataFrame([{"itilcategories_id": 41, "categoria_nome": "Reparos"}])
    table = build_category_difficulty_table(fact, dim_categoria).set_index("itilcategories_id")
    assert table.loc[41, "categoria_completa"] == "Reparos"


def test_build_category_difficulty_table_exposes_categoria_pai():
    fact = _fact([{"itilcategories_id": 41, "solve_delay_stat": 3600}])
    dim_categoria = pd.DataFrame([
        {"itilcategories_id": 41, "categoria_nome": "Reparos", "categoria_completa": "Telefonia > Reparos"},
    ])
    table = build_category_difficulty_table(fact, dim_categoria).set_index("itilcategories_id")
    assert table.loc[41, "categoria_pai"] == "Telefonia"


def test_build_category_difficulty_table_top_level_category_has_empty_categoria_pai():
    fact = _fact([{"itilcategories_id": 1, "solve_delay_stat": 3600}])
    dim_categoria = pd.DataFrame([
        {"itilcategories_id": 1, "categoria_nome": "Sistemas", "categoria_completa": "Sistemas"},
    ])
    table = build_category_difficulty_table(fact, dim_categoria).set_index("itilcategories_id")
    assert table.loc[1, "categoria_pai"] == ""


def test_build_category_difficulty_table_categoria_pai_empty_without_completa():
    # gold antigo, sem categoria_completa - pai fica vazio ate a proxima coleta.
    fact = _fact([{"itilcategories_id": 41, "solve_delay_stat": 3600}])
    dim_categoria = pd.DataFrame([{"itilcategories_id": 41, "categoria_nome": "Reparos"}])
    table = build_category_difficulty_table(fact, dim_categoria).set_index("itilcategories_id")
    assert table.loc[41, "categoria_pai"] == ""


def test_build_category_difficulty_table_multi_level_hierarchy_joins_all_ancestors():
    fact = _fact([{"itilcategories_id": 99, "solve_delay_stat": 3600}])
    dim_categoria = pd.DataFrame([
        {"itilcategories_id": 99, "categoria_nome": "AGHUSE", "categoria_completa": "Sistemas > Hospitalares > AGHUSE"},
    ])
    table = build_category_difficulty_table(fact, dim_categoria).set_index("itilcategories_id")
    assert table.loc[99, "categoria_pai"] == "Sistemas > Hospitalares"


def test_filter_categories_by_root_keeps_only_ti_tree():
    dim_categoria = pd.DataFrame([
        {"itilcategories_id": 1, "categoria_nome": "Tecnologia da Informação", "categoria_completa": "Tecnologia da Informação"},
        {"itilcategories_id": 2, "categoria_nome": "AGHUSE", "categoria_completa": "Tecnologia da Informação > Sistemas > AGHUSE"},
        {"itilcategories_id": 3, "categoria_nome": "Autoclave", "categoria_completa": "Manutenção de Equipamentos > Autoclave"},
        {"itilcategories_id": 4, "categoria_nome": "Clínica", "categoria_completa": "Tecnologia da Informação Clínica > Sistemas"},
    ])

    filtered = filter_categories_by_root(dim_categoria, "tecnologia da informação")

    assert filtered["itilcategories_id"].tolist() == [1, 2]
