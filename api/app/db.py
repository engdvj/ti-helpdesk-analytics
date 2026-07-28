"""Engine/sessao SQLAlchemy 2.0 - mesmo padrao do fifa_analytics/api/app/db.py.

O catalogo (units, technicians) e o historico operacional das coletas moram
aqui. Dados analiticos sao lidos direto dos parquets do pipeline via pandas
(ver routers/analytics/_shared.py) - Postgres nao serve como motor de leitura
pesada aqui."""
from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError, ProgrammingError
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


def ensure_additive_columns() -> None:
    """`Base.metadata.create_all()` so cria tabela que ainda nao existe -
    numa tabela ja seedada (`technicians`), colunas novas no model nunca
    aparecem sozinhas. Sem Alembic neste
    projeto (ver CLAUDE.md) - pra uma mudanca so-aditiva como essa, `ALTER
    TABLE ADD COLUMN` direto e suficiente; o try/except ignora "coluna ja
    existe" (idempotente, funciona em sqlite e postgres)."""
    additions = [
        "ALTER TABLE technicians ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT 1",
        "ALTER TABLE technicians ADD COLUMN unidade_slug VARCHAR",
        "ALTER TABLE technicians ADD COLUMN foto TEXT",
        "ALTER TABLE technicians ADD COLUMN foto_fonte VARCHAR",
        "ALTER TABLE technicians ADD COLUMN nome_exibicao VARCHAR",
        "ALTER TABLE competency_activities ADD COLUMN tipo VARCHAR(40) NOT NULL DEFAULT 'operacional'",
        "ALTER TABLE competency_activities ADD COLUMN escopo_tipo_campo VARCHAR(40) NOT NULL DEFAULT 'texto_longo'",
        "ALTER TABLE competency_activities ADD COLUMN escopo_opcoes JSON",
        "ALTER TABLE competency_activities ADD COLUMN escopo_valor JSON",
        "ALTER TABLE competency_situations ADD COLUMN tipo_campo VARCHAR(40) NOT NULL DEFAULT 'escala'",
        "ALTER TABLE competency_situations ADD COLUMN opcoes JSON",
        "ALTER TABLE competency_situations ADD COLUMN procedimento_tipo_campo VARCHAR(40) NOT NULL DEFAULT 'texto_longo'",
        "ALTER TABLE competency_situations ADD COLUMN procedimento_opcoes JSON",
        "ALTER TABLE competency_situations ADD COLUMN procedimento_valor JSON",
        "ALTER TABLE competency_assessments ADD COLUMN resposta JSON",
        "ALTER TABLE technicians ADD COLUMN password_hash VARCHAR",
        "ALTER TABLE competency_assessments ADD COLUMN avaliador_users_id INTEGER",
        "ALTER TABLE competency_assessments ADD COLUMN anonimo BOOLEAN NOT NULL DEFAULT 0",
    ]
    for stmt in additions:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except (OperationalError, ProgrammingError):
            pass  # coluna ja existe
