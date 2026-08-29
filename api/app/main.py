"""App FastAPI - TI Helpdesk Analytics (gamificacao dos chamados de TI/GLPI)."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app.db import Base, SessionLocal, engine, ensure_additive_columns
from api.app.routers import admin, auth, competencies, technicians, units
from api.app.routers.analytics import snapshots as analytics_snapshots
from api.app.routers.preventiva import checklist_items as preventiva_checklist_items
from api.app.routers.preventiva import computers as preventiva_computers
from api.app.routers.preventiva import cycle_items as preventiva_cycle_items
from api.app.routers.preventiva import cycles as preventiva_cycles
from api.app.routers.preventiva import sectors as preventiva_sectors
from api.app.scheduler import start_auto_collect
from api.app.seed import (
    seed_competency_activity_types,
    seed_preventiva_checklist_items,
    seed_technicians,
    seed_units,
)
from api.app.services.collection_jobs import mark_interrupted_collection_runs


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    ensure_additive_columns()
    db = SessionLocal()
    try:
        mark_interrupted_collection_runs(db)
        seed_competency_activity_types(db)
        seed_preventiva_checklist_items(db)
        seed_units(db)
        seed_technicians(db)
    except Exception:  # best-effort no boot - sem coleta ainda, sobe vazio mesmo
        pass
    finally:
        db.close()
    start_auto_collect()
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
app.include_router(auth.router)
app.include_router(competencies.router)
app.include_router(analytics_snapshots.router)
app.include_router(preventiva_sectors.router)
app.include_router(preventiva_computers.router)
app.include_router(preventiva_checklist_items.router)
app.include_router(preventiva_cycles.router)
app.include_router(preventiva_cycle_items.router)


@app.get("/health")
def health():
    return {"status": "ok"}
