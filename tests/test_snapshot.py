import pandas as pd

from ti_analytics.analytics.snapshot import (
    build_daily_cumulative_snapshots,
    build_periodic_snapshots,
)


def _dim_tecnico() -> pd.DataFrame:
    return pd.DataFrame([
        {"users_id": 1, "nome_completo": "Tecnico Um", "username": "t1", "papel": "plantonista"},
        {"users_id": 2, "nome_completo": "Tecnico Dois", "username": "t2", "papel": "plantonista"},
    ])


def _wide_multi_day() -> pd.DataFrame:
    rows = [
        {"tickets_id": 1, "users_id": 1, "peso_credito": 1.0, "itilcategories_id": 5, "urgency": 4,
         "is_solved": True, "takeintoaccount_delay_stat": 600, "solve_delay_stat": 3600, "solvedate": "2026-07-01 10:00:00"},
        {"tickets_id": 2, "users_id": 1, "peso_credito": 1.0, "itilcategories_id": 6, "urgency": 5,
         "is_solved": True, "takeintoaccount_delay_stat": 300, "solve_delay_stat": 1800, "solvedate": "2026-07-02 10:00:00"},
        {"tickets_id": 3, "users_id": 2, "peso_credito": 1.0, "itilcategories_id": 5, "urgency": 3,
         "is_solved": True, "takeintoaccount_delay_stat": 1200, "solve_delay_stat": 7200, "solvedate": "2026-07-02 11:00:00"},
    ]
    return pd.DataFrame(rows)


def test_daily_cumulative_has_one_snapshot_per_distinct_day():
    timeline = build_daily_cumulative_snapshots(_wide_multi_day(), _dim_tecnico())
    assert set(timeline["snapshot_seq"]) == {1, 2}
    assert set(timeline["granularidade"]) == {"diaria_acumulada"}


def test_daily_cumulative_is_cumulative_not_windowed():
    timeline = build_daily_cumulative_snapshots(_wide_multi_day(), _dim_tecnico())
    # no snapshot 1 (dia 01), so o chamado 1 aconteceu -> tecnico 1 tem 1 chamado, tecnico 2 tem 0
    snap1 = timeline[timeline["snapshot_seq"] == 1].set_index("users_id")
    assert snap1.loc[1, "chamados_resolvidos"] == 1.0
    assert snap1.loc[2, "chamados_resolvidos"] == 0.0
    # no snapshot 2 (dia 02, cumulativo), tecnico 1 ja tem 2 chamados
    snap2 = timeline[timeline["snapshot_seq"] == 2].set_index("users_id")
    assert snap2.loc[1, "chamados_resolvidos"] == 2.0
    assert snap2.loc[2, "chamados_resolvidos"] == 1.0


def test_weekly_snapshots_are_not_cumulative():
    timeline = build_periodic_snapshots(_wide_multi_day(), _dim_tecnico(), "W", "semanal")
    assert set(timeline["granularidade"]) == {"semanal"}
    assert len(timeline["snapshot_seq"].unique()) >= 1


def test_empty_wide_returns_empty_timeline():
    empty = pd.DataFrame(columns=["tickets_id", "users_id", "peso_credito", "itilcategories_id",
                                   "urgency", "is_solved", "takeintoaccount_delay_stat",
                                   "solve_delay_stat", "solvedate"])
    assert build_daily_cumulative_snapshots(empty, _dim_tecnico()).empty
