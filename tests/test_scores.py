import pandas as pd

from ti_analytics.analytics.scores import TECH_SCORE_WEIGHTS, build_tech_scores


def _dim_tecnico() -> pd.DataFrame:
    return pd.DataFrame([
        {"users_id": 1, "nome_completo": "Tecnico Um", "username": "t1", "papel": "plantonista"},
        {"users_id": 2, "nome_completo": "Tecnico Dois", "username": "t2", "papel": "plantonista"},
        {"users_id": 3, "nome_completo": "Ananda", "username": "ti-supervisor", "papel": "coordenadora"},
    ])


def _wide() -> pd.DataFrame:
    rows = [
        {"tickets_id": 1, "users_id": 1, "peso_credito": 1.0, "itilcategories_id": 5, "urgency": 4,
         "is_solved": True, "takeintoaccount_delay_stat": 600, "solve_delay_stat": 3600, "solvedate": "2026-07-01"},
        {"tickets_id": 2, "users_id": 1, "peso_credito": 1.0, "itilcategories_id": 6, "urgency": 5,
         "is_solved": True, "takeintoaccount_delay_stat": 300, "solve_delay_stat": 1800, "solvedate": "2026-07-02"},
        {"tickets_id": 3, "users_id": 2, "peso_credito": 0.5, "itilcategories_id": 5, "urgency": 3,
         "is_solved": True, "takeintoaccount_delay_stat": 1200, "solve_delay_stat": 7200, "solvedate": "2026-07-01"},
    ]
    return pd.DataFrame(rows)


def test_weights_sum_to_one():
    assert abs(sum(TECH_SCORE_WEIGHTS.values()) - 1.0) < 1e-9


def test_technician_with_zero_tickets_gets_neutral_score():
    scores = build_tech_scores(_wide(), _dim_tecnico())
    row = scores[scores["users_id"] == 3].iloc[0]
    assert row["confianca"] == 0.0
    assert row["score_geral"] == 50.0
    assert row["nivel_evidencia"] == "baixa"


def test_multi_tech_credit_reflected_in_volume():
    scores = build_tech_scores(_wide(), _dim_tecnico())
    row2 = scores[scores["users_id"] == 2].iloc[0]
    assert row2["chamados_resolvidos"] == 0.5


def test_all_technicians_present_even_without_tickets():
    scores = build_tech_scores(_wide(), _dim_tecnico())
    assert set(scores["users_id"]) == {1, 2, 3}


def test_ref_stats_seeded_only_once_not_overwritten():
    dim = _dim_tecnico()
    wide = _wide()
    plantonistas = dim[dim["papel"] == "plantonista"]
    wide_plant = wide[wide["users_id"].isin(plantonistas["users_id"])]

    ref_stats: dict = {}
    build_tech_scores(wide_plant, plantonistas, ref_stats=ref_stats)
    seeded = dict(ref_stats)

    build_tech_scores(wide, dim, ref_stats=ref_stats)  # inclui a coordenadora agora
    assert ref_stats == seeded  # nao foi repopulado pela segunda chamada


def test_empty_wide_still_returns_neutral_rows_for_all_technicians():
    empty_wide = pd.DataFrame(columns=["tickets_id", "users_id", "peso_credito", "itilcategories_id",
                                        "urgency", "is_solved", "takeintoaccount_delay_stat",
                                        "solve_delay_stat", "solvedate"])
    scores = build_tech_scores(empty_wide, _dim_tecnico())
    assert len(scores) == 3
    assert (scores["score_geral"] == 50.0).all()
