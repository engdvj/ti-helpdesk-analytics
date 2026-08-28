from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.collection_run import CollectionRun
from api.app.models.technician import Technician
from api.app.models.unit import Unit
from api.app.routers.auth import hash_password
from api.app.scheduler import load_auto_collect_minutes, save_auto_collect_minutes
from api.app.schemas.collection_run import CollectionRunOut, CollectionRunPage, CollectionRunStatus
from api.app.schemas.technician import TechnicianOut
from api.app.services.collection_jobs import (
    ACTIVE_COLLECTION_STATUSES,
    CollectionAlreadyRunningError,
    create_collection_run,
    execute_collection_run,
)
from ti_analytics.analytics.complexity import (
    build_category_difficulty_table,
    filter_categories_by_root,
    load_category_difficulty_overrides,
    save_category_difficulty_override,
    save_category_difficulty_overrides,
)
from ti_analytics.analytics.presets import (
    PRESETS_FORMAT,
    PRESETS_VERSION,
    load_presets,
    preset_bundle,
    save_presets,
)
from ti_analytics.analytics.role_visibility import load_role_visibility, save_role_visibility
from ti_analytics.config import load_config
from ti_analytics.analytics.scores import (
    DEFAULT_SCORE_TARGETS,
    TECH_SCORE_WEIGHTS,
    load_score_targets,
    load_weights,
    save_score_targets,
    save_weights_config,
)
from ti_analytics.glpi.team_roles_config import VALID_PAPEIS, set_papel_override
from ti_analytics.paths import GOLD_DIR, SILVER_DIR

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(
    x_admin_username: str = Header(default=""),
    x_admin_password: str = Header(default=""),
) -> str:
    """Trava simples por usuario+senha compartilhados (ADMIN_USERNAME/
    ADMIN_PASSWORD no .env) - nao e conta de usuario de verdade, so um
    portao a mais antes de disparar coleta ou mudar peso de score. Rede ja e
    interna do hospital (ver CLAUDE.md)."""
    expected_user = os.getenv("ADMIN_USERNAME")
    expected_pass = os.getenv("ADMIN_PASSWORD")
    if not expected_user or not expected_pass:
        raise HTTPException(500, "ADMIN_USERNAME/ADMIN_PASSWORD nao configurados no servidor")
    if x_admin_username != expected_user or x_admin_password != expected_pass:
        raise HTTPException(401, "usuario ou senha de admin invalidos")
    return x_admin_username


@router.post("/verify", dependencies=[Depends(require_admin)])
def verify_admin():
    """So valida a senha (usado pelo frontend pra desbloquear o modo admin
    sem disparar nada pesado)."""
    return {"ok": True}


