"""Sessao leve pos-login (tecnico ou admin).

Token opaco em vez de reenviar usuario+senha a cada request (padrao do
`require_admin` em `admin.py`) - login passou a valer pra qualquer leitura do
dashboard, entao verificar bcrypt (deliberadamente lento) a cada pagina
custaria caro. O lookup aqui e so por chave primaria."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base

SESSION_TTL = timedelta(hours=24)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _default_expiry() -> datetime:
    return _utcnow() + SESSION_TTL


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    subject_type: Mapped[str] = mapped_column(String(20))  # "tecnico" | "admin"
    users_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("technicians.users_id"), nullable=True
    )
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_default_expiry)
