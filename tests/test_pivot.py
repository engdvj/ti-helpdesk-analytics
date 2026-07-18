import pandas as pd

from ti_analytics.analytics import complexity
from ti_analytics.analytics.pivot import build_wide_chamado_tecnico


def _dim_tecnico() -> pd.DataFrame:
    return pd.DataFrame([{"users_id": 1, "nome_completo": "Tecnico Um", "username": "t1", "papel": "plantonista"}])


def test_dificuldade_categoria_is_attached_from_historical_baseline():
    fact = pd.DataFrame([
        {"tickets_id": 1, "itilcategories_id": 1, "is_solved": True, "solve_delay_stat": 3600, "entities_id": 1},
        {"tickets_id": 2, "itilcategories_id": 2, "is_solved": True, "solve_delay_stat": 3600 * 5, "entities_id": 1},
    ])
    bridge = pd.DataFrame([
        {"tickets_id": 1, "users_id": 1, "peso_credito": 1.0, "n_tecnicos_atribuidos": 1},
        {"tickets_id": 2, "users_id": 1, "peso_credito": 1.0, "n_tecnicos_atribuidos": 1},
    ])
    wide = build_wide_chamado_tecnico(fact, bridge, _dim_tecnico())
    assert "dificuldade_categoria" in wide.columns
    row1 = wide[wide["tickets_id"] == 1].iloc[0]
    row2 = wide[wide["tickets_id"] == 2].iloc[0]
    assert row1["dificuldade_categoria"] < row2["dificuldade_categoria"]


def test_ticket_without_category_defaults_to_neutral_difficulty():
    fact = pd.DataFrame([
        {"tickets_id": 1, "itilcategories_id": None, "is_solved": True, "solve_delay_stat": 3600, "entities_id": 1},
    ])
    bridge = pd.DataFrame([
        {"tickets_id": 1, "users_id": 1, "peso_credito": 1.0, "n_tecnicos_atribuidos": 1},
    ])
    wide = build_wide_chamado_tecnico(fact, bridge, _dim_tecnico())
    assert wide.iloc[0]["dificuldade_categoria"] == 1.0


def test_empty_inputs_still_expose_dificuldade_categoria_column():
    wide = build_wide_chamado_tecnico(pd.DataFrame(), pd.DataFrame(), _dim_tecnico())
    assert "dificuldade_categoria" in wide.columns


def test_admin_override_wins_over_historical_baseline(tmp_path, monkeypatch):
    monkeypatch.setattr(complexity, "CATEGORY_DIFFICULTY_PATH", tmp_path / "category_difficulty.yaml")
    complexity.save_category_difficulty_override(1, 9.0)

    fact = pd.DataFrame([
        {"tickets_id": 1, "itilcategories_id": 1, "is_solved": True, "solve_delay_stat": 3600, "entities_id": 1},
    ])
    bridge = pd.DataFrame([
        {"tickets_id": 1, "users_id": 1, "peso_credito": 1.0, "n_tecnicos_atribuidos": 1},
    ])
    wide = build_wide_chamado_tecnico(fact, bridge, _dim_tecnico())
    assert wide.iloc[0]["dificuldade_categoria"] == 9.0
