"""Catálogo editável dos itens de verificação dos 3 checklists do PDF
(planejamento/reconfirmação/execução) - o admin monta/edita essa lista pelo
painel (docs/requisitos.md Épico C). Uma vez usado num ciclo/item, o texto
fica congelado (snapshot em `MaintenanceCycle.planejamento_itens`/
`MaintenanceCycleItem.reconfirmacao_itens`/`execucao_itens` - ver
services/ciclos.py) - editar ou apagar um item aqui nunca reescreve
histórico já registrado."""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class ChecklistItemDef(Base):
    __tablename__ = "preventiva_checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tipo: Mapped[str] = mapped_column(String(20), index=True)  # planejamento | reconfirmacao | execucao
    texto: Mapped[str] = mapped_column(Text)
    secao: Mapped[str | None] = mapped_column(String(120), nullable=True)  # agrupamento visual, opcional
    ordem: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
