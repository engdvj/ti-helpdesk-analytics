from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ChecklistTipo = Literal["planejamento", "reconfirmacao", "execucao"]


class ChecklistItemCreate(BaseModel):
    tipo: ChecklistTipo
    texto: str = Field(min_length=1, max_length=500)
    secao: str | None = Field(default=None, max_length=120)
    ordem: int = 0

    @field_validator("texto")
    @classmethod
    def _clean_texto(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("texto não pode ficar vazio")
        return cleaned

    @field_validator("secao")
    @classmethod
    def _clean_secao(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class ChecklistItemUpdate(BaseModel):
    texto: str | None = Field(default=None, min_length=1, max_length=500)
    secao: str | None = Field(default=None, max_length=120)
    ordem: int | None = None
    ativo: bool | None = None

    @field_validator("texto")
    @classmethod
    def _clean_texto(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("texto não pode ficar vazio")
        return cleaned

    @field_validator("secao")
    @classmethod
    def _clean_secao(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class ChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tipo: ChecklistTipo
    texto: str
    secao: str | None
    ordem: int
    ativo: bool
