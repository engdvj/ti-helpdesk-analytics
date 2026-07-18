import pandas as pd

from ti_analytics.analytics.snapshot import (
    available_snapshot_periods,
    build_snapshots,
    filter_snapshot_range,
)


def _dim_tecnico() -> pd.DataFrame:
    return pd.DataFrame([
        {"users_id": 1, "nome_completo": "Tecnico Um", "username": "t1", "papel": "plantonista"},
        {"users_id": 2, "nome_completo": "Tecnico Dois", "username": "t2", "papel": "plantonista"},
    ])


def _wide_multi_day() -> pd.DataFrame:
    rows = [
        {"tickets_id": 1, "users_id": 1, "peso_credito": 1.0, "itilcategories_id": 5, "urgency": 4,
         "is_solved": True, "takeintoaccount_delay_stat": 600, "solve_delay_stat": 3600, "solvedate": "2026-07-01 10:00:00",
         "resposta_qualidade": 80.0},
        {"tickets_id": 2, "users_id": 1, "peso_credito": 1.0, "itilcategories_id": 6, "urgency": 5,
         "is_solved": True, "takeintoaccount_delay_stat": 300, "solve_delay_stat": 1800, "solvedate": "2026-07-02 10:00:00",
         "resposta_qualidade": 90.0},
        {"tickets_id": 3, "users_id": 2, "peso_credito": 1.0, "itilcategories_id": 5, "urgency": 3,
         "is_solved": True, "takeintoaccount_delay_stat": 1200, "solve_delay_stat": 7200, "solvedate": "2026-07-02 11:00:00",
         "resposta_qualidade": 40.0},
    ]
    return pd.DataFrame(rows)


def test_daily_cumulative_has_one_snapshot_per_distinct_day():
    timeline = build_snapshots(_wide_multi_day(), _dim_tecnico(), "diaria", cumulativo=True)
    assert set(timeline["snapshot_seq"]) == {1, 2}
    assert set(timeline["granularidade"]) == {"diaria"}
    assert set(timeline["cumulativo"]) == {True}


def test_daily_cumulative_is_cumulative_not_windowed():
    timeline = build_snapshots(_wide_multi_day(), _dim_tecnico(), "diaria", cumulativo=True)
    # no snapshot 1 (dia 01), so o chamado 1 aconteceu -> tecnico 1 tem 1 chamado, tecnico 2 tem 0
    snap1 = timeline[timeline["snapshot_seq"] == 1].set_index("users_id")
    assert snap1.loc[1, "chamados_resolvidos"] == 1.0
    assert snap1.loc[2, "chamados_resolvidos"] == 0.0
    # no snapshot 2 (dia 02, cumulativo), tecnico 1 ja tem 2 chamados
    snap2 = timeline[timeline["snapshot_seq"] == 2].set_index("users_id")
    assert snap2.loc[1, "chamados_resolvidos"] == 2.0
    assert snap2.loc[2, "chamados_resolvidos"] == 1.0


def test_daily_individual_is_not_cumulative():
    timeline = build_snapshots(_wide_multi_day(), _dim_tecnico(), "diaria", cumulativo=False)
    # no dia 02 (nao-cumulativo), tecnico 1 so tem o chamado 2 (nao soma o chamado 1 do dia 01)
    snap2 = timeline[timeline["snapshot_seq"] == 2].set_index("users_id")
    assert snap2.loc[1, "chamados_resolvidos"] == 1.0
    assert snap2.loc[2, "chamados_resolvidos"] == 1.0
    assert set(timeline["cumulativo"]) == {False}


def test_weekly_snapshots_are_not_cumulative_by_default():
    timeline = build_snapshots(_wide_multi_day(), _dim_tecnico(), "semanal", cumulativo=False)
    assert set(timeline["granularidade"]) == {"semanal"}
    assert len(timeline["snapshot_seq"].unique()) >= 1


def test_weekly_cumulative_sums_across_weeks():
    # 2 chamados do tecnico 1 caem na mesma semana no fixture atual, entao
    # cumulativo=True com 1 unica semana ainda deve refletir os 2 chamados.
    timeline = build_snapshots(_wide_multi_day(), _dim_tecnico(), "semanal", cumulativo=True)
    ultimo = timeline[timeline["snapshot_seq"] == timeline["snapshot_seq"].max()].set_index("users_id")
    assert ultimo.loc[1, "chamados_resolvidos"] == 2.0


def test_empty_wide_returns_empty_timeline():
    empty = pd.DataFrame(columns=["tickets_id", "users_id", "peso_credito", "itilcategories_id",
                                   "urgency", "is_solved", "takeintoaccount_delay_stat",
                                   "solve_delay_stat", "solvedate"])
    assert build_snapshots(empty, _dim_tecnico(), "diaria", cumulativo=True).empty


def test_interval_filter_is_inclusive_and_changes_cumulative_origin():
    filtered = filter_snapshot_range(_wide_multi_day(), "2026-07-02", "2026-07-02")
    assert set(filtered["tickets_id"]) == {2, 3}

    timeline = build_snapshots(filtered, _dim_tecnico(), "diaria", cumulativo=True)
    ultimo = timeline[timeline["snapshot_seq"] == 1].set_index("users_id")
    assert ultimo.loc[1, "chamados_resolvidos"] == 1.0
    assert ultimo.loc[2, "chamados_resolvidos"] == 1.0


def test_interval_filter_rejects_inverted_dates():
    try:
        filter_snapshot_range(_wide_multi_day(), "2026-07-03", "2026-07-01")
    except ValueError as exc:
        assert "data_inicio" in str(exc)
    else:
        raise AssertionError("intervalo invertido deveria ser rejeitado")


def test_available_periods_expose_calendar_boundaries():
    daily = available_snapshot_periods(_wide_multi_day(), "diaria")
    assert daily == [
        {"ref": "2026-07-01", "inicio": "2026-07-01", "fim": "2026-07-01"},
        {"ref": "2026-07-02", "inicio": "2026-07-02", "fim": "2026-07-02"},
    ]

    weekly = available_snapshot_periods(_wide_multi_day(), "semanal")
    assert weekly == [{
        "ref": "2026-06-29/2026-07-05",
        "inicio": "2026-06-29",
        "fim": "2026-07-05",
    }]


def test_calendar_continues_through_reference_date_without_activity():
    periods = available_snapshot_periods(
        _wide_multi_day(),
        "diaria",
        data_fim="2026-07-04",
    )
    assert [period["ref"] for period in periods] == [
        "2026-07-01",
        "2026-07-02",
        "2026-07-03",
        "2026-07-04",
    ]


def test_empty_calendar_day_has_cumulative_and_individual_snapshots():
    cumulative = build_snapshots(
        _wide_multi_day(),
        _dim_tecnico(),
        "diaria",
        cumulativo=True,
        data_fim="2026-07-03",
    )
    cumulative_last = cumulative[cumulative["snapshot_seq"] == 3].set_index("users_id")
    assert set(cumulative["periodo_ref"]) == {"2026-07-01", "2026-07-02", "2026-07-03"}
    assert cumulative_last.loc[1, "chamados_resolvidos"] == 2.0
    assert cumulative_last.loc[2, "chamados_resolvidos"] == 1.0

    individual = build_snapshots(
        _wide_multi_day(),
        _dim_tecnico(),
        "diaria",
        cumulativo=False,
        data_fim="2026-07-03",
    )
    individual_last = individual[individual["snapshot_seq"] == 3]
    assert set(individual_last["periodo_ref"]) == {"2026-07-03"}
    assert (individual_last["chamados_resolvidos"] == 0).all()
