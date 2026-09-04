"""Sincronizacao de setores contra o GLPI - ver docs/requisitos.md Épico B.

"Setor" nao e o itemtype Location do GLPI (so 4 registros, um por hospital,
sem granularidade nenhuma) - e um `User` ficticio (ex. "hgvc-nutricao") no
grupo "Setores", categoria "Setor" (confirmado ao vivo contra a API real, ver
.claude/docs/standards/backend.md §9). Reaproveita CollectionRun (tipo=
"setores") e o padrao de lock/"busca tudo antes de escrever" de
collection_jobs.py - servico irmao, nao generalizado num so porque a logica
de busca/upsert e completamente diferente (GLPI User em vez de pipeline
completo de chamados)."""
from __future__ import annotations

from threading import Lock
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import SessionLocal
from api.app.models.collection_run import CollectionRun
from api.app.models.sector import Sector
from api.app.services.collection_jobs import (
    ACTIVE_COLLECTION_STATUSES,
    _duration,
    _mark_failed,
    prune_sync_runs,
    utc_now,
)
from ti_analytics.config import GlpiConfig, load_config
from ti_analytics.glpi.client import get_paginated, init_session, kill_session
from ti_analytics.glpi.entities import discover_group_id, discover_user_category_id

TIPO = "setores"
GRUPO_SETORES_NOME = "Setores"
CATEGORIA_SETOR_NOME = "Setor"


def _setores_config() -> dict:
    """`pipeline.yaml::setores` - nomes de grupo/categoria descobertos por
    nome (nunca id), + categorias extra de conta de departamento fora do
    grupo "Setores" (supervisores TI/ME/MP). Defaults = comportamento antigo
    se a chave não existir."""
    conf = load_config("pipeline.yaml").get("setores", {}) or {}
    return {
        "grupo": conf.get("grupo", GRUPO_SETORES_NOME),
        "categoria": conf.get("categoria", CATEGORIA_SETOR_NOME),
        "categorias_extra": list(conf.get("categorias_extra") or []),
        "unidade_extra": conf.get("unidade_extra", "geral"),
    }

_start_lock = Lock()
_execution_lock = Lock()


class SectorSyncAlreadyRunningError(RuntimeError):
    def __init__(self, run: CollectionRun):
        super().__init__("Ja existe uma sincronizacao de setores em andamento.")
        self.run = run


