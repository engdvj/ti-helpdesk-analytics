"""Catálogo e avaliações da matriz explícita de competências."""
from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from api.app.db import get_db
from api.app.models.competency import (
    CompetencyActivity,
    CompetencyActivityType,
    CompetencyAssessment,
    CompetencySituation,
)
from api.app.models.technician import Technician
from api.app.routers.admin import require_admin
from api.app.routers.auth import CurrentIdentity, require_session
from api.app.schemas.competency import (
    CompetencyActivityCreate,
    CompetencyActivityOut,
    CompetencyActivityProgress,
    CompetencyActivityTypeCreate,
    CompetencyActivityTypeOut,
    CompetencyActivityTypeUpdate,
    CompetencyActivityUpdate,
    CompetencyAssessmentCreate,
    CompetencyAssessmentOut,
    CompetencySituationCreate,
    CompetencySituationOut,
    CompetencySituationProgress,
    CompetencySituationUpdate,
    CompetencyTechnicianDetail,
    CompetencyTechnicianSummary,
)

router = APIRouter(prefix="/competencies", tags=["competencies"])


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")[:40].rstrip("-")


def _require_activity_type(db: Session, slug: str) -> CompetencyActivityType:
    activity_type = db.scalar(
        select(CompetencyActivityType).where(CompetencyActivityType.slug == slug)
    )
    if activity_type is None or not activity_type.ativa:
        raise HTTPException(422, "Selecione um tipo de atividade ativo.")
    return activity_type


def _content_value(value: str | list[str] | None, fallback: str, field_type: str):
    if value is None and field_type in {"texto_curto", "texto_longo"}:
        return fallback
    return value


def _catalog(db: Session, include_inactive: bool = False) -> list[CompetencyActivity]:
    stmt = (
        select(CompetencyActivity)
        .options(selectinload(CompetencyActivity.situacoes))
        .order_by(CompetencyActivity.ordem, CompetencyActivity.nome, CompetencyActivity.id)
    )
    if not include_inactive:
        stmt = stmt.where(CompetencyActivity.ativa.is_(True))
    return list(db.scalars(stmt).all())


def _activity_out(activity: CompetencyActivity, include_inactive: bool = False) -> CompetencyActivityOut:
    situations = [s for s in activity.situacoes if include_inactive or s.ativa]
    return CompetencyActivityOut(
        id=activity.id,
        nome=activity.nome,
        descricao=activity.descricao,
        tipo=activity.tipo,
        escopo_tipo_campo=activity.escopo_tipo_campo,
        escopo_opcoes=activity.escopo_opcoes or [],
        escopo_valor=_content_value(activity.escopo_valor, activity.descricao, activity.escopo_tipo_campo),
        ordem=activity.ordem,
        ativa=activity.ativa,
        situacoes=[_situation_out(s) for s in situations],
    )


def _situation_out(situation: CompetencySituation) -> CompetencySituationOut:
    return CompetencySituationOut(
        id=situation.id,
        atividade_id=situation.atividade_id,
        nome=situation.nome,
        contexto=situation.contexto,
        procedimento_esperado=situation.procedimento_esperado,
        procedimento_tipo_campo=situation.procedimento_tipo_campo,
        procedimento_opcoes=situation.procedimento_opcoes or [],
        procedimento_valor=_content_value(
            situation.procedimento_valor,
            situation.procedimento_esperado,
            situation.procedimento_tipo_campo,
        ),
        pontos_maximos=situation.pontos_maximos,
        tipo_campo=situation.tipo_campo,
        opcoes=situation.opcoes or [],
        ordem=situation.ordem,
        ativa=situation.ativa,
    )


def _redact(assessment: CompetencyAssessment) -> CompetencyAssessmentOut:
    """`avaliado_por`/`avaliador_users_id` somem quando a avaliacao e
    anonima - pra qualquer leitor, inclusive o admin (nao ha excecao)."""
    out = CompetencyAssessmentOut.model_validate(assessment)
    if out.anonimo:
        out = out.model_copy(update={"avaliado_por": "Anônimo", "avaliador_users_id": None})
    return out


class _Aggregate:
    __slots__ = ("pontos", "avaliacoes")

    def __init__(self) -> None:
        self.pontos: float = 0.0
        self.avaliacoes: list[CompetencyAssessment] = []


