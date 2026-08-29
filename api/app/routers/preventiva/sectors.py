from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.computer import Computer
from api.app.models.sector import Sector
from api.app.routers.auth import require_session
from api.app.schemas.sector import SectorOut

router = APIRouter(prefix="/preventiva", tags=["preventiva"])

# contagem de PCs por setor = só os ativos (um PC baixado não conta pra
# dimensionar ciclo - requisito A2). O predicado do ativo mora no ON do
# outerjoin pra o setor sem nenhum PC ativo continuar aparecendo com 0.
_ativos_no_setor = and_(Computer.setor_atual_id == Sector.id_glpi, Computer.ativo.is_(True))


@router.get("/sectors", response_model=list[SectorOut], dependencies=[Depends(require_session)])
def list_sectors(
    ativo: bool | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Contagem de PCs por setor numa unica query agregada (requisito A2) -
    nunca um count() por setor num loop."""
    query = (
        select(Sector, func.count(Computer.id))
        .outerjoin(Computer, _ativos_no_setor)
        .group_by(Sector.id_glpi)
        .order_by(Sector.unidade_slug, Sector.nome)
    )
    if ativo is not None:
        query = query.where(Sector.ativo == ativo)

    return [
        SectorOut(
            id_glpi=sector.id_glpi,
            nome=sector.nome,
            entities_id=sector.entities_id,
            unidade_slug=sector.unidade_slug,
            ativo=sector.ativo,
            qtd_computadores=count,
        )
        for sector, count in db.execute(query).all()
    ]


@router.get("/sectors/{id_glpi}", response_model=SectorOut, dependencies=[Depends(require_session)])
def get_sector(id_glpi: int, db: Session = Depends(get_db)):
    row = db.execute(
        select(Sector, func.count(Computer.id))
        .outerjoin(Computer, _ativos_no_setor)
        .where(Sector.id_glpi == id_glpi)
        .group_by(Sector.id_glpi)
    ).first()
    if row is None:
        raise HTTPException(404, "setor nao encontrado")
    sector, count = row
    return SectorOut(
        id_glpi=sector.id_glpi,
        nome=sector.nome,
        entities_id=sector.entities_id,
        unidade_slug=sector.unidade_slug,
        ativo=sector.ativo,
        qtd_computadores=count,
    )
