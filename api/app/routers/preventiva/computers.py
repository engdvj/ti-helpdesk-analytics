from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.computer import Computer
from api.app.models.computer_hardware import ComputerHardware
from api.app.models.maintenance_cycle_item import MaintenanceCycleItem
from api.app.models.sector import Sector
from api.app.routers.auth import require_session
from api.app.routers.preventiva._shared import require_admin_session
from api.app.schemas.computer import (
    ComputerCreate,
    ComputerDetailOut,
    ComputerHardwareInput,
    ComputerHardwareOut,
    ComputerMove,
    ComputerOut,
    ComputerUpdate,
    ScoreComponenteOut,
)
from api.app.services.hardware_score import calcular_score

router = APIRouter(prefix="/preventiva", tags=["preventiva"])


class ComputerPage(BaseModel):
    items: list[ComputerOut]
    page: int
    page_size: int
    total: int
    total_pages: int


@router.post(
    "/computers",
    response_model=ComputerOut,
    status_code=201,
    dependencies=[Depends(require_admin_session)],
)
def create_computer(payload: ComputerCreate, db: Session = Depends(get_db)):
    if db.get(Sector, payload.setor_atual_id) is None:
        raise HTTPException(404, "setor nao encontrado")
    # patrimonio e opcional (existe PC sem etiqueta) - so checa duplicata
    # quando um valor de verdade foi informado; varios PCs sem patrimonio
    # nunca "colidem" entre si (NULL != NULL na constraint unique).
    if payload.patrimonio is not None:
        if db.scalar(select(Computer).where(Computer.patrimonio == payload.patrimonio)) is not None:
            raise HTTPException(409, f"ja existe um computador com o patrimonio '{payload.patrimonio}'")

    computer = Computer(
        patrimonio=payload.patrimonio,
        hostname=payload.hostname,
        setor_atual_id=payload.setor_atual_id,
        criado_em=datetime.now(timezone.utc),
    )
    db.add(computer)
    db.commit()
    db.refresh(computer)
    return computer


_SORT_COLUMNS = {
    "patrimonio": Computer.patrimonio,
    "hostname": Computer.hostname,
    "setor": Sector.nome,
    "criado_em": Computer.criado_em,
}

# próxima manutenção do PC = `proxima_preventiva` do item de ciclo mais recente
# dele que já a tem preenchida (só finalizados preenchem - ver
# services/ciclos.py::executar_item). Subquery escalar correlacionada: roda uma
# vez por linha da página (10-20), `computador_id` é indexado.
_PROXIMA_PREVENTIVA = (
    select(MaintenanceCycleItem.proxima_preventiva)
    .where(
        MaintenanceCycleItem.computador_id == Computer.id,
        MaintenanceCycleItem.proxima_preventiva.is_not(None),
    )
    .order_by(MaintenanceCycleItem.id.desc())
    .limit(1)
    .correlate(Computer)
    .scalar_subquery()
)


