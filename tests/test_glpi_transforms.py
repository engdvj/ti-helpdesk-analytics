import pandas as pd

from ti_analytics.glpi.transforms import (
    normalize_categories,
    normalize_reopened_flags,
    normalize_solution_quality,
    normalize_technicians,
    normalize_ticket_bridge,
    normalize_tickets,
)
from ti_analytics.glpi.pipeline import _merge_category_catalog, _select_ti_categories

TEAM_ROLES = {
    "default_por_profile": {"Supervisor": "coordenadora", "Plantonista": "plantonista"},
    "overrides": {22: "tatico"},
}


def test_normalize_technicians_applies_overrides_and_default():
    raw = [
        {"users_id": 19, "username": "ti-supervisor", "firstname": "", "realname": "", "glpi_profile": "Supervisor"},
        {"users_id": 22, "username": "ti-davi", "firstname": "Davi", "realname": "Costa", "glpi_profile": "Plantonista"},
        {"users_id": 43, "username": "ti-artur", "firstname": "Arthur", "realname": "Pereira", "glpi_profile": "Plantonista"},
    ]
    df = normalize_technicians(raw, TEAM_ROLES)
    papel = df.set_index("users_id")["papel"]
    assert papel[19] == "coordenadora"
    assert papel[22] == "tatico"  # override vence o default do profile
    assert papel[43] == "plantonista"
    assert df.set_index("users_id").loc[22, "nome_completo"] == "Davi Costa"


def test_normalize_tickets_filters_by_entity_and_flags_solved():
    raw = [
        {
            "id": 1, "entities_id": 9, "itilcategories_id": 5,
            "date": "2026-07-01 10:00:00", "solvedate": "2026-07-01 12:00:00",
            "status": 5, "urgency": 4, "priority": 4,
            "takeintoaccount_delay_stat": 600, "solve_delay_stat": 7200,
        },
        {
            "id": 2, "entities_id": 10, "itilcategories_id": 8,  # entidade fora de TI - deve ser filtrada
            "date": "2026-07-01 10:00:00", "solvedate": None,
            "status": 2, "urgency": 3, "priority": 3,
            "takeintoaccount_delay_stat": None, "solve_delay_stat": None,
        },
    ]
    df = normalize_tickets(raw, ti_entity_ids={9, 13})
    assert len(df) == 1
    assert df.iloc[0]["tickets_id"] == 1
    assert bool(df.iloc[0]["is_solved"]) is True


def test_normalize_ticket_bridge_splits_credit_evenly():
    ticket_user_map = {
        100: [{"users_id": 22, "type": 2}, {"users_id": 50, "type": 2}, {"users_id": 999, "type": 1}],
        101: [{"users_id": 43, "type": 2}],
    }
    df = normalize_ticket_bridge(ticket_user_map)
    peso_100 = df[df["tickets_id"] == 100]["peso_credito"]
    assert (peso_100 == 0.5).all()
    assert len(peso_100) == 2  # type=1 (requerente) nao entra
    peso_101 = df[df["tickets_id"] == 101]["peso_credito"].iloc[0]
    assert peso_101 == 1.0


def test_normalize_reopened_flags():
    logs = {
        1: [{"id_search_option": 12, "new_value": "5", "date_mod": "2026-01-01"}],
        2: [
            {"id_search_option": 12, "new_value": "5", "date_mod": "2026-01-01"},
            {"id_search_option": 12, "new_value": "2", "date_mod": "2026-01-02"},
        ],
    }
    df = normalize_reopened_flags(logs).set_index("tickets_id")["foi_reaberto"]
    assert bool(df[1]) is False
    assert bool(df[2]) is True


def test_normalize_solution_quality():
    solutions = {
        1: [{"content": "<p><strong>Problema identificado: tela azul</strong></p>"
                          "<p><strong>O que foi feito: trocado o HD, reinstalado o SO, testado boot</strong></p>"}],
        2: [],  # sem ITILSolution nenhuma - deve virar 0, nao ficar de fora do resultado
    }
    df = normalize_solution_quality(solutions).set_index("tickets_id")["resposta_qualidade"]
    assert df[1] > 0
    assert df[2] == 0.0


def test_normalize_categories():
    raw = [{"id": 5, "name": "Impressora comum"}, {"id": 6, "name": "Redes"}]
    df = normalize_categories(raw)
    assert list(df["categoria_nome"]) == ["Impressora comum", "Redes"]


def test_normalize_categories_uses_completename_when_present():
    raw = [{"id": 41, "name": "Reparos", "completename": "Telefonia > Reparos"}]
    df = normalize_categories(raw)
    assert df.iloc[0]["categoria_completa"] == "Telefonia > Reparos"


def test_normalize_categories_falls_back_to_name_without_completename():
    raw = [{"id": 5, "name": "Impressora comum"}]
    df = normalize_categories(raw)
    assert df.iloc[0]["categoria_completa"] == "Impressora comum"


def test_category_selection_keeps_global_categories_referenced_by_ti_tickets():
    categories = [
        {"id": 34, "entities_id": 0, "name": "Teclado"},
        {"id": 128, "entities_id": 9, "name": "Outros"},
        {"id": 77, "entities_id": 2, "name": "Categoria de outra equipe"},
    ]
    selected = _select_ti_categories(categories, ti_entity_ids={9}, referenced_category_ids={34})
    assert {category["id"] for category in selected} == {34, 128}


def test_category_catalog_merge_preserves_history_and_prefers_current_name():
    current = pd.DataFrame([
        {"itilcategories_id": 38, "categoria_nome": "Impressora", "categoria_completa": "TI > Impressora"},
    ])
    previous = pd.DataFrame([
        {"itilcategories_id": 38, "categoria_nome": "Nome antigo", "categoria_completa": "TI > Nome antigo"},
        {"itilcategories_id": 41, "categoria_nome": "Reparos", "categoria_completa": "TI > Reparos"},
    ])
    merged = _merge_category_catalog(current, previous).set_index("itilcategories_id")
    assert merged.loc[38, "categoria_nome"] == "Impressora"
    assert merged.loc[41, "categoria_nome"] == "Reparos"
