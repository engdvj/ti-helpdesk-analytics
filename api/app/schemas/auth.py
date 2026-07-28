from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)


class SessionOut(BaseModel):
    token: str
    subject_type: str  # "tecnico" | "admin"
    users_id: int | None
    nome_completo: str | None


class ChangePasswordRequest(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=200)
    senha_nova: str = Field(min_length=4, max_length=200)
