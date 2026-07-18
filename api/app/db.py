"""Engine/sessao SQLAlchemy 2.0 - mesmo padrao do fifa_analytics/api/app/db.py.

So catalogo (units, technicians) mora aqui. Dados analiticos sao lidos direto
dos parquets do pipeline via pandas (ver routers/analytics/_shared.py) -
Postgres nao serve como motor de leitura pesada aqui."""
from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://ti_analytics:ti_analytics@localhost:5432/ti_analytics")
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, future=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base declarativa de todos os modelos ORM."""


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
