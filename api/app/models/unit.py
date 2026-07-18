"""Unidade hospitalar (HGVC, UPA, ...) - equivalente a Competition no
fifa_analytics, mas sem particionar dado em disco por unidade (ver
CLAUDE.md): a mesma equipe de tecnicos atende todas as unidades ao mesmo
tempo, entao a visao primaria e o ranking GERAL combinado, com `unidade`
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
