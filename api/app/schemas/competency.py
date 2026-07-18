from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


CompetencyActivityType = str
CompetencyFieldType = Literal["escala", "radio", "selecao", "multipla_selecao", "sim_nao"]
CompetencyContentFieldType = Literal["texto_curto", "texto_longo", "radio", "selecao", "multipla_selecao"]


class CompetencyContentOption(BaseModel):
    valor: str = Field(min_length=1, max_length=80)
    rotulo: str = Field(min_length=1, max_length=160)


def _validate_content_field(
    field_type: CompetencyContentFieldType,
    options: list[CompetencyContentOption],
    value: str | list[str] | None,
) -> None:
    option_types = {"radio", "selecao", "multipla_selecao"}
    if field_type in option_types and len(options) < 2:
        raise ValueError("Campos de escolha precisam de pelo menos duas opções.")
    if len({option.valor for option in options}) != len(options):
        raise ValueError("Os valores das opções de conteúdo não podem se repetir.")
    if value is None:
        return
    if field_type in {"texto_curto", "texto_longo"} and not isinstance(value, str):
        raise ValueError("Campos de texto aceitam um valor textual.")
    allowed = {option.valor for option in options}
    if field_type in {"radio", "selecao"} and (not isinstance(value, str) or value not in allowed):
        raise ValueError("Selecione uma opção de conteúdo válida.")
    if field_type == "multipla_selecao" and (
        not isinstance(value, list)
        or not all(isinstance(item, str) for item in value)
        or not set(value).issubset(allowed)
    ):
        raise ValueError("A seleção de conteúdo contém opções inválidas.")


class CompetencyActivityTypeCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=60, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    descricao: str = Field(default="", max_length=1000)
    cor: str = Field(default="#58a6ff", pattern=r"^#[0-9a-fA-F]{6}$")
    ordem: int = 0


class CompetencyActivityTypeUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=120)
    descricao: str | None = Field(default=None, max_length=1000)
    cor: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ordem: int | None = None
    ativa: bool | None = None


class CompetencyActivityTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    nome: str
    descricao: str
    cor: str
    ordem: int
    ativa: bool


class CompetencyOption(BaseModel):
    valor: str = Field(min_length=1, max_length=80)
    rotulo: str = Field(min_length=1, max_length=160)
    pontos: float = Field(ge=0, le=1000)


class CompetencyActivityCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=180)
    descricao: str = Field(default="", max_length=4000)
    tipo: str = Field(default="operacional", min_length=2, max_length=60)
    escopo_tipo_campo: CompetencyContentFieldType = "texto_longo"
    escopo_opcoes: list[CompetencyContentOption] = Field(default_factory=list, max_length=30)
    escopo_valor: str | list[str] | None = None
    ordem: int = 0

    @model_validator(mode="after")
    def validate_scope(self):
        _validate_content_field(self.escopo_tipo_campo, self.escopo_opcoes, self.escopo_valor)
        return self


class CompetencyActivityUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=180)
    descricao: str | None = Field(default=None, max_length=4000)
    tipo: str | None = Field(default=None, min_length=2, max_length=60)
    escopo_tipo_campo: CompetencyContentFieldType | None = None
    escopo_opcoes: list[CompetencyContentOption] | None = Field(default=None, max_length=30)
    escopo_valor: str | list[str] | None = None
    ordem: int | None = None
    ativa: bool | None = None


class CompetencySituationCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=220)
    contexto: str = Field(default="", max_length=6000)
    procedimento_esperado: str = Field(min_length=2, max_length=12000)
    procedimento_tipo_campo: CompetencyContentFieldType = "texto_longo"
    procedimento_opcoes: list[CompetencyContentOption] = Field(default_factory=list, max_length=30)
    procedimento_valor: str | list[str] | None = None
    pontos_maximos: float = Field(default=1.0, gt=0, le=1000)
    tipo_campo: CompetencyFieldType = "escala"
    opcoes: list[CompetencyOption] = Field(default_factory=list, max_length=30)
    ordem: int = 0

    @model_validator(mode="after")
    def validate_options(self):
        _validate_content_field(
            self.procedimento_tipo_campo,
            self.procedimento_opcoes,
            self.procedimento_valor,
        )
        if self.tipo_campo in {"radio", "selecao", "multipla_selecao"} and len(self.opcoes) < 2:
            raise ValueError("Esse tipo de campo precisa de pelo menos duas opções.")
        if len({option.valor for option in self.opcoes}) != len(self.opcoes):
            raise ValueError("Os valores das opções não podem se repetir.")
        if any(option.pontos > self.pontos_maximos for option in self.opcoes):
            raise ValueError("Uma opção não pode valer mais que a pontuação máxima da situação.")
        return self


class CompetencySituationUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=220)
    contexto: str | None = Field(default=None, max_length=6000)
    procedimento_esperado: str | None = Field(default=None, min_length=2, max_length=12000)
    procedimento_tipo_campo: CompetencyContentFieldType | None = None
    procedimento_opcoes: list[CompetencyContentOption] | None = Field(default=None, max_length=30)
    procedimento_valor: str | list[str] | None = None
    pontos_maximos: float | None = Field(default=None, gt=0, le=1000)
    tipo_campo: CompetencyFieldType | None = None
    opcoes: list[CompetencyOption] | None = Field(default=None, max_length=30)
    ordem: int | None = None
    ativa: bool | None = None


class CompetencySituationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    atividade_id: int
    nome: str
    contexto: str
    procedimento_esperado: str
    procedimento_tipo_campo: CompetencyContentFieldType
    procedimento_opcoes: list[CompetencyContentOption]
    procedimento_valor: str | list[str] | None
    pontos_maximos: float
    tipo_campo: CompetencyFieldType
    opcoes: list[CompetencyOption]
    ordem: int
    ativa: bool


class CompetencyActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    descricao: str
    tipo: CompetencyActivityType
    escopo_tipo_campo: CompetencyContentFieldType
    escopo_opcoes: list[CompetencyContentOption]
    escopo_valor: str | list[str] | None
    ordem: int
    ativa: bool
    situacoes: list[CompetencySituationOut]


class CompetencyAssessmentCreate(BaseModel):
    users_id: int
    situacao_id: int
    pontos: float | None = Field(default=None, ge=0)
    resposta: str | list[str] | bool | None = None
    evidencia: str | None = Field(default=None, max_length=8000)
    observacao: str | None = Field(default=None, max_length=8000)


class CompetencyAssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    users_id: int
    situacao_id: int
    pontos: float
    resposta: str | list[str] | bool | None
    evidencia: str | None
    observacao: str | None
    avaliado_por: str
    avaliado_em: datetime


class CompetencySituationProgress(BaseModel):
    id: int
    nome: str
    contexto: str
    procedimento_esperado: str
    procedimento_tipo_campo: CompetencyContentFieldType
    procedimento_opcoes: list[CompetencyContentOption]
    procedimento_valor: str | list[str] | None
    pontos_maximos: float
    tipo_campo: CompetencyFieldType
    opcoes: list[CompetencyOption]
    pontos: float
    avaliada: bool
    ultima_avaliacao: CompetencyAssessmentOut | None


class CompetencyActivityProgress(BaseModel):
    id: int
    nome: str
    descricao: str
    escopo_tipo_campo: CompetencyContentFieldType
    escopo_opcoes: list[CompetencyContentOption]
    escopo_valor: str | list[str] | None
    pontos: float
    pontos_maximos: float
    percentual: float
    situacoes_avaliadas: int
    situacoes_total: int
    situacoes: list[CompetencySituationProgress]


class CompetencyTechnicianSummary(BaseModel):
    users_id: int
    nome: str
    username: str
    papel: str
    unidade_slug: str | None
    foto: str | None
    pontos: float
    pontos_maximos: float
    percentual: float
    situacoes_avaliadas: int
    situacoes_total: int
    nivel: str


class CompetencyTechnicianDetail(CompetencyTechnicianSummary):
    atividades: list[CompetencyActivityProgress]