@router.post("/collect", response_model=CollectionRunOut, status_code=202)
def trigger_collect(
    background_tasks: BackgroundTasks,
    requested_by: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Registra e agenda a coleta sem prender o ciclo de vida da pagina."""
    try:
        run = create_collection_run(db, requested_by)
    except CollectionAlreadyRunningError as exc:
        raise HTTPException(409, f"Ja existe uma coleta em andamento ({exc.run.id}).") from exc
    background_tasks.add_task(execute_collection_run, run.id)
    return run


@router.get("/auto-collect")
def get_auto_collect():
    """Leitura publica (mesma politica de weights/role-visibility) - intervalo
    atual da coleta automatica em minutos (0 = desligada)."""
    return {"minutes": load_auto_collect_minutes()}


class AutoCollectUpdate(BaseModel):
    minutes: float = Field(ge=0, le=1440)


@router.put("/auto-collect", dependencies=[Depends(require_admin)])
def update_auto_collect(payload: AutoCollectUpdate):
    """So a escrita e protegida - a thread do scheduler (api/app/scheduler.py)
    le esse valor de novo a cada checagem, sem precisar reiniciar o container."""
    save_auto_collect_minutes(payload.minutes)
    return {"minutes": payload.minutes}


CollectionRunSort = Literal[
    "requested_at",
    "started_at",
    "finished_at",
    "duration_seconds",
    "status",
    "requested_by",
]


@router.get(
    "/collection-runs",
    response_model=CollectionRunPage,
    dependencies=[Depends(require_admin)],
)
def list_collection_runs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=5, le=100),
    sort_by: CollectionRunSort = "requested_at",
    sort_dir: Literal["asc", "desc"] = "desc",
    status_filter: CollectionRunStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    filters = []
    if status_filter is not None:
        filters.append(CollectionRun.status == status_filter)

    count_query = select(func.count()).select_from(CollectionRun)
    rows_query = select(CollectionRun)
    if filters:
        count_query = count_query.where(*filters)
        rows_query = rows_query.where(*filters)

    total = int(db.scalar(count_query) or 0)
    total_pages = max(1, (total + page_size - 1) // page_size)
    safe_page = min(page, total_pages)
    sort_column = getattr(CollectionRun, sort_by)
    order = (asc(sort_column) if sort_dir == "asc" else desc(sort_column)).nulls_last()
    items = list(
        db.scalars(
            rows_query
            .order_by(order, CollectionRun.requested_at.desc())
            .offset((safe_page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    active = db.scalar(
        select(CollectionRun)
        .where(CollectionRun.status.in_(ACTIVE_COLLECTION_STATUSES))
        .order_by(CollectionRun.requested_at.desc())
        .limit(1)
    )
    return {
        "items": items,
        "page": safe_page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "active": active,
    }


@router.get(
    "/collection-runs/{run_id}",
    response_model=CollectionRunOut,
    dependencies=[Depends(require_admin)],
)
def get_collection_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(CollectionRun, run_id)
    if run is None:
        raise HTTPException(404, "Coleta nao encontrada.")
    return run


@router.get("/weights")
def get_weights():
    """Leitura publica - pesos de score nao sao segredo, so a escrita e
    protegida."""
    return load_weights()


class WeightsUpdate(BaseModel):
    score_volume: float
    score_complexidade: float
    score_velocidade_resposta: float
    score_abrangencia: float
    score_qualidade: float

    @field_validator("*")
    @classmethod
    def _non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("peso nao pode ser negativo")
        return v


@router.put("/weights", dependencies=[Depends(require_admin)])
def update_weights(payload: WeightsUpdate):
    weights = payload.model_dump()
    total = sum(weights.values())
    if abs(total - 1.0) > 0.01:
        raise HTTPException(400, f"pesos devem somar 1.0 (soma atual: {total:.3f})")
    save_weights_config(weights)
    return weights


@router.post("/weights/reset", dependencies=[Depends(require_admin)])
def reset_weights():
    save_weights_config(TECH_SCORE_WEIGHTS)
    return TECH_SCORE_WEIGHTS


class ScoreTargetsUpdate(BaseModel):
    volume_por_dia: float
    complexidade_categoria: float
    resposta_min: float
    abrangencia_ratio: float
    qualidade: float

    @field_validator("*")
    @classmethod
    def _positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("meta deve ser maior que zero")
        return v


@router.get("/score-targets")
def get_score_targets():
    return load_score_targets()


@router.put("/score-targets", dependencies=[Depends(require_admin)])
def update_score_targets(payload: ScoreTargetsUpdate):
    targets = payload.model_dump()
    save_score_targets(targets)
    return targets


@router.post("/score-targets/reset", dependencies=[Depends(require_admin)])
def reset_score_targets():
    save_score_targets(DEFAULT_SCORE_TARGETS)
    return DEFAULT_SCORE_TARGETS


class RoleVisibilityUpdate(BaseModel):
    mostrar_plantonistas: bool = True
    mostrar_taticos: bool
    mostrar_coordenacao: bool


@router.get("/role-visibility")
def get_role_visibility():
    """Leitura publica para ranking e perfis; somente a escrita e protegida."""
    return load_role_visibility()


@router.put("/role-visibility", dependencies=[Depends(require_admin)])
def update_role_visibility(payload: RoleVisibilityUpdate):
    return save_role_visibility(payload.model_dump())


class PresetParameters(BaseModel):
    score_weights: WeightsUpdate
    score_targets: ScoreTargetsUpdate
    category_overrides: dict[int, float]
    role_visibility: RoleVisibilityUpdate

    @field_validator("category_overrides")
    @classmethod
    def _valid_category_overrides(cls, values: dict[int, float]) -> dict[int, float]:
        if len(values) > 10_000:
            raise ValueError("quantidade de categorias excede o limite")
        if any(category_id <= 0 or weight <= 0 for category_id, weight in values.items()):
            raise ValueError("IDs e pesos de categoria devem ser maiores que zero")
        return values

    @model_validator(mode="after")
    def _weights_sum_one(self):
        total = sum(self.score_weights.model_dump().values())
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"pesos devem somar 1.0 (soma atual: {total:.3f})")
        return self


class ConfigPreset(BaseModel):
    id: str = Field(pattern=r"^[a-f0-9]{32}$")
    nome: str = Field(min_length=1, max_length=80)
    criado_em: datetime
    atualizado_em: datetime
    parametros: PresetParameters

    @field_validator("nome")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("nome do preset nao pode ficar vazio")
        return cleaned


class PresetCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=80)

    @field_validator("nome")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        return ConfigPreset._clean_name(value)


class PresetCaptureUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=80)

    @field_validator("nome")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        return ConfigPreset._clean_name(value) if value is not None else None


class PresetBundle(BaseModel):
    formato: Literal["ti-helpdesk-analytics-presets"]
    versao: Literal[1]
    presets: list[ConfigPreset] = Field(max_length=100)


def _current_preset_parameters() -> PresetParameters:
    return PresetParameters(
        score_weights=WeightsUpdate(**load_weights()),
        score_targets=ScoreTargetsUpdate(**load_score_targets()),
        category_overrides=load_category_difficulty_overrides(),
        role_visibility=RoleVisibilityUpdate(**load_role_visibility()),
    )


def _load_config_presets() -> list[ConfigPreset]:
    try:
        presets = [ConfigPreset.model_validate(item) for item in load_presets()]
    except Exception as exc:
        raise HTTPException(500, f"arquivo de presets invalido: {exc}") from exc
    return sorted(presets, key=lambda preset: preset.atualizado_em, reverse=True)


def _save_config_presets(presets: list[ConfigPreset]) -> None:
    save_presets([preset.model_dump(mode="json") for preset in presets])


def _find_preset(presets: list[ConfigPreset], preset_id: str) -> ConfigPreset:
    preset = next((item for item in presets if item.id == preset_id), None)
    if preset is None:
        raise HTTPException(404, "preset nao encontrado")
    return preset


def _write_preset_parameters(parameters: PresetParameters) -> None:
    save_weights_config(parameters.score_weights.model_dump())
    save_score_targets(parameters.score_targets.model_dump())
    save_category_difficulty_overrides(parameters.category_overrides)
    save_role_visibility(parameters.role_visibility.model_dump())


def _apply_preset_parameters(parameters: PresetParameters) -> None:
    """Valida antes e restaura a configuracao anterior se alguma escrita falhar."""
    previous = _current_preset_parameters()
    try:
        _write_preset_parameters(parameters)
    except Exception:
        _write_preset_parameters(previous)
        raise


@router.get(
    "/config-presets",
    dependencies=[Depends(require_admin)],
    response_model=list[ConfigPreset],
)
def list_config_presets():
    return _load_config_presets()


@router.post(
    "/config-presets",
    dependencies=[Depends(require_admin)],
    response_model=ConfigPreset,
)
def create_config_preset(payload: PresetCreate):
    presets = _load_config_presets()
    if any(item.nome.casefold() == payload.nome.casefold() for item in presets):
        raise HTTPException(409, "ja existe um preset com esse nome")
    now = datetime.now(timezone.utc)
    preset = ConfigPreset(
        id=uuid4().hex,
        nome=payload.nome,
        criado_em=now,
        atualizado_em=now,
        parametros=_current_preset_parameters(),
    )
    _save_config_presets([preset, *presets])
    return preset


@router.get(
    "/config-presets/export",
    dependencies=[Depends(require_admin)],
    response_model=PresetBundle,
)
def export_config_presets():
    return preset_bundle([item.model_dump(mode="json") for item in _load_config_presets()])


@router.post(
    "/config-presets/import",
    dependencies=[Depends(require_admin)],
    response_model=list[ConfigPreset],
)
def import_config_presets(bundle: PresetBundle):
    existing = _load_config_presets()
    by_id = {item.id: index for index, item in enumerate(existing)}
    by_name = {item.nome.casefold(): index for index, item in enumerate(existing)}
    for imported in bundle.presets:
        index = by_id.get(imported.id, by_name.get(imported.nome.casefold()))
        if index is None:
            existing.append(imported)
        else:
            existing[index] = imported
        by_id = {item.id: idx for idx, item in enumerate(existing)}
        by_name = {item.nome.casefold(): idx for idx, item in enumerate(existing)}
    _save_config_presets(existing)
    return sorted(existing, key=lambda preset: preset.atualizado_em, reverse=True)


@router.get(
    "/config-presets/{preset_id}/export",
    dependencies=[Depends(require_admin)],
    response_model=PresetBundle,
)
def export_config_preset(preset_id: str):
    preset = _find_preset(_load_config_presets(), preset_id)
    return preset_bundle([preset.model_dump(mode="json")])


@router.put(
    "/config-presets/{preset_id}",
    dependencies=[Depends(require_admin)],
    response_model=ConfigPreset,
)
def update_config_preset(preset_id: str, payload: PresetCaptureUpdate):
    presets = _load_config_presets()
    current = _find_preset(presets, preset_id)
    name = payload.nome or current.nome
    if any(item.id != preset_id and item.nome.casefold() == name.casefold() for item in presets):
        raise HTTPException(409, "ja existe um preset com esse nome")
    updated = current.model_copy(update={
        "nome": name,
        "atualizado_em": datetime.now(timezone.utc),
        "parametros": _current_preset_parameters(),
    })
    _save_config_presets([updated if item.id == preset_id else item for item in presets])
    return updated


@router.post(
    "/config-presets/{preset_id}/apply",
    dependencies=[Depends(require_admin)],
    response_model=ConfigPreset,
)
def apply_config_preset(preset_id: str):
    preset = _find_preset(_load_config_presets(), preset_id)
    _apply_preset_parameters(preset.parametros)
    return preset


@router.delete(
    "/config-presets/{preset_id}",
    dependencies=[Depends(require_admin)],
)
def delete_config_preset(preset_id: str):
    presets = _load_config_presets()
    _find_preset(presets, preset_id)
    _save_config_presets([item for item in presets if item.id != preset_id])
    return {"ok": True}


class TechnicianProfileUpdate(BaseModel):
    """PATCH-like: so mexe no campo que veio no payload (ver model_fields_set
    no handler) - permite limpar um campo mandando "" sem afetar os outros."""
    papel: str | None = None
    ativo: bool | None = None
    unidade_slug: str | None = None
    nome_exibicao: str | None = None
    foto: str | None = None

    @field_validator("papel")
    @classmethod
    def _valid_papel(cls, v: str | None) -> str | None:
        if v and v not in VALID_PAPEIS:
            raise ValueError(f"papel invalido: {v} (validos: {sorted(VALID_PAPEIS)})")
        return v

    @field_validator("unidade_slug")
    @classmethod
    def _clean_unit_slug(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None


@router.put("/technicians/{users_id}", dependencies=[Depends(require_admin)], response_model=TechnicianOut)
def update_technician_profile(users_id: int, payload: TechnicianProfileUpdate, db: Session = Depends(get_db)):
    """Atualiza o cadastro mestre usado imediatamente pela analytics.

    `papel` tambem persiste em team_roles.yaml para sobreviver a coleta.
    Status, unidade, nome e foto moram no banco e o seed nunca os sobrescreve.
    Unidade nula significa que o tecnico atua em todo o complexo.
    """
    tech = db.get(Technician, users_id)
    if tech is None:
        raise HTTPException(404, "tecnico nao encontrado")

    fields_set = payload.model_fields_set
    if "papel" in fields_set:
        set_papel_override(users_id, payload.papel)
        if payload.papel is not None:
            tech.papel = payload.papel
    if "ativo" in fields_set and payload.ativo is not None:
        tech.ativo = payload.ativo
    if "unidade_slug" in fields_set:
        if payload.unidade_slug is not None and db.get(Unit, payload.unidade_slug) is None:
            raise HTTPException(400, "unidade nao encontrada")
        tech.unidade_slug = payload.unidade_slug
    if "nome_exibicao" in fields_set:
        tech.nome_exibicao = payload.nome_exibicao or None
    if "foto" in fields_set:
        tech.foto = payload.foto or None
        tech.foto_fonte = "upload" if payload.foto else None

    db.commit()
    db.refresh(tech)
    return tech


class TechnicianPasswordSet(BaseModel):
    senha: str = Field(min_length=4, max_length=200)


@router.post("/technicians/{users_id}/password", dependencies=[Depends(require_admin)])
def set_technician_password(users_id: int, payload: TechnicianPasswordSet, db: Session = Depends(get_db)):
    """Provisiona/reseta a senha de login do tecnico (ver `routers/auth.py`).
    So o admin define - o tecnico nao se autocadastra; depois de logado ele
    pode trocar a propria senha via `POST /auth/change-password`."""
    tech = db.get(Technician, users_id)
    if tech is None:
        raise HTTPException(404, "tecnico nao encontrado")
    tech.password_hash = hash_password(payload.senha)
    db.commit()
    return {"ok": True}


def _read_parquet_or_empty(path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.exists() else pd.DataFrame()


@router.get("/category-difficulty")
def get_category_difficulty():
    """Leitura publica (mesma politica de weights/role-visibility) - lista
    as categorias da arvore de TI (mesmo sem chamado ainda) com contagem,
    tempo historico, sugestao automatica (ver analytics/complexity.py) e o
    override atual do admin, pro painel /admin montar a tabela."""
    fact = _read_parquet_or_empty(GOLD_DIR / "fact_chamado.parquet")
    dim_categoria = _read_parquet_or_empty(SILVER_DIR / "dim_categoria.parquet")
    if dim_categoria.empty:
        return []
    category_root = load_config("pipeline.yaml")["categorias_ti"]["raiz"]
    dim_categoria = filter_categories_by_root(dim_categoria, category_root)
    overrides = load_category_difficulty_overrides()
    table = build_category_difficulty_table(fact, dim_categoria, overrides)
    return [
        {
            "itilcategories_id": int(row["itilcategories_id"]),
            "categoria_pai": row["categoria_pai"],
            "categoria_nome": row["categoria_nome"],
            "categoria_completa": row["categoria_completa"],
            "n_chamados": int(row["n_chamados"]),
            "resolucao_media_h": None if pd.isna(row["resolucao_media_h"]) else float(row["resolucao_media_h"]),
            "sugestao_automatica": float(row["sugestao_automatica"]),
            "override": None if pd.isna(row["override"]) else float(row["override"]),
            "dificuldade_atual": float(row["dificuldade_atual"]),
        }
        for _, row in table.iterrows()
    ]


class CategoryDifficultyUpdate(BaseModel):
    peso: float | None = None

    @field_validator("peso")
    @classmethod
    def _positive_or_none(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("peso deve ser maior que zero")
        return v


@router.put("/category-difficulty/{itilcategories_id}", dependencies=[Depends(require_admin)])
def update_category_difficulty(itilcategories_id: int, payload: CategoryDifficultyUpdate):
    """peso=None remove o override (volta a usar a sugestao automatica).

    Snapshots e perfis sobrepoem a configuracao atual em tempo de leitura;
    portanto a mudanca e imediata e nao depende de uma nova coleta GLPI.
    """
    overrides = save_category_difficulty_override(itilcategories_id, payload.peso)
    return {"itilcategories_id": itilcategories_id, "override": overrides.get(itilcategories_id)}