def _aggregated_assessments(
    db: Session,
    users_ids: set[int] | None = None,
) -> dict[tuple[int, int], _Aggregate]:
    """Uma avaliacao por AVALIADOR (a mais recente, se ele reavaliou a mesma
    situacao mais de uma vez) por (tecnico, situacao), depois a MEDIA dos
    pontos entre avaliadores distintos - nao a "ultima avaliacao" de
    qualquer um. Avaliador = avaliador_users_id (tecnico logado) ou, pra
    avaliacoes antigas/do admin (avaliador_users_id nulo), o proprio
    avaliado_por (string) - assim o admin reavaliando so substitui a propria
    nota, nunca soma outra entrada."""
    stmt = select(CompetencyAssessment).order_by(
        CompetencyAssessment.avaliado_em.desc(),
        CompetencyAssessment.id.desc(),
    )
    if users_ids is not None:
        if not users_ids:
            return {}
        stmt = stmt.where(CompetencyAssessment.users_id.in_(users_ids))

    latest_per_evaluator: dict[tuple[int, int, str], CompetencyAssessment] = {}
    for assessment in db.scalars(stmt):
        evaluator_key = (
            str(assessment.avaliador_users_id)
            if assessment.avaliador_users_id is not None
            else f"admin:{assessment.avaliado_por}"
        )
        key = (assessment.users_id, assessment.situacao_id, evaluator_key)
        latest_per_evaluator.setdefault(key, assessment)

    aggregates: dict[tuple[int, int], _Aggregate] = {}
    for (users_id, situacao_id, _evaluator_key), assessment in latest_per_evaluator.items():
        agg = aggregates.setdefault((users_id, situacao_id), _Aggregate())
        agg.avaliacoes.append(assessment)

    for agg in aggregates.values():
        agg.avaliacoes.sort(key=lambda a: (a.avaliado_em, a.id), reverse=True)
        agg.pontos = sum(a.pontos for a in agg.avaliacoes) / len(agg.avaliacoes)

    return aggregates


def _level(percentual: float, avaliadas: int) -> str:
    if avaliadas == 0:
        return "nao_avaliado"
    if percentual >= 85:
        return "dominio"
    if percentual >= 60:
        return "competente"
    return "em_desenvolvimento"


def _summary(
    technician: Technician,
    situations: list[CompetencySituation],
    aggregated: dict[tuple[int, int], _Aggregate],
) -> CompetencyTechnicianSummary:
    current = [aggregated.get((technician.users_id, situation.id)) for situation in situations]
    pontos = sum(min(item.pontos, situation.pontos_maximos) for item, situation in zip(current, situations) if item)
    pontos_maximos = sum(situation.pontos_maximos for situation in situations)
    avaliadas = sum(item is not None for item in current)
    percentual = pontos / pontos_maximos * 100 if pontos_maximos else 0.0
    return CompetencyTechnicianSummary(
        users_id=technician.users_id,
        nome=technician.nome_exibicao or technician.nome_completo,
        username=technician.username,
        papel=technician.papel,
        unidade_slug=technician.unidade_slug,
        foto=technician.foto,
        pontos=round(pontos, 1),
        pontos_maximos=round(pontos_maximos, 1),
        percentual=round(percentual, 1),
        situacoes_avaliadas=avaliadas,
        situacoes_total=len(situations),
        nivel=_level(percentual, avaliadas),
    )


@router.get("/catalog", response_model=list[CompetencyActivityOut], dependencies=[Depends(require_session)])
def list_catalog(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
):
    return [_activity_out(activity, include_inactive) for activity in _catalog(db, include_inactive)]


@router.get("/activity-types", response_model=list[CompetencyActivityTypeOut], dependencies=[Depends(require_session)])
def list_activity_types(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
):
    stmt = select(CompetencyActivityType).order_by(
        CompetencyActivityType.ordem,
        CompetencyActivityType.nome,
        CompetencyActivityType.id,
    )
    if not include_inactive:
        stmt = stmt.where(CompetencyActivityType.ativa.is_(True))
    return list(db.scalars(stmt).all())


@router.post(
    "/activity-types",
    response_model=CompetencyActivityTypeOut,
    dependencies=[Depends(require_admin)],
)
def create_activity_type(payload: CompetencyActivityTypeCreate, db: Session = Depends(get_db)):
    slug = payload.slug or _slugify(payload.nome)
    if len(slug) < 2:
        raise HTTPException(422, "Informe um nome que gere um identificador válido.")
    if db.scalar(select(CompetencyActivityType).where(CompetencyActivityType.slug == slug)):
        raise HTTPException(409, "Já existe um tipo de atividade com esse identificador.")
    activity_type = CompetencyActivityType(**payload.model_dump(exclude={"slug"}), slug=slug)
    db.add(activity_type)
    db.commit()
    db.refresh(activity_type)
    return activity_type


