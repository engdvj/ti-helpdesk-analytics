"""App FastAPI - TI Helpdesk Analytics (gamificacao dos chamados de TI/GLPI)."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app.db import Base, SessionLocal, engine
from api.app.routers import admin, technicians, units
from api.app.routers.analytics import snapshots as analytics_snapshots
from api.app.seed import seed_technicians, seed_units


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_units(db)
        seed_technicians(db)
    except Exception:  # best-effort no boot - sem coleta ainda, sobe vazio mesmo
        pass
    finally:
        db.close()
    yield


app = FastAPI(title="TI Helpdesk Analytics", version="0.1.0", lifespan=lifespan)

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(units.router)
app.include_router(technicians.router)
app.include_router(admin.router)
app.include_router(analytics_snapshots.router)


@app.get("/health")
def health():
    return {"status": "ok"}
