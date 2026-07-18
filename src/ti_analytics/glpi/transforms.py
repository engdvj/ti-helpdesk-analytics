"""Normalizadores puros: dict/list cru do GLPI -> DataFrame silver/gold-ready.

Sem rede aqui (mesma filosofia do fifa_analytics/fifa/transforms.py) - cada
funcao recebe payload ja coletado e devolve um DataFrame com schema fixo.
"""
from __future__ import annotations

import pandas as pd

from ti_analytics.analytics.reopens import detect_reopened
from ti_analytics.glpi.solution_quality import solution_quality_score
from ti_analytics.utils.schema_validate import validate_dataframe
from ti_analytics.utils.time import utc_now_iso

SOLVED_THRESHOLD = 5


def normalize_technicians(raw_members: list[dict], team_roles: dict) -> pd.DataFrame:
    """raw_members: um dict por membro do grupo TI, com users_id/username/
    firstname/realname/glpi_profile ja resolvidos (ver glpi/pipeline.py).

    `papel` vem de team_roles.yaml: overrides explicitos por users_id
    (tatico/coordenadora) tem prioridade sobre o default por profile GLPI.
    Nunca hardcodear nome de usuario aqui - so config.
    """
    default_por_profile: dict[str, str] = team_roles.get("default_por_profile", {})
    overrides: dict[int, str] = {int(k): v for k, v in team_roles.get("overrides", {}).items()}

    rows = []
    for m in raw_members:
        uid = int(m["users_id"])
        profile = m.get("glpi_profile") or ""
        papel = overrides.get(uid) or default_por_profile.get(profile, "plantonista")
        nome = " ".join(p for p in [m.get("firstname"), m.get("realname")] if p).strip()
        rows.append({
            "users_id": uid,
            "username": m.get("username"),
            "nome_completo": nome or m.get("username", ""),
            "glpi_profile": profile,
            "papel": papel,
            "ativo": True,
            "collected_at": utc_now_iso(),
        })
    df = pd.DataFrame(rows)
    validate_dataframe(df, "technician.yaml", allow_empty=False)
    return df


def normalize_tickets(tickets_raw: list[dict], ti_entity_ids: set[int]) -> pd.DataFrame:
    """Filtra so os chamados das entidades de TI (ver glpi/entities.py) e
    projeta so os campos usados pelo motor de score. `impact` fica de fora
    de proposito - e constante (sempre 3) na base real, sem variancia."""
    collected_at = utc_now_iso()
    rows = []
    for t in tickets_raw:
        if t.get("entities_id") not in ti_entity_ids:
            continue
        status = t.get("status") or 0
        rows.append({
            "tickets_id": t["id"],
            "entities_id": t["entities_id"],
            "itilcategories_id": t.get("itilcategories_id") or None,
            "date": t.get("date"),
            "solvedate": t.get("solvedate"),
            "status": status,
            "is_solved": status >= SOLVED_THRESHOLD,
            "urgency": t.get("urgency"),
            "priority": t.get("priority"),
            "takeintoaccount_delay_stat": t.get("takeintoaccount_delay_stat"),
            "solve_delay_stat": t.get("solve_delay_stat"),
            "collected_at": collected_at,
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        for col in ("date", "solvedate"):
            df[col] = pd.to_datetime(df[col], errors="coerce")
    validate_dataframe(df, "ticket.yaml")
    return df


def normalize_ticket_bridge(ticket_user_map: dict[int, list[dict]]) -> pd.DataFrame:
    """Um Ticket_User (tipo=2, "atribuido") por tecnico por chamado vira uma
    linha com peso_credito = 1/n_atribuidos. TODO o rateio de credito mora
    aqui - scores.py nunca precisa saber que um chamado teve mais de 1 tecnico."""
    rows = []
    for tickets_id, ticket_users in ticket_user_map.items():
        assigned = [
            tu for tu in ticket_users
            if isinstance(tu, dict) and tu.get("type") == 2 and tu.get("users_id")
        ]
        n = len(assigned)
        if n == 0:
            continue
        peso = 1.0 / n
        for tu in assigned:
            rows.append({
                "tickets_id": tickets_id,
                "users_id": tu["users_id"],
                "peso_credito": peso,
                "n_tecnicos_atribuidos": n,
            })
    df = pd.DataFrame(rows)
    validate_dataframe(df, "ticket_bridge.yaml")
    return df


def normalize_reopened_flags(ticket_logs: dict[int, list[dict]]) -> pd.DataFrame:
    """tickets_id -> foi_reaberto (bool), a partir do changelog de cada chamado."""
    rows = [
        {"tickets_id": tid, "foi_reaberto": detect_reopened(entries)}
        for tid, entries in ticket_logs.items()
    ]
    return pd.DataFrame(rows)


def normalize_solution_quality(ticket_solutions: dict[int, list[dict]]) -> pd.DataFrame:
    """tickets_id -> resposta_qualidade (0-100), a partir do ITILSolution mais
    recente do chamado (ver glpi/solution_quality.py pra heuristica). Chamado
    sem nenhuma ITILSolution registrada entra com 0 - nao documentar a
    solucao conta como resposta ruim, nao como "sem dado"."""
    rows = []
    for tid, solutions in ticket_solutions.items():
        content = None
        if solutions:
            last = solutions[-1]
            content = last.get("content") if isinstance(last, dict) else None
        rows.append({"tickets_id": tid, "resposta_qualidade": solution_quality_score(content)})
    return pd.DataFrame(rows)


def normalize_categories(categories_raw: list[dict]) -> pd.DataFrame:
    """`categoria_completa` e o `completename` do GLPI ("Telefonia > Reparos")
    - mesmo campo que `entities.py` ja usa pra unidade (CommonTreeDropdown
    padrao do GLPI). Nome de folha sozinho e ambiguo (varias categorias-pai
    tem uma sub-categoria "Reparos"/"Outros"), completename desambigua."""
    rows = [
        {
            "itilcategories_id": c["id"],
            "categoria_nome": c.get("name") or "",
            "categoria_completa": c.get("completename") or c.get("name") or "",
        }
        for c in categories_raw
        if isinstance(c, dict) and "id" in c
    ]
    return pd.DataFrame(rows)
