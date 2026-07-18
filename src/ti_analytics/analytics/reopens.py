"""Deteccao de reabertura de chamado via changelog do GLPI.

O GLPI nao expoe um campo pronto "foi reaberto". O que existe e o changelog
completo em /Ticket/{id}/Log, onde cada mudanca de campo vira uma linha com
`id_search_option` (o id do campo, igual ao mapa devolvido por
/listSearchOptions/Ticket) e `old_value`/`new_value`. `id_search_option == 12`
e sempre "Status" nesta instancia do GLPI (confirmado via /listSearchOptions).

Reabertura = depois do status ja ter alcancado >=5 (Solucionado/Fechado) em
algum ponto da linha do tempo, ele volta a um valor <5 (Novo/Processando/
Pendente) mais tarde. Puramente funcional - sem rede aqui, so interpreta o
log ja coletado.
"""
from __future__ import annotations

STATUS_SEARCH_OPTION_ID = 12
SOLVED_THRESHOLD = 5


def detect_reopened(log_entries: list[dict]) -> bool:
    status_changes = sorted(
        (e for e in log_entries if e.get("id_search_option") == STATUS_SEARCH_OPTION_ID),
        key=lambda e: e.get("date_mod") or "",
    )
    reached_solved = False
    for entry in status_changes:
        try:
            new_value = int(entry.get("new_value"))
        except (TypeError, ValueError):
            continue
        if reached_solved and new_value < SOLVED_THRESHOLD:
            return True
        if new_value >= SOLVED_THRESHOLD:
            reached_solved = True
    return False
