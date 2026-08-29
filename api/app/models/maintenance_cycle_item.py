"""Item (computador) de um ciclo de manutencao preventiva - state machine
completa mora em services/ciclos.py, nunca aqui (models sao burros, ver
.claude/docs/standards/backend.md §2.1). Checklists de reconfirmacao (C2b, 6
itens) e execucao (C3, 10 itens) sao colunas JSON - 1:1 mutavel ate
finalizar, nao historico append-only (ver backend.md §2.3)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class MaintenanceCycleItem(Base):
    __tablename__ = "maintenance_cycle_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ciclo_id: Mapped[int] = mapped_column(Integer, ForeignKey("maintenance_cycles.id"), index=True)
    computador_id: Mapped[int] = mapped_column(Integer, ForeignKey("computers.id"), index=True)
    tecnico_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("technicians.users_id"), nullable=True
    )  # nasce Planejado sem tecnico - obrigatorio so ao confirmar (C2)
    prioridade: Mapped[str] = mapped_column(String(10), default="normal", server_default="normal")
    status: Mapped[str] = mapped_column(String(20), index=True, default="planejado", server_default="planejado")
    data_agendada: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Checklist 2 (C2b, reconfirmacao na vespera) - [{"item": str, "ok": bool}]
    reconfirmacao_itens: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)

    # Checklist 3 (C3, execucao) - [{"item": str, "status": "ok"|"na", "observacao": str}]
    execucao_itens: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    execucao_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "rascunho" | "finalizado"
    resultado: Mapped[str | None] = mapped_column(String(20), nullable=True)
    resumo: Mapped[str | None] = mapped_column(Text, nullable=True)
    chamado_glpi: Mapped[str | None] = mapped_column(String(40), nullable=True)
    pendencia_responsavel: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pendencia_prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    ponto_focal_nome: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ponto_focal_data: Mapped[date | None] = mapped_column(Date, nullable=True)
    proxima_preventiva: Mapped[date | None] = mapped_column(Date, nullable=True)

    motivo_remarcacao: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
