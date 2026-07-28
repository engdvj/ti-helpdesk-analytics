"""Login unificado (tecnico ou admin) + sessao por token opaco.

Login por tecnico verifica `Technician.password_hash` com bcrypt (senha
definida pelo admin no painel - ver `POST /admin/technicians/{id}/password`).
Login por admin reusa a mesma credencial de `ADMIN_USERNAME`/`ADMIN_PASSWORD`
que `require_admin` (`admin.py`) ja usa - esse endpoint so troca isso por um
token de sessao, o gate de mutacao do painel admin continua sendo
`require_admin` (headers), sem mudanca.

Token opaco em vez de reenviar usuario+senha a cada request: login passou a
valer pra qualquer leitura do dashboard (nao so as mutacoes do admin), e
verificar bcrypt (deliberadamente lento) a cada pagina custaria caro demais."""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.auth_session import AuthSession
from api.app.models.technician import Technician
from api.app.schemas.auth import ChangePasswordRequest, LoginRequest, SessionOut

router = APIRouter(prefix="/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False  # hash mal formado (nunca deveria acontecer, mas nao deixa 500)


@dataclass
class CurrentIdentity:
    subject_type: str  # "tecnico" | "admin"
    users_id: int | None
    nome_completo: str | None


def _technician_display_name(tech: Technician) -> str:
    return tech.nome_exibicao or tech.nome_completo


def _new_token() -> str:
    return secrets.token_urlsafe(32)


@router.post("/login", response_model=SessionOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    technician = db.scalar(select(Technician).where(Technician.username == payload.username))
    if technician is not None and technician.password_hash:
        if verify_password(payload.password, technician.password_hash):
            session = AuthSession(
                token=_new_token(), subject_type="tecnico", users_id=technician.users_id
            )
            db.add(session)
            db.commit()
            return SessionOut(
                token=session.token,
                subject_type="tecnico",
                users_id=technician.users_id,
                nome_completo=_technician_display_name(technician),
            )

    expected_user = os.getenv("ADMIN_USERNAME")
    expected_pass = os.getenv("ADMIN_PASSWORD")
    if expected_user and expected_pass and payload.username == expected_user and payload.password == expected_pass:
        session = AuthSession(token=_new_token(), subject_type="admin", users_id=None)
        db.add(session)
        db.commit()
        return SessionOut(token=session.token, subject_type="admin", users_id=None, nome_completo="Admin")

    raise HTTPException(401, "usuário ou senha inválidos")


@router.post("/logout")
def logout(x_session_token: str = Header(default=""), db: Session = Depends(get_db)):
    if x_session_token:
        session = db.get(AuthSession, x_session_token)
        if session is not None:
            db.delete(session)
            db.commit()
    return {"ok": True}


def require_session(
    x_session_token: str = Header(default=""),
    db: Session = Depends(get_db),
) -> CurrentIdentity:
    if not x_session_token:
        raise HTTPException(401, "sessão ausente - faça login")
    session = db.get(AuthSession, x_session_token)
    if session is None:
        raise HTTPException(401, "sessão inválida - faça login novamente")
    if session.expira_em.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise HTTPException(401, "sessão expirada - faça login novamente")

    nome_completo: str | None = "Admin"
    if session.subject_type == "tecnico":
        technician = db.get(Technician, session.users_id)
        if technician is None:
            raise HTTPException(401, "técnico não encontrado - faça login novamente")
        nome_completo = _technician_display_name(technician)
    return CurrentIdentity(
        subject_type=session.subject_type, users_id=session.users_id, nome_completo=nome_completo
    )


def require_technician_session(current: CurrentIdentity = Depends(require_session)) -> CurrentIdentity:
    if current.subject_type != "tecnico":
        raise HTTPException(403, "essa ação exige login de técnico")
    return current


@router.get("/me", response_model=SessionOut)
def me(x_session_token: str = Header(default=""), current: CurrentIdentity = Depends(require_session)):
    return SessionOut(
        token=x_session_token,
        subject_type=current.subject_type,
        users_id=current.users_id,
        nome_completo=current.nome_completo,
    )


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current: CurrentIdentity = Depends(require_technician_session),
    db: Session = Depends(get_db),
):
    technician = db.get(Technician, current.users_id)
    if technician is None or not technician.password_hash:
        raise HTTPException(404, "técnico não encontrado")
    if not verify_password(payload.senha_atual, technician.password_hash):
        raise HTTPException(401, "senha atual incorreta")
    technician.password_hash = hash_password(payload.senha_nova)
    db.commit()
    return {"ok": True}
