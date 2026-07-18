"""Tecnico da equipe de TI - catalogo (nome/papel), espelhando dim_tecnico.parquet.

`papel` (coordenadora/tatico/plantonista) vem de pipeline/config/team_roles.yaml.
O painel /admin atualiza banco e YAML juntos: a mudanca vale imediatamente e
tambem sobrevive a proxima coleta (ver glpi/team_roles_config.py).

`ativo`/`unidade_slug`/`foto`/`foto_fonte`/`nome_exibicao` sao o oposto:
colunas que o seed NUNCA toca em tecnicos existentes, entao sobrevivem a
coleta sem round-trip por YAML. `foto_fonte` distingue
"glpi" (preenchido automatico na coleta, ver sync_technician_photos) de
"upload" (definido pelo admin - nunca sobrescrito automaticamente)."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class Technician(Base):
    __tablename__ = "technicians"

    users_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String)
    nome_completo: Mapped[str] = mapped_column(String)
    glpi_profile: Mapped[str] = mapped_column(String, default="")
    papel: Mapped[str] = mapped_column(String)  # coordenadora | tatico | plantonista
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    unidade_slug: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("units.slug"),
        default=None,
        nullable=True,
    )  # None = atua em todo o complexo
    foto: Mapped[str | None] = mapped_column(Text, default=None)  # data URI (base64)
    foto_fonte: Mapped[str | None] = mapped_column(String, default=None)  # "glpi" | "upload"
    nome_exibicao: Mapped[str | None] = mapped_column(String, default=None)
