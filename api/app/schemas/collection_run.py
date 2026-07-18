from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


CollectionRunStatus = Literal["queued", "running", "success", "error"]


class CollectionRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: CollectionRunStatus
    requested_by: str
    requested_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    duration_seconds: float | None
    counts: dict[str, int] | None
    error: str | None
    error_details: str | None

    @field_validator("requested_at", "started_at", "finished_at", mode="before")
    @classmethod
    def _restore_sqlite_utc_timezone(cls, value: datetime | None) -> datetime | None:
        """SQLite remove o tzinfo de DateTime(timezone=True).

        Os valores persistidos sao UTC; recolocar explicitamente o fuso faz a
        resposta JSON carregar `Z`/`+00:00`, permitindo a conversao correta no
        navegador para America/Sao_Paulo.
        """
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class CollectionRunPage(BaseModel):
    items: list[CollectionRunOut]
    page: int
    page_size: int
    total: int
    total_pages: int
    active: CollectionRunOut | None