@router.get("/computers", response_model=ComputerPage, dependencies=[Depends(require_session)])
def list_computers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=200),
    setor_atual_id: int | None = Query(default=None),
    patrimonio: str | None = Query(default=None, description="busca parcial, case-insensitive"),
    incluir_inativos: bool = Query(default=False, description="inclui PCs desativados (baixados)"),
    sort: Literal["patrimonio", "hostname", "setor", "criado_em"] = "patrimonio",
    sort_dir: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
):
    filters = []
    if setor_atual_id is not None:
        filters.append(Computer.setor_atual_id == setor_atual_id)
    if patrimonio:
        filters.append(Computer.patrimonio.ilike(f"%{patrimonio.strip()}%"))
    if not incluir_inativos:
        filters.append(Computer.ativo.is_(True))

    count_query = select(func.count()).select_from(Computer)
    rows_query = (
        select(Computer, _PROXIMA_PREVENTIVA.label("proxima_preventiva"), ComputerHardware)
        .outerjoin(ComputerHardware, ComputerHardware.computer_id == Computer.id)
    )
    # ordenar por nome do setor exige o join; nos demais casos evita-se
    if sort == "setor":
        rows_query = rows_query.join(Sector, Sector.id_glpi == Computer.setor_atual_id)
    if filters:
        count_query = count_query.where(*filters)
        rows_query = rows_query.where(*filters)

    total = int(db.scalar(count_query) or 0)
    total_pages = max(1, (total + page_size - 1) // page_size)
    safe_page = min(page, total_pages)

    direction = asc if sort_dir == "asc" else desc
    order = [direction(_SORT_COLUMNS[sort])]
    if sort != "patrimonio":
        order.append(asc(Computer.patrimonio))  # desempate estável

    rows = db.execute(
        rows_query.order_by(*order).offset((safe_page - 1) * page_size).limit(page_size)
    ).all()
    items = []
    for computer, proxima, hardware in rows:
        resultado = calcular_score(hardware)
        update = {
            "proxima_preventiva": proxima,
            "hardware_score": resultado.score if resultado else None,
            "hardware_nivel": resultado.nivel if resultado else None,
            "hardware_detalhes": resultado.detalhes if resultado else None,
        }
        items.append(ComputerOut.model_validate(computer).model_copy(update=update))
    return {"items": items, "page": safe_page, "page_size": page_size, "total": total, "total_pages": total_pages}


def _montar_detalhe(db: Session, computer_id: int) -> ComputerDetailOut:
    row = db.execute(
        select(Computer, _PROXIMA_PREVENTIVA.label("proxima_preventiva"), ComputerHardware)
        .outerjoin(ComputerHardware, ComputerHardware.computer_id == Computer.id)
        .where(Computer.id == computer_id)
    ).first()
    if row is None:
        raise HTTPException(404, "computador nao encontrado")

    computer, proxima, hardware = row
    resultado = calcular_score(hardware)
    return ComputerDetailOut.model_validate(computer).model_copy(update={
        "proxima_preventiva": proxima,
        "hardware": ComputerHardwareOut.model_validate(hardware) if hardware is not None else None,
        "hardware_score": resultado.score if resultado else None,
        "hardware_nivel": resultado.nivel if resultado else None,
        "hardware_detalhes": resultado.detalhes if resultado else None,
        "score_componentes": (
            [
                ScoreComponenteOut(dimensao=c.dimensao, pontos=c.pontos, peso=c.peso, texto=c.texto)
                for c in resultado.componentes
            ]
            if resultado else None
        ),
    })


@router.get("/computers/{computer_id}", response_model=ComputerDetailOut, dependencies=[Depends(require_session)])
def get_computer(computer_id: int, db: Session = Depends(get_db)):
    """Detalhe de um PC - specs de hardware (GLPI Agent ou informadas à mão) +
    a quebra do score de saúde por dimensão (pra tela de detalhe)."""
    return _montar_detalhe(db, computer_id)


@router.put(
    "/computers/{computer_id}/hardware",
    response_model=ComputerDetailOut,
    dependencies=[Depends(require_admin_session)],
)
def set_computer_hardware(computer_id: int, payload: ComputerHardwareInput, db: Session = Depends(get_db)):
    """Preencher/atualizar o hardware à mão pra um PC que não roda o GLPI Agent
    - o score de saúde passa a ser calculado igual a um PC sincronizado.
    Bloqueado (422) pra PC vinculado ao GLPI: o hardware dele vem do agente e
    seria sobrescrito no próximo sync."""
    computer = db.get(Computer, computer_id)
    if computer is None:
        raise HTTPException(404, "computador nao encontrado")
    if computer.id_glpi_computer is not None:
        raise HTTPException(422, "o hardware deste PC vem do GLPI Agent - não pode ser editado à mão")

    hw = db.get(ComputerHardware, computer_id)
    dados = payload.model_dump()
    if hw is None:
        db.add(ComputerHardware(computer_id=computer_id, atualizado_em=datetime.now(timezone.utc), **dados))
    else:
        for campo, valor in dados.items():
            setattr(hw, campo, valor)
        hw.atualizado_em = datetime.now(timezone.utc)
    db.commit()
    return _montar_detalhe(db, computer_id)


@router.delete("/computers/{computer_id}/hardware", dependencies=[Depends(require_admin_session)])
def delete_computer_hardware(computer_id: int, db: Session = Depends(get_db)):
    """Apaga o hardware informado à mão (volta pra "sem dados", score None).
    Não faz nada pra PC do GLPI (o sync recria)."""
    computer = db.get(Computer, computer_id)
    if computer is None:
        raise HTTPException(404, "computador nao encontrado")
    if computer.id_glpi_computer is not None:
        raise HTTPException(422, "o hardware deste PC vem do GLPI Agent")
    hw = db.get(ComputerHardware, computer_id)
    if hw is not None:
        db.delete(hw)
        db.commit()
    return {"ok": True}


@router.patch("/computers/{computer_id}/move", response_model=ComputerOut, dependencies=[Depends(require_admin_session)])
def move_computer(computer_id: int, payload: ComputerMove, db: Session = Depends(get_db)):
    computer = db.get(Computer, computer_id)
    if computer is None:
        raise HTTPException(404, "computador nao encontrado")
    if db.get(Sector, payload.setor_atual_id) is None:
        raise HTTPException(404, "setor nao encontrado")

    computer.setor_atual_id = payload.setor_atual_id
    computer.setor_alterado_em = datetime.now(timezone.utc)
    db.commit()
    db.refresh(computer)
    return computer


@router.patch("/computers/{computer_id}", response_model=ComputerOut, dependencies=[Depends(require_admin_session)])
def update_computer(computer_id: int, payload: ComputerUpdate, db: Session = Depends(get_db)):
    """Editar computador: corrigir patrimonio/hostname, transferir de setor e
    dar baixa (ativo=false) num unico endpoint. Patrimonio digitado por humano
    pode precisar de correcao - por isso e coluna comum, nao PK (backend.md §3.2)."""
    computer = db.get(Computer, computer_id)
    if computer is None:
        raise HTTPException(404, "computador nao encontrado")

    data = payload.model_dump(exclude_unset=True)

    # "in data" (nao "is not None"): permite limpar patrimonio/setor mandando
    # `null` explicito no payload - so nao mexe quando a chave nem veio.
    if "patrimonio" in data:
        novo_patrimonio = data["patrimonio"]
        if novo_patrimonio is not None and novo_patrimonio != computer.patrimonio:
            duplicado = db.scalar(
                select(Computer).where(Computer.patrimonio == novo_patrimonio, Computer.id != computer_id)
            )
            if duplicado is not None:
                raise HTTPException(409, f"ja existe um computador com o patrimonio '{novo_patrimonio}'")
        computer.patrimonio = novo_patrimonio

    if "setor_atual_id" in data:
        novo_setor_id = data["setor_atual_id"]
        if novo_setor_id is not None:
            if db.get(Sector, novo_setor_id) is None:
                raise HTTPException(404, "setor nao encontrado")
        if novo_setor_id != computer.setor_atual_id:
            computer.setor_atual_id = novo_setor_id
            computer.setor_alterado_em = datetime.now(timezone.utc)

    if "hostname" in data:
        computer.hostname = data["hostname"]
    if "ativo" in data:
        computer.ativo = data["ativo"]

    db.commit()
    db.refresh(computer)
    return computer


@router.delete("/computers/{computer_id}", dependencies=[Depends(require_admin_session)])
def delete_computer(computer_id: int, db: Session = Depends(get_db)):
    """Hard delete de verdade - apaga o PC (e o hardware dele) da plataforma.
    Bloqueado (409) se o PC está em algum ciclo de preventiva: aí o certo é
    "desativar" (baixa), que preserva o histórico. Mesmo critério do delete de
    ciclo (`ciclos.excluir_ciclo`) e dos deletes em `competencies.py`."""
    computer = db.get(Computer, computer_id)
    if computer is None:
        raise HTTPException(404, "computador nao encontrado")

    em_ciclo = db.scalar(
        select(func.count())
        .select_from(MaintenanceCycleItem)
        .where(MaintenanceCycleItem.computador_id == computer_id)
    )
    if em_ciclo:
        raise HTTPException(
            409,
            "computador está em um ou mais ciclos de preventiva - desative (baixa) em vez de excluir",
        )

    hardware = db.get(ComputerHardware, computer_id)
    if hardware is not None:
        db.delete(hardware)
    db.delete(computer)
    db.commit()
    return {"ok": True}
