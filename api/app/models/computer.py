"""Computador do inventario (docs/requisitos.md Épico A). PK e serial, nao o
patrimonio - diferente de Sector, patrimonio e digitado por humano no
cadastro (A1) e pode precisar correcao; se fosse PK e ja tivesse virado FK em
item de ciclo, corrigir um digito viraria migracao de PK em cascata. Ver
.claude/docs/standards/backend.md §3.2."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class Computer(Base):
    __tablename__ = "computers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # nullable: patrimonio e uma etiqueta externa (setor de patrimonio do
    # hospital), nao um dado do proprio PC - existe equipamento sem ela
    # (nunca etiquetado), tanto cadastrado a mao quanto importado do GLPI.
    patrimonio: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    hostname: Mapped[str | None] = mapped_column(String, default=None, nullable=True)
    # nullable: um PC importado do GLPI (id_glpi_computer) pode chegar sem
    # "Usuário" resolvível pra um Setor conhecido - cadastro manual (A1)
    # continua exigindo setor no schema/router, so o valor da coluna afrouxou.
    setor_atual_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sectors.id_glpi"), nullable=True, index=True)
    setor_alterado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # soft-delete (baixa/descarte) - nunca deletado, preserva histórico de
    # preventiva do PC (mesmo padrão de Sector.ativo / Technician.ativo)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", index=True)
    # link pro Computer do GLPI (agent) - NULL = PC 100% manual (fluxo A1
    # intocado). Preenchido = criado/atualizado por services/computer_sync.py.
    # Setor e patrimonio continuam editáveis por cima mesmo quando linkado
    # (ver services/computer_sync.py: sync nunca zera setor já atribuído).
    id_glpi_computer: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True, index=True)
