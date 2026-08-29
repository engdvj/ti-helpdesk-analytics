from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Prioridade = Literal["alta", "normal", "baixa"]
ItemStatusOut = Literal["planejado", "confirmado", "concluido", "remarcado", "pendente"]
Resultado = Literal["sem_achado", "ajuste_simples", "corretiva_aberta", "interrompido"]


class AddItemRequest(BaseModel):
    computador_id: int
    prioridade: Prioridade = "normal"
    # opcional: já deixa o técnico pré-atribuído (ainda precisa de Agendar
    # pra virar Confirmado, que exige data junto - ver confirmar_item).
    tecnico_id: int | None = None


class ScheduleRequest(BaseModel):
    data_agendada: date
    tecnico_id: int


class ReconfirmRequest(BaseModel):
    """Chave = label exato do item do Checklist 2 (ver
    services/ciclos.py::RECONFIRMACAO_CHECKLIST_ITEMS), valor = marcado OK."""
    marcas: dict[str, bool]


class ExecuteRequest(BaseModel):
    itens: dict[str, str]  # label -> "ok" | "na"
    observacoes: dict[str, str] = Field(default_factory=dict)
    resultado: Resultado | None = None
    resumo: str | None = None
    chamado_glpi: str | None = None
    pendencia_responsavel: str | None = None
    pendencia_prazo: date | None = None
    ponto_focal_nome: str | None = None
    ponto_focal_data: date | None = None
    proxima_preventiva: date | None = None
    rascunho: bool = False

    @field_validator("itens")
    @classmethod
    def _valid_marks(cls, value: dict[str, str]) -> dict[str, str]:
        invalid = {v for v in value.values() if v not in ("ok", "na")}
        if invalid:
            raise ValueError(f"valores inválidos em itens (só 'ok'/'na'): {invalid}")
        return value


class RescheduleRequest(BaseModel):
    motivo: str = Field(min_length=1, max_length=500)
    nova_data: date | None = None

    @field_validator("motivo")
    @classmethod
    def _clean_motivo(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("motivo não pode ficar vazio")
        return cleaned


class CycleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ciclo_id: int
    computador_id: int
    tecnico_id: int | None
    prioridade: Prioridade
    status: ItemStatusOut
    data_agendada: date | None
    reconfirmacao_itens: list[dict[str, Any]] | None
    execucao_itens: list[dict[str, Any]] | None
    execucao_status: str | None
    resultado: Resultado | None
    resumo: str | None
    chamado_glpi: str | None
    pendencia_responsavel: str | None
    pendencia_prazo: date | None
    ponto_focal_nome: str | None
    ponto_focal_data: date | None
    proxima_preventiva: date | None
    motivo_remarcacao: str | None
    criado_em: datetime
