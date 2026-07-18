"""Matriz declarada de competências técnicas.

Este módulo não tenta inferir domínio a partir do volume de chamados. O
catálogo descreve atividades e situações observáveis; cada avaliação registra
quantos pontos o técnico demonstrou, a evidência usada e quem avaliou.
Avaliações são append-only para preservar a evolução ao longo do tempo.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CompetencyActivityType(Base):
    __tablename__ = "competency_activity_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    nome: Mapped[str] = mapped_column(String(120))
    descricao: Mapped[str] = mapped_column(Text, default="")
    cor: Mapped[str] = mapped_column(String(20), default="#58a6ff")
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class CompetencyActivity(Base):
    __tablename__ = "competency_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(180))
    descricao: Mapped[str] = mapped_column(Text, default="")
    tipo: Mapped[str] = mapped_column(String(40), default="operacional", server_default="operacional")
    escopo_tipo_campo: Mapped[str] = mapped_column(String(40), default="texto_longo", server_default="texto_longo")
    escopo_opcoes: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    escopo_valor: Mapped[str | list[str] | None] = mapped_column(JSON, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    situacoes: Mapped[list["CompetencySituation"]] = relationship(
        back_populates="atividade",
        cascade="all, delete-orphan",
        order_by="CompetencySituation.ordem, CompetencySituation.id",
    )


class CompetencySituation(Base):
    __tablename__ = "competency_situations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    atividade_id: Mapped[int] = mapped_column(ForeignKey("competency_activities.id"), index=True)
    nome: Mapped[str] = mapped_column(String(220))
    contexto: Mapped[str] = mapped_column(Text, default="")
    procedimento_esperado: Mapped[str] = mapped_column(Text)
    procedimento_tipo_campo: Mapped[str] = mapped_column(String(40), default="texto_longo", server_default="texto_longo")
    procedimento_opcoes: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    procedimento_valor: Mapped[str | list[str] | None] = mapped_column(JSON, nullable=True)
    pontos_maximos: Mapped[float] = mapped_column(Float, default=1.0)
    tipo_campo: Mapped[str] = mapped_column(String(40), default="escala", server_default="escala")
    opcoes: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    atividade: Mapped[CompetencyActivity] = relationship(back_populates="situacoes")
    avaliacoes: Mapped[list["CompetencyAssessment"]] = relationship(back_populates="situacao")


class CompetencyAssessment(Base):
    __tablename__ = "competency_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    users_id: Mapped[int] = mapped_column(ForeignKey("technicians.users_id"), index=True)
    situacao_id: Mapped[int] = mapped_column(ForeignKey("competency_situations.id"), index=True)
    pontos: Mapped[float] = mapped_column(Float)
    resposta: Mapped[str | list[str] | bool | None] = mapped_column(JSON, nullable=True)
    evidencia: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    avaliado_por: Mapped[str] = mapped_column(String(120))
    avaliado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)

    situacao: Mapped[CompetencySituation] = relationship(back_populates="avaliacoes")
