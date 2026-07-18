"""Tecnico da equipe de TI - catalogo (nome/papel), espelhando dim_tecnico.parquet.

`papel` (coordenadora/tatico/plantonista) vem de pipeline/config/team_roles.yaml
- e reseedado a cada coleta, nunca editado direto no banco."""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
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
