"""Setor do hospital, sincronizado do GLPI (usuarios fictícios no grupo
"Setores", categoria "Setor" - ver services/setor_sync.py e docs/requisitos.md
Épico B). PK e o id do GLPI direto (mesmo padrao de Technician.users_id):
controlado por sistema externo, a plataforma nunca cria/edita esse usuario."""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class Sector(Base):
    __tablename__ = "sectors"

    id_glpi: Mapped[int] = mapped_column(Integer, primary_key=True)
    nome: Mapped[str] = mapped_column(String)  # `firstname` do User GLPI - nunca o `name`/login
    entities_id: Mapped[int] = mapped_column(Integer, index=True)
    unidade_slug: Mapped[str] = mapped_column(String, index=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
