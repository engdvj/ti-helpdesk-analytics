"""Orquestracao completa: GLPI -> raw -> silver -> gold -> analytics.

Ponto de entrada unico, mesma forma do fifa_analytics/fifa/pipeline.py::run().
Coleta full a cada rodada (sem incremental por enquanto - v1 e coleta manual,
~430 chamados de TI hoje; revisitar se o volume crescer o bastante pra doer).
"""
from __future__ import annotations

from ti_analytics.analytics import pivot, snapshot
from ti_analytics.analytics.reopens import detect_reopened
from ti_analytics.config import GlpiConfig, load_config
from ti_analytics.glpi.client import api_request, get_paginated, init_session, kill_session
from ti_analytics.glpi.entities import discover_group_id, discover_ti_entities
from ti_analytics.glpi.transforms import (
    normalize_categories,
    normalize_reopened_flags,
    normalize_technicians,
    normalize_ticket_bridge,
    normalize_tickets,
)
from ti_analytics.paths import GOLD_DIR, RAW_DIR, SILVER_DIR
from ti_analytics.utils.gold_guard import prune_unknown_gold
from ti_analytics.utils.io import write_dataframe, write_json
from ti_analytics.utils.logging import get_logger
from ti_analytics.utils.time import utc_timestamp_compact

logger = get_logger(__name__)


def _raw_path(endpoint: str, ts: str, suffix: str = "") -> "object":
    from pathlib import Path

    date = ts[:8]
    name = f"{suffix}.json" if suffix else "data.json"
    return Path(RAW_DIR) / "glpi" / endpoint / f"date={date}" / f"collected_at={ts}" / name


def _fetch_technicians(cfg: GlpiConfig, session: str, group_id: int, ts: str) -> list[dict]:
    members = get_paginated(cfg, f"/Group/{group_id}/Group_User", session)
    write_json(_raw_path("group_user", ts), members)

    raw_members = []
    for member in members:
        uid = member.get("users_id")
        if not uid:
            continue
        user = api_request(cfg, f"/User/{uid}", session)
        profiles = api_request(cfg, f"/User/{uid}/Profile", session)
        glpi_profile = ""
        if isinstance(profiles, list) and profiles:
            first = profiles[0]
            glpi_profile = first.get("name", "") if isinstance(first, dict) else ""
        raw_members.append({
            "users_id": uid,
            "username": user.get("name") if isinstance(user, dict) else None,
            "firstname": user.get("firstname") if isinstance(user, dict) else None,
            "realname": user.get("realname") if isinstance(user, dict) else None,
            "glpi_profile": glpi_profile,
        })
    write_json(_raw_path("user_detail", ts), raw_members)
    return raw_members


def _fetch_ti_tickets(cfg: GlpiConfig, session: str, ti_entity_ids: set[int], ts: str) -> list[dict]:
    all_tickets = get_paginated(cfg, "/Ticket?order=DESC", session)
    write_json(_raw_path("ticket", ts), {"count": len(all_tickets)})  # payload cru completo pode ser grande demais pra log; guarda so a contagem aqui
    ti_tickets = [t for t in all_tickets if t.get("entities_id") in ti_entity_ids]
    write_json(_raw_path("ticket_ti_filtrado", ts), ti_tickets)
    return ti_tickets


def _fetch_ticket_details(
    cfg: GlpiConfig, session: str, ticket_ids: list[int], ts: str
) -> tuple[dict[int, list[dict]], dict[int, list[dict]]]:
    """Para cada chamado de TI: Ticket_User (tecnicos atribuidos) e Log
    (changelog, usado pra detectar reabertura). Duas chamadas por chamado -
    unico jeito de conseguir isso, o GLPI nao devolve isso na listagem."""
    ticket_user_map: dict[int, list[dict]] = {}
    ticket_log_map: dict[int, list[dict]] = {}
    for tid in ticket_ids:
        tu = api_request(cfg, f"/Ticket/{tid}/Ticket_User", session)
        ticket_user_map[tid] = tu if isinstance(tu, list) else []
        log = api_request(cfg, f"/Ticket/{tid}/Log", session)
        ticket_log_map[tid] = log if isinstance(log, list) else []
    write_json(_raw_path("ticket_user", ts), {str(k): v for k, v in ticket_user_map.items()})
    write_json(_raw_path("ticket_log", ts), {str(k): v for k, v in ticket_log_map.items()})
    return ticket_user_map, ticket_log_map


def run() -> dict[str, int]:
    cfg = GlpiConfig()
    pipeline_cfg = load_config("pipeline.yaml")
    team_roles = load_config("team_roles.yaml")
    ts = utc_timestamp_compact()

    session = init_session(cfg)
    counts: dict[str, int] = {}
    try:
        entities_raw = get_paginated(cfg, "/Entity", session)
        write_json(_raw_path("entity", ts), entities_raw)
        ti_entities = discover_ti_entities(cfg, session)
        counts["unidades_ti"] = len(ti_entities)
        ti_entity_ids = set(ti_entities["entities_id"].tolist())
        logger.info("Unidades de TI detectadas: %s", ti_entities["unidade_pai"].tolist())
        write_dataframe(GOLD_DIR / "dim_unidade.parquet", ti_entities)

        group_id = discover_group_id(cfg, session, pipeline_cfg["grupo_ti"]["nome"])
        raw_members = _fetch_technicians(cfg, session, group_id, ts)
        dim_tecnico = normalize_technicians(raw_members, team_roles)
        counts["tecnicos"] = len(dim_tecnico)
        for base in (SILVER_DIR, GOLD_DIR):
            write_dataframe(base / "dim_tecnico.parquet", dim_tecnico)

        ti_tickets_raw = _fetch_ti_tickets(cfg, session, ti_entity_ids, ts)
        counts["chamados_ti"] = len(ti_tickets_raw)
        ticket_ids = [t["id"] for t in ti_tickets_raw]

        ticket_user_map, ticket_log_map = _fetch_ticket_details(cfg, session, ticket_ids, ts)

        tickets_df = normalize_tickets(ti_tickets_raw, ti_entity_ids)
        reopened_df = normalize_reopened_flags(ticket_log_map)
        if not reopened_df.empty:
            tickets_df = tickets_df.merge(reopened_df, on="tickets_id", how="left")
        tickets_df["foi_reaberto"] = tickets_df.get("foi_reaberto", False).fillna(False)
        counts["chamados_reabertos"] = int(tickets_df["foi_reaberto"].sum())
        for base in (SILVER_DIR, GOLD_DIR):
            write_dataframe(base / "fact_chamado.parquet", tickets_df)

        bridge_df = normalize_ticket_bridge(ticket_user_map)
        counts["atribuicoes"] = len(bridge_df)
        for base in (SILVER_DIR, GOLD_DIR):
            write_dataframe(base / "bridge_chamado_tecnico.parquet", bridge_df)

        categories_raw = get_paginated(cfg, "/ITILCategory", session)
        categories_df = normalize_categories(categories_raw)
        write_dataframe(SILVER_DIR / "dim_categoria.parquet", categories_df)

        wide = pivot.build_wide_chamado_tecnico(tickets_df, bridge_df, dim_tecnico)
        write_dataframe(GOLD_DIR / "analytics" / "wide_chamado_tecnico.parquet", wide)

        timeline = snapshot.build_all_snapshots(wide, dim_tecnico)
        write_dataframe(GOLD_DIR / "analytics" / "snapshot_timeline.parquet", timeline)

        prune_unknown_gold()
    finally:
        kill_session(cfg, session)

    logger.info("Coleta concluida: %s", counts)
    return counts