@router.put(
    "/activity-types/{type_id}",
    response_model=CompetencyActivityTypeOut,
    dependencies=[Depends(require_admin)],
)
def update_activity_type(
    type_id: int,
    payload: CompetencyActivityTypeUpdate,
    db: Session = Depends(get_db),
):
    activity_type = db.get(CompetencyActivityType, type_id)
    if activity_type is None:
        raise HTTPException(404, "Tipo de atividade não encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(activity_type, key, value)
    db.commit()
    db.refresh(activity_type)
    return activity_type


@router.delete(
    "/activity-types/{type_id}",
    dependencies=[Depends(require_admin)],
)
def delete_activity_type(type_id: int, db: Session = Depends(get_db)):
    activity_type = db.get(CompetencyActivityType, type_id)
    if activity_type is None:
        raise HTTPException(404, "Tipo de atividade não encontrado.")
    usage_count = db.scalar(
        select(func.count()).select_from(CompetencyActivity).where(
            CompetencyActivity.tipo == activity_type.slug,
        )
    ) or 0
    if usage_count:
        raise HTTPException(409, "Este tipo está em uso. Desative-o para preservar as atividades vinculadas.")
    db.delete(activity_type)
    db.commit()
    return {"ok": True}


@router.post(
    "/activities",
    response_model=CompetencyActivityOut,
    dependencies=[Depends(require_admin)],
)
def create_activity(payload: CompetencyActivityCreate, db: Session = Depends(get_db)):
    _require_activity_type(db, payload.tipo)
    activity = CompetencyActivity(**payload.model_dump())
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return _activity_out(activity)


@router.put(
    "/activities/{activity_id}",
    response_model=CompetencyActivityOut,
    dependencies=[Depends(require_admin)],
)
def update_activity(activity_id: int, payload: CompetencyActivityUpdate, db: Session = Depends(get_db)):
    activity = db.get(CompetencyActivity, activity_id)
    if activity is None:
        raise HTTPException(404, "Atividade não encontrada.")
    updates = payload.model_dump(exclude_unset=True)
    active_update = updates.pop("ativa", None)
    if "tipo" in updates and updates["tipo"] != activity.tipo:
        _require_activity_type(db, updates["tipo"])
    candidate = CompetencyActivityCreate.model_validate({
        "nome": updates.get("nome", activity.nome),
        "descricao": updates.get("descricao", activity.descricao),
        "tipo": updates.get("tipo", activity.tipo),
        "escopo_tipo_campo": updates.get("escopo_tipo_campo", activity.escopo_tipo_campo),
        "escopo_opcoes": updates.get("escopo_opcoes", activity.escopo_opcoes or []),
        "escopo_valor": updates.get("escopo_valor", activity.escopo_valor),
        "ordem": updates.get("ordem", activity.ordem),
    })
    normalized = candidate.model_dump()
    for key in updates:
        setattr(activity, key, normalized[key])
    if active_update is not None:
        activity.ativa = active_update
    db.commit()
    db.refresh(activity)
    return _activity_out(activity, include_inactive=True)


@router.delete(
    "/activities/{activity_id}",
    dependencies=[Depends(require_admin)],
)
def delete_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.get(CompetencyActivity, activity_id)
    if activity is None:
        raise HTTPException(404, "Atividade não encontrada.")
    assessment_count = db.scalar(
        select(func.count())
        .select_from(CompetencyAssessment)
        .join(CompetencySituation, CompetencyAssessment.situacao_id == CompetencySituation.id)
        .where(CompetencySituation.atividade_id == activity_id)
    ) or 0
    if assessment_count:
        raise HTTPException(409, "Esta atividade possui avaliações. Desative-a para preservar o histórico.")
    db.delete(activity)
    db.commit()
    return {"ok": True}


@router.post(
    "/activities/{activity_id}/situations",
    response_model=CompetencySituationOut,
    dependencies=[Depends(require_admin)],
)
def create_situation(
    activity_id: int,
    payload: CompetencySituationCreate,
    db: Session = Depends(get_db),
):
    activity = db.get(CompetencyActivity, activity_id)
    if activity is None:
        raise HTTPException(404, "Atividade não encontrada.")
    situation = CompetencySituation(atividade_id=activity_id, **payload.model_dump())
    db.add(situation)
    db.commit()
    db.refresh(situation)
    return _situation_out(situation)


@router.put(
    "/situations/{situation_id}",
    response_model=CompetencySituationOut,
    dependencies=[Depends(require_admin)],
)
def update_situation(
    situation_id: int,
    payload: CompetencySituationUpdate,
    db: Session = Depends(get_db),
):
    situation = db.get(CompetencySituation, situation_id)
    if situation is None:
        raise HTTPException(404, "Situação não encontrada.")
    updates = payload.model_dump(exclude_unset=True)
    active_update = updates.pop("ativa", None)
    candidate = CompetencySituationCreate.model_validate({
        "nome": updates.get("nome", situation.nome),
        "contexto": updates.get("contexto", situation.contexto),
        "procedimento_esperado": updates.get("procedimento_esperado", situation.procedimento_esperado),
        "procedimento_tipo_campo": updates.get("procedimento_tipo_campo", situation.procedimento_tipo_campo),
        "procedimento_opcoes": updates.get("procedimento_opcoes", situation.procedimento_opcoes or []),
        "procedimento_valor": updates.get("procedimento_valor", situation.procedimento_valor),
        "pontos_maximos": updates.get("pontos_maximos", situation.pontos_maximos),
        "tipo_campo": updates.get("tipo_campo", situation.tipo_campo),
        "opcoes": updates.get("opcoes", situation.opcoes or []),
        "ordem": updates.get("ordem", situation.ordem),
    })
    if "pontos_maximos" in updates:
        awarded_max = db.scalar(
            select(func.max(CompetencyAssessment.pontos)).where(
                CompetencyAssessment.situacao_id == situation_id,
            )
        )
        if awarded_max is not None and updates["pontos_maximos"] < awarded_max:
            raise HTTPException(422, f"Já existe avaliação com {awarded_max:g} pontos nesta situação.")
    normalized = candidate.model_dump()
    for key in updates:
        setattr(situation, key, normalized[key])
    if active_update is not None:
        situation.ativa = active_update
    db.commit()
    db.refresh(situation)
    return _situation_out(situation)


@router.delete(
    "/situations/{situation_id}",
    dependencies=[Depends(require_admin)],
)
def delete_situation(situation_id: int, db: Session = Depends(get_db)):
    situation = db.get(CompetencySituation, situation_id)
    if situation is None:
        raise HTTPException(404, "Situação não encontrada.")
    assessment_count = db.scalar(
        select(func.count()).select_from(CompetencyAssessment).where(
            CompetencyAssessment.situacao_id == situation_id,
        )
    ) or 0
    if assessment_count:
        raise HTTPException(409, "Esta situação possui avaliações. Desative-a para preservar o histórico.")
    db.delete(situation)
    db.commit()
    return {"ok": True}


@router.get("/matrix", response_model=list[CompetencyTechnicianSummary], dependencies=[Depends(require_session)])
def competency_matrix(
    unidade_slug: str | None = Query(None),
    db: Session = Depends(get_db),
):
    activities = _catalog(db)
    situations = [s for activity in activities for s in activity.situacoes if s.ativa]
    tech_stmt = select(Technician).where(Technician.ativo.is_(True))
    if unidade_slug:
        tech_stmt = tech_stmt.where(
            or_(Technician.unidade_slug == unidade_slug, Technician.unidade_slug.is_(None))
        )
    technicians = list(db.scalars(tech_stmt.order_by(Technician.nome_completo)).all())
    aggregated = _aggregated_assessments(db, {tech.users_id for tech in technicians})
    summaries = [_summary(tech, situations, aggregated) for tech in technicians]
    return sorted(summaries, key=lambda item: (-item.percentual, -item.situacoes_avaliadas, item.nome.casefold()))


@router.get(
    "/technicians/{users_id}",
    response_model=CompetencyTechnicianDetail,
    dependencies=[Depends(require_session)],
)
def technician_competencies(users_id: int, db: Session = Depends(get_db)):
    technician = db.get(Technician, users_id)
    if technician is None:
        raise HTTPException(404, "Técnico não encontrado.")
    activities = _catalog(db)
    situations = [s for activity in activities for s in activity.situacoes if s.ativa]
    aggregated = _aggregated_assessments(db, {users_id})
    base = _summary(technician, situations, aggregated)
    activity_progress: list[CompetencyActivityProgress] = []
    for activity in activities:
        activity_situations = [s for s in activity.situacoes if s.ativa]
        situation_progress: list[CompetencySituationProgress] = []
        for situation in activity_situations:
            agg = aggregated.get((users_id, situation.id))
            situation_progress.append(CompetencySituationProgress(
                id=situation.id,
                nome=situation.nome,
                contexto=situation.contexto,
                procedimento_esperado=situation.procedimento_esperado,
                procedimento_tipo_campo=situation.procedimento_tipo_campo,
                procedimento_opcoes=situation.procedimento_opcoes or [],
                procedimento_valor=_content_value(
                    situation.procedimento_valor,
                    situation.procedimento_esperado,
                    situation.procedimento_tipo_campo,
                ),
                pontos_maximos=situation.pontos_maximos,
                tipo_campo=situation.tipo_campo,
                opcoes=situation.opcoes or [],
                pontos=min(agg.pontos, situation.pontos_maximos) if agg else 0,
                avaliada=agg is not None,
                n_avaliacoes=len(agg.avaliacoes) if agg else 0,
                avaliacoes=[_redact(a) for a in agg.avaliacoes] if agg else [],
            ))
        max_points = sum(s.pontos_maximos for s in activity_situations)
        points = sum(s.pontos for s in situation_progress)
        evaluated = sum(s.avaliada for s in situation_progress)
        activity_progress.append(CompetencyActivityProgress(
            id=activity.id,
            nome=activity.nome,
            descricao=activity.descricao,
            escopo_tipo_campo=activity.escopo_tipo_campo,
            escopo_opcoes=activity.escopo_opcoes or [],
            escopo_valor=_content_value(activity.escopo_valor, activity.descricao, activity.escopo_tipo_campo),
            pontos=round(points, 1),
            pontos_maximos=round(max_points, 1),
            percentual=round(points / max_points * 100, 1) if max_points else 0,
            situacoes_avaliadas=evaluated,
            situacoes_total=len(activity_situations),
            situacoes=situation_progress,
        ))
    return CompetencyTechnicianDetail(**base.model_dump(), atividades=activity_progress)


@router.post(
    "/assessments",
    response_model=CompetencyAssessmentOut,
)
def create_assessment(
    payload: CompetencyAssessmentCreate,
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
):
    if current.subject_type == "tecnico" and payload.users_id == current.users_id:
        raise HTTPException(422, "Você não pode avaliar a si mesmo.")

    technician = db.get(Technician, payload.users_id)
    if technician is None:
        raise HTTPException(404, "Técnico não encontrado.")
    situation = db.get(CompetencySituation, payload.situacao_id)
    if situation is None or not situation.ativa:
        raise HTTPException(404, "Situação ativa não encontrada.")
    options = {str(option["valor"]): option for option in (situation.opcoes or [])}
    if situation.tipo_campo == "escala":
        if payload.pontos is None:
            raise HTTPException(422, "Informe a pontuação demonstrada.")
        awarded_points = payload.pontos
    elif situation.tipo_campo == "sim_nao":
        if not isinstance(payload.resposta, bool):
            raise HTTPException(422, "Responda sim ou não.")
        awarded_points = situation.pontos_maximos if payload.resposta else 0.0
    elif situation.tipo_campo in {"radio", "selecao"}:
        if not isinstance(payload.resposta, str) or payload.resposta not in options:
            raise HTTPException(422, "Selecione uma opção válida.")
        awarded_points = float(options[payload.resposta]["pontos"])
    elif situation.tipo_campo == "multipla_selecao":
        if not isinstance(payload.resposta, list) or not payload.resposta or not all(isinstance(value, str) for value in payload.resposta):
            raise HTTPException(422, "Selecione uma ou mais opções válidas.")
        selected = set(payload.resposta)
        if len(selected) != len(payload.resposta) or not selected.issubset(options):
            raise HTTPException(422, "A seleção contém opções inválidas ou repetidas.")
        awarded_points = min(
            situation.pontos_maximos,
            sum(float(options[value]["pontos"]) for value in selected),
        )
    else:
        raise HTTPException(422, "Tipo de avaliação não suportado.")
    if awarded_points > situation.pontos_maximos:
        raise HTTPException(422, f"A pontuação máxima desta situação é {situation.pontos_maximos:g}.")

    assessment_data = payload.model_dump(exclude={"anonimo"})
    assessment_data["pontos"] = awarded_points
    is_tecnico = current.subject_type == "tecnico"
    assessment = CompetencyAssessment(
        **assessment_data,
        avaliado_por=current.nome_completo or "Admin",
        avaliador_users_id=current.users_id if is_tecnico else None,
        # Admin nao tem opcao de anonimato - so tecnico avaliando colega.
        anonimo=payload.anonimo if is_tecnico else False,
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return _redact(assessment)


@router.get(
    "/technicians/{users_id}/history",
    response_model=list[CompetencyAssessmentOut],
    dependencies=[Depends(require_session)],
)
def assessment_history(users_id: int, db: Session = Depends(get_db)):
    assessments = db.scalars(
        select(CompetencyAssessment)
        .where(CompetencyAssessment.users_id == users_id)
        .order_by(CompetencyAssessment.avaliado_em.desc(), CompetencyAssessment.id.desc())
    ).all()
    return [_redact(a) for a in assessments]
