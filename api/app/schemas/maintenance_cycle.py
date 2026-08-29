from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CycleStatus = Literal["planejamento", "encerrado"]


class CycleCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    data_inicio: date | None = None
    data_prevista_encerramento: date | None = None
    responsavel_id: int
    # intervalo padrão (meses) até a próxima preventiva, por prioridade
    intervalo_alta_meses: int = Field(default=3, ge=1, le=60)
    intervalo_normal_meses: int = Field(default=6, ge=1, le=60)
    intervalo_baixa_meses: int = Field(default=12, ge=1, le=60)

    @field_validator("nome")
    @classmethod
    def _clean_nome(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("nome não pode ficar vazio")
        return cleaned

    @field_validator("data_prevista_encerramento")
    @classmethod
    def _fim_depois_do_inicio(cls, value: date | None, info) -> date | None:
        inicio = info.data.get("data_inicio")
        if value is not None and inicio is not None and value < inicio:
            raise ValueError("a data final não pode ser anterior à data de início")
        return value


class PlanningChecklistMark(BaseModel):
    indice: int = Field(ge=0)
    ok: bool


class CycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    data_inicio: date | None
    data_prevista_encerramento: date | None
    responsavel_id: int
    status: CycleStatus
    intervalo_alta_meses: int
    intervalo_normal_meses: int
    intervalo_baixa_meses: int
    planejamento_itens: list[dict[str, Any]] | None
    criado_em: datetime


class CyclePage(BaseModel):
    items: list[CycleOut]
    page: int
    page_size: int
    total: int
    total_pages: int
