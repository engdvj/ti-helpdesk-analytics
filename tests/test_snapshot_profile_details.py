import pandas as pd

from api.app.routers.analytics.snapshots import _build_snapshot_details, _select_snapshot_window


def _wide() -> pd.DataFrame:
    return pd.DataFrame([
        {
            "tickets_id": 10,
            "users_id": 1,
            "peso_credito": 1.0,
            "itilcategories_id": 5,
            "is_solved": True,
            "solvedate": "2026-07-01 10:00:00",
            "takeintoaccount_delay_stat": 600,
        },
        {
            "tickets_id": 11,
            "users_id": 1,
            "peso_credito": 0.5,
            "itilcategories_id": 6,
            "is_solved": True,
            "solvedate": "2026-07-02 11:00:00",
            "takeintoaccount_delay_stat": 1800,
        },
        {
            "tickets_id": 12,
            "users_id": 2,
            "peso_credito": 1.0,
            "itilcategories_id": 5,
            "is_solved": True,
            "solvedate": "2026-07-02 12:00:00",
            "takeintoaccount_delay_stat": 300,
        },
    ])


def test_snapshot_window_distinguishes_cumulative_from_individual():
    cumulative = _select_snapshot_window(_wide(), "diaria", True, snapshot_seq=2)
    individual = _select_snapshot_window(_wide(), "diaria", False, snapshot_seq=2)

    assert list(cumulative["tickets_id"]) == [10, 11, 12]
    assert list(individual["tickets_id"]) == [11, 12]


def test_snapshot_details_exposes_category_counts_credits_and_response_times():
    window = _select_snapshot_window(_wide(), "diaria", True, snapshot_seq=2)
    details = _build_snapshot_details(window, users_id=1, category_names={5: "Hardware", 6: "Redes"})

    assert details["categorias"] == [
        {"itilcategories_id": 5, "nome": "Hardware", "credito": 1.0, "chamados": 1},
        {"itilcategories_id": 6, "nome": "Redes", "credito": 0.5, "chamados": 1},
    ]
    assert details["chamados"] == [
        {"tickets_id": 11, "credito": 0.5},
        {"tickets_id": 10, "credito": 1.0},
    ]
    assert details["tempos_resposta"] == [
        {"tickets_id": 11, "minutos": 30.0},
        {"tickets_id": 10, "minutos": 10.0},
    ]