def create_sector_sync_run(db: Session, requested_by: str) -> CollectionRun:
    """Cria uma execucao em fila, rejeitando concorrencia so entre syncs de
    setor (tipo="setores") - uma coleta de chamados em andamento nao bloqueia
    isso, e vice-versa (locks/contagem independentes, ver tipo em
    CollectionRun)."""
    with _start_lock:
        active = db.scalar(
            select(CollectionRun)
            .where(CollectionRun.tipo == TIPO, CollectionRun.status.in_(ACTIVE_COLLECTION_STATUSES))
            .order_by(CollectionRun.requested_at.desc())
            .limit(1)
        )
        if active is not None:
            raise SectorSyncAlreadyRunningError(active)

        run = CollectionRun(
            id=str(uuid4()),
            tipo=TIPO,
            status="queued",
            requested_by=requested_by,
            requested_at=utc_now(),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run


def _fetch_sectors_from_glpi() -> list[dict]:
    """Busca a lista inteira antes de qualquer escrita local - se essa funcao
    levantar excecao, `sectors` fica intocado (requisito B1: "a ultima lista
    sincronizada com sucesso continua disponivel e o erro fica visivel")."""
    conf = _setores_config()
    cfg = GlpiConfig()
    session_token = init_session(cfg)
    try:
        group_id = discover_group_id(cfg, session_token, conf["grupo"])
        category_id = discover_user_category_id(cfg, session_token, conf["categoria"])
        extra_category_ids = {
            discover_user_category_id(cfg, session_token, nome)
            for nome in conf["categorias_extra"]
        }
        entities_by_id = {int(row["id"]): row for row in get_paginated(cfg, "/Entity", session_token)}
        members = get_paginated(cfg, f"/Group/{group_id}/User", session_token)
        # contas de departamento fora do grupo "Setores" (ex. supervisores de
        # manutencao) - scan completo de /User, barato nesta base (~170 contas).
        outros_users = (
            get_paginated(cfg, "/User", session_token) if extra_category_ids else []
        )
    finally:
        kill_session(cfg, session_token)

    sectors: list[dict] = []
    vistos: set[int] = set()

    def _nome(user: dict) -> str:
        # nome de exibicao e SEMPRE firstname, nunca `name` (login tecnico
        # tipo "hgvc-nutricao") - decisao explicita do requisito B1.
        return (user.get("firstname") or "").strip() or f"setor-{user['id']}"

    for user in members:
        # defensivo: o grupo "Setores" deveria conter so contas da categoria
        # "Setor", mas nao custa nada checar antes de tratar como setor.
        if int(user.get("usercategories_id") or 0) != category_id:
            continue
        entities_id = int(user.get("entities_id") or 0)
        entity = entities_by_id.get(entities_id)
        unidade_slug = (entity.get("name") or "").strip().casefold() if entity else str(entities_id)
        sectors.append({
            "id_glpi": int(user["id"]),
            "nome": _nome(user),
            "entities_id": entities_id,
            "unidade_slug": unidade_slug,
            "ativo": bool(int(user.get("is_active") or 0)),
        })
        vistos.add(int(user["id"]))

    # supervisores TI/ME/MP: categoria "Supervisor", fora do grupo "Setores",
    # entities_id na raiz - unidade fixa "geral" porque sao transversais.
    for user in outros_users:
        uid = int(user["id"])
        if uid in vistos or int(user.get("usercategories_id") or 0) not in extra_category_ids:
            continue
        sectors.append({
            "id_glpi": uid,
            "nome": _nome(user),
            "entities_id": int(user.get("entities_id") or 0),
            "unidade_slug": conf["unidade_extra"],
            "ativo": bool(int(user.get("is_active") or 0)),
        })
        vistos.add(uid)

    return sectors


def _upsert_sectors(db: Session, fetched: list[dict]) -> dict[str, int]:
    fetched_ids = {row["id_glpi"] for row in fetched}
    existing = {sector.id_glpi: sector for sector in db.scalars(select(Sector)).all()}

    created = updated = 0
    for row in fetched:
        sector = existing.get(row["id_glpi"])
        if sector is None:
            db.add(Sector(**row))
            created += 1
        else:
            sector.nome = row["nome"]
            sector.entities_id = row["entities_id"]
            sector.unidade_slug = row["unidade_slug"]
            sector.ativo = row["ativo"]
            updated += 1

    # nunca deletar - setor sumido do GLPI (ou is_active=0, ja coberto acima)
    # so fica inativo, preservando historico de PCs/ciclos que ja o referenciam.
    deactivated = 0
    for id_glpi, sector in existing.items():
        if id_glpi not in fetched_ids and sector.ativo:
            sector.ativo = False
            deactivated += 1

    return {
        "setores_criados": created,
        "setores_atualizados": updated,
        "setores_desativados": deactivated,
    }


def execute_sector_sync(run_id: str) -> None:
    """Executa em background - mesmo formato de execute_collection_run."""
    with _execution_lock:
        db = SessionLocal()
        try:
            run = db.get(CollectionRun, run_id)
            if run is None or run.status != "queued":
                return

            run.status = "running"
            run.started_at = utc_now()
            db.commit()

            try:
                fetched = _fetch_sectors_from_glpi()
                counts = _upsert_sectors(db, fetched)

                run = db.get(CollectionRun, run_id)
                if run is None:
                    return
                finished_at = utc_now()
                run.status = "success"
                run.finished_at = finished_at
                run.duration_seconds = _duration(run.started_at, finished_at)
                run.counts = counts
                run.error = None
                run.error_details = None
                db.commit()
                prune_sync_runs(db, TIPO)
            except Exception as exc:
                _mark_failed(db, run_id, exc)
        finally:
            db.close()
