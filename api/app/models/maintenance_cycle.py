"""Ciclo de manutencao preventiva (docs/requisitos.md Épico C). Status e
binario ("planejamento"/"encerrado") - os 5 estados detalhados
(Planejado/Confirmado/.../Pendente) sao todos do item, nunca do ciclo. Ver
.claude/docs/standards/backend.md §2.2."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class MaintenanceCycle(Base):
    __tablename__ = "maintenance_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String)
    data_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_prevista_encerramento: Mapped[date | None] = mapped_column(Date, nullable=True)
    responsavel_id: Mapped[int] = mapped_column(Integer, ForeignKey("technicians.users_id"))
    status: Mapped[str] = mapped_column(String(20), index=True, default="planejamento", server_default="planejamento")
    # Intervalo padrao (meses) ate a proxima preventiva, por prioridade do
    # item - o admin ajusta ao criar o ciclo. executar_item() usa isto pra
    # calcular MaintenanceCycleItem.proxima_preventiva automaticamente
    # (data agendada + N meses), em vez de o tecnico digitar a data.
    intervalo_alta_meses: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    intervalo_normal_meses: Mapped[int] = mapped_column(Integer, default=6, server_default="6")
    intervalo_baixa_meses: Mapped[int] = mapped_column(Integer, default=12, server_default="12")
    # Checklist 1 do PDF (planejamento) - lista de {"item": str, "ok": bool,
    # "marcado_por": str|None, "marcado_em": str|None (ISO)}, inicializada em
    # criar_ciclo() com PLANEJAMENTO_CHECKLIST_ITEMS. Nao bloqueia nenhuma
    # transicao (diferente do checklist de reconfirmacao no item) - e so
    # registro, o requisito nao pede gate nenhum sobre ele.
    planejamento_itens: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
