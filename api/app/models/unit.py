"""Unidade hospitalar (HGVC, UPA, ...) - equivalente a Competition no
fifa_analytics, mas sem particionar dado em disco por unidade (ver
CLAUDE.md). Tecnicos podem ser lotados em uma unidade ou no complexo
inteiro; a visao GERAL combina todos os tecnicos ativos e `unidade` segue
como coluna filtravel nos parquets, nao como diretorio separado.

Seedada no startup a partir da descoberta dinamica de entidades GLPI
(pipeline/glpi/entities.py::discover_ti_entities) - nunca hardcoded aqui."""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class Unit(Base):
    __tablename__ = "units"

    slug: Mapped[str] = mapped_column(String, primary_key=True)  # ex.: hgvc, upa
    nome: Mapped[str] = mapped_column(String)
    entities_id: Mapped[int] = mapped_column(Integer)  # entities_id do GLPI (TI daquela unidade)
    completename: Mapped[str] = mapped_column(String)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    ordem: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
