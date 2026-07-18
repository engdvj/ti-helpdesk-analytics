from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.app.db import Base
from api.app.models.technician import Technician
from api.app.routers.competencies import (
    competency_matrix,
    create_activity,
    create_assessment,
    create_situation,
    delete_activity,
    delete_situation,
    technician_competencies,
)
from api.app.schemas.competency import (
    CompetencyActivityCreate,
    CompetencyAssessmentCreate,
    CompetencySituationCreate,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine)
    session.add_all([
        Technician(
            users_id=1,
            username="ana",
            nome_completo="Ana Silva",
            glpi_profile="Technician",
            papel="plantonista",
            ativo=True,
            unidade_slug="hospital-a",
        ),
        Technician(
            users_id=2,
            username="bruno",
            nome_completo="Bruno Lima",
            glpi_profile="Technician",
            papel="plantonista",
            ativo=True,
            unidade_slug=None,
        ),
    ])
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _catalog(db: Session):
    activity = create_activity(
        CompetencyActivityCreate(nome="Impressoras", descricao="Instalação e diagnóstico"),
        db,
    )
    first = create_situation(
        activity.id,
        CompetencySituationCreate(
            nome="Impressora sem comunicação",
            contexto="A estação não encontra a impressora de rede.",
            procedimento_esperado="Validar IP, conectividade, fila e driver.",
            pontos_maximos=4,
        ),
        db,
    )
    second = create_situation(
        activity.id,
        CompetencySituationCreate(
            nome="Fila de impressão travada",
            procedimento_esperado="Limpar spooler e validar a causa antes de reiniciar.",
            pontos_maximos=2,
        ),
        db,
    )
    return activity, first, second


def test_progress_uses_latest_assessment_and_preserves_history(db: Session):
    _, first, second = _catalog(db)
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=2, evidencia="Executou com apoio"),
        "admin",
        db,
    )
    latest = create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=4, evidencia="Executou sozinho"),
        "admin",
        db,
    )

    detail = technician_competencies(1, db)

    assert detail.pontos == 4
    assert detail.pontos_maximos == 6
    assert detail.percentual == 66.7
    assert detail.situacoes_avaliadas == 1
    assert detail.nivel == "competente"
    assert detail.atividades[0].situacoes[0].ultima_avaliacao.id == latest.id
    assert detail.atividades[0].situacoes[1].avaliada is False

    assessments = db.query(type(latest)).filter_by(users_id=1, situacao_id=first.id).all()
    assert len(assessments) == 2
    assert second.pontos_maximos == 2


def test_matrix_respects_unit_and_orders_by_progress(db: Session):
    _, first, _ = _catalog(db)
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=4),
        "coordenacao",
        db,
    )

    matrix = competency_matrix("hospital-a", db)

    assert [item.users_id for item in matrix] == [1, 2]
    assert matrix[0].percentual > matrix[1].percentual
    assert matrix[1].nivel == "nao_avaliado"


def test_assessment_cannot_exceed_situation_maximum(db: Session):
    _, first, _ = _catalog(db)

    with pytest.raises(HTTPException) as exc_info:
        create_assessment(
            CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=5),
            "admin",
            db,
        )

    assert exc_info.value.status_code == 422
    assert "máxima" in exc_info.value.detail


def test_option_fields_compute_points_on_server(db: Session):
    activity = create_activity(
        CompetencyActivityCreate(nome="Acessos", tipo="sistema"),
        db,
    )
    radio = create_situation(
        activity.id,
        CompetencySituationCreate(
            nome="Restaurar acesso",
            procedimento_esperado="Validar identidade e aplicar o procedimento seguro.",
            pontos_maximos=4,
            tipo_campo="radio",
            opcoes=[
                {"valor": "apoio", "rotulo": "Executa com apoio", "pontos": 2},
                {"valor": "autonomo", "rotulo": "Executa com autonomia", "pontos": 4},
            ],
        ),
        db,
    )
    multiple = create_situation(
        activity.id,
        CompetencySituationCreate(
            nome="Validar etapas",
            procedimento_esperado="Demonstrar as etapas aplicáveis.",
            pontos_maximos=5,
            tipo_campo="multipla_selecao",
            opcoes=[
                {"valor": "identidade", "rotulo": "Valida identidade", "pontos": 2},
                {"valor": "registro", "rotulo": "Registra evidência", "pontos": 4},
            ],
        ),
        db,
    )

    radio_result = create_assessment(
        CompetencyAssessmentCreate(
            users_id=1,
            situacao_id=radio.id,
            pontos=99,
            resposta="autonomo",
        ),
        "admin",
        db,
    )
    multiple_result = create_assessment(
        CompetencyAssessmentCreate(
            users_id=1,
            situacao_id=multiple.id,
            resposta=["identidade", "registro"],
        ),
        "admin",
        db,
    )

    assert radio_result.pontos == 4
    assert radio_result.resposta == "autonomo"
    assert multiple_result.pontos == 5
    assert multiple_result.resposta == ["identidade", "registro"]


def test_delete_is_permanent_only_without_assessment_history(db: Session):
    activity, assessed, _ = _catalog(db)
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=assessed.id, pontos=2),
        "admin",
        db,
    )

    with pytest.raises(HTTPException) as situation_error:
        delete_situation(assessed.id, db)
    with pytest.raises(HTTPException) as activity_error:
        delete_activity(activity.id, db)

    assert situation_error.value.status_code == 409
    assert activity_error.value.status_code == 409

    disposable = create_activity(CompetencyActivityCreate(nome="Temporária"), db)
    disposable_situation = create_situation(
        disposable.id,
        CompetencySituationCreate(nome="Sem histórico", procedimento_esperado="Testar e remover."),
        db,
    )
    assert delete_situation(disposable_situation.id, db) == {"ok": True}
    assert delete_activity(disposable.id, db) == {"ok": True}
