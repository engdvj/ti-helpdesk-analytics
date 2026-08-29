from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ComputerCreate(BaseModel):
    # opcional: patrimonio e etiqueta externa (setor de patrimonio do
    # hospital) - existe PC sem ela, nunca etiquetado.
    patrimonio: str | None = Field(default=None, max_length=60)
    hostname: str | None = Field(default=None, max_length=120)
    setor_atual_id: int

    @field_validator("patrimonio")
    @classmethod
    def _clean_patrimonio(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("hostname")
    @classmethod
    def _clean_hostname(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class ComputerMove(BaseModel):
    setor_atual_id: int


class ComputerUpdate(BaseModel):
    """Update parcial (mesmo molde de ChecklistItemUpdate) - so os campos
    presentes no payload sao alterados (`exclude_unset` no router), inclusive
    pra limpar patrimonio/setor mandando `null` explicito. `patrimonio`
    duplicado e "setor nao existe" sao regra de negocio, checadas no router
    (precisam da Session), nao aqui."""

    patrimonio: str | None = Field(default=None, max_length=60)
    hostname: str | None = Field(default=None, max_length=120)
    setor_atual_id: int | None = None
    ativo: bool | None = None

    @field_validator("patrimonio")
    @classmethod
    def _clean_patrimonio(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("hostname")
    @classmethod
    def _clean_hostname(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class ComputerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patrimonio: str | None
    hostname: str | None
    setor_atual_id: int | None
    setor_alterado_em: datetime | None
    criado_em: datetime
    ativo: bool
    # próxima manutenção prevista - derivada em list_computers do item de ciclo
    # mais recente do PC (não é coluna de `computers`). Fica None nas respostas
    # de mutação (create/move/update), que não computam isso.
    proxima_preventiva: date | None = None
    # link pro Computer do GLPI (agent), quando o PC foi importado via
    # services/computer_sync.py - None = cadastro 100% manual.
    id_glpi_computer: int | None = None
    # score de saude do equipamento (0-100, maior = melhor) - derivado em
    # list_computers/get_computer via services/hardware_score.py a partir do
    # snapshot em ComputerHardware. None = PC nunca sincronizado com o GLPI
    # (nunca inventa nota pra cadastro 100% manual).
    hardware_score: int | None = None
    hardware_nivel: str | None = None
    hardware_detalhes: list[str] | None = None


class ComputerHardwareOut(BaseModel):
    """Snapshot de hardware do GLPI Agent (ver models/computer_hardware.py)."""

    model_config = ConfigDict(from_attributes=True)

    ram_mb: int | None
    disco_tipo: str | None
    disco_total_mb: int | None
    disco_livre_mb: int | None
    so_nome: str | None
    so_instalado_em: date | None
    cpu_designacao: str | None
    gpu_designacao: str | None
    gpu_memoria_mb: int | None
    atualizado_em: datetime


class ComputerHardwareInput(BaseModel):
    """Preenchimento manual do hardware (PC que não roda o GLPI Agent) - todos
    opcionais, o score usa o que tiver e trata o resto como "desconhecido".
    Só permitido em PC não vinculado ao GLPI (checado no router)."""

    ram_mb: int | None = Field(default=None, ge=0)
    disco_tipo: str | None = Field(default=None, max_length=20)
    disco_total_mb: int | None = Field(default=None, ge=0)
    disco_livre_mb: int | None = Field(default=None, ge=0)
    so_nome: str | None = Field(default=None, max_length=120)
    so_instalado_em: date | None = None
    cpu_designacao: str | None = Field(default=None, max_length=160)
    gpu_designacao: str | None = Field(default=None, max_length=160)
    gpu_memoria_mb: int | None = Field(default=None, ge=0)

    @field_validator("disco_tipo", "so_nome", "cpu_designacao", "gpu_designacao")
    @classmethod
    def _limpa(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class ScoreComponenteOut(BaseModel):
    """Uma dimensão do score de saúde (RAM, disco, SO...) - `pontos`/`peso`
    dão a barra proporcional na tela de detalhe."""

    dimensao: str
    pontos: int
    peso: int
    texto: str


class ComputerDetailOut(ComputerOut):
    """GET /preventiva/computers/{id} - tudo de ComputerOut + o hardware bruto
    e a quebra do score por dimensão (a lista já vem em ComputerOut como
    `hardware_detalhes`, aqui vem estruturada)."""

    hardware: ComputerHardwareOut | None = None
    score_componentes: list[ScoreComponenteOut] | None = None
