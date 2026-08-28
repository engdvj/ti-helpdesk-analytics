from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.app.db import Base
from api.app.models.technician import Technician
from api.app.models.competency import CompetencyActivityType, CompetencyAssessment
from api.app.routers.auth import CurrentIdentity
from api.app.routers.competencies import (
    assessment_history,
    competency_matrix,
    create_activity,
    create_activity_type,
    create_assessment,
    create_situation,
    delete_activity,
    delete_activity_type,
    delete_situation,
    technician_competencies,
    update_activity_type,
)
from api.app.schemas.competency import (
    CompetencyActivityCreate,
    CompetencyActivityTypeCreate,
    CompetencyActivityTypeUpdate,
    CompetencyAssessmentCreate,
    CompetencySituationCreate,
)


ADMIN = CurrentIdentity(subject_type="admin", users_id=None, nome_completo="Admin")


def _tecnico(users_id: int, nome: str) -> CurrentIdentity:
    return CurrentIdentity(subject_type="tecnico", users_id=users_id, nome_completo=nome)


@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine)
    session.add_all([
        CompetencyActivityType(slug="operacional", nome="Operacional", cor="#58a6ff"),
        CompetencyActivityType(slug="sistema", nome="Sistema", cor="#69b5e4"),
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
        Technician(
            users_id=3,
            username="carla",
            nome_completo="Carla Souza",
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
        ADMIN,
        db,
    )
    latest = create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=4, evidencia="Executou sozinho"),
        ADMIN,
        db,
    )

    detail = technician_competencies(1, db)

    assert detail.pontos == 4
    assert detail.pontos_maximos == 6
    assert detail.percentual == 66.7
    assert detail.situacoes_avaliadas == 1
    assert detail.nivel == "competente"
    # Mesmo avaliador (admin) reavaliando a mesma situacao colapsa pra uma so
    # entrada (a mais recente) - nao vira "2 avaliadores", so 2 no historico.
    assert detail.atividades[0].situacoes[0].n_avaliacoes == 1
    assert detail.atividades[0].situacoes[0].avaliacoes[0].id == latest.id
    assert detail.atividades[0].situacoes[1].avaliada is False

    assessments = db.query(CompetencyAssessment).filter_by(users_id=1, situacao_id=first.id).all()
    assert len(assessments) == 2
    assert second.pontos_maximos == 2


def test_matrix_respects_unit_and_orders_by_progress(db: Session):
    _, first, _ = _catalog(db)
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=4),
        ADMIN,
        db,
    )

    matrix = competency_matrix("hospital-a", db)

    # tecnico 3 (Carla) tambem atua "em todo o complexo" (unidade_slug=None,
    # mesmo criterio do Bruno) - entra no filtro por hospital-a igual.
    assert [item.users_id for item in matrix] == [1, 2, 3]
    assert matrix[0].percentual > matrix[1].percentual
    assert matrix[1].nivel == "nao_avaliado"


def test_assessment_cannot_exceed_situation_maximum(db: Session):
    _, first, _ = _catalog(db)

    with pytest.raises(HTTPException) as exc_info:
        create_assessment(
            CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=5),
            ADMIN,
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
        ADMIN,
        db,
    )
    multiple_result = create_assessment(
        CompetencyAssessmentCreate(
            users_id=1,
            situacao_id=multiple.id,
            resposta=["identidade", "registro"],
        ),
        ADMIN,
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
        ADMIN,
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


def test_activity_types_have_crud_and_cannot_be_deleted_while_in_use(db: Session):
    activity_type = create_activity_type(
        CompetencyActivityTypeCreate(
            nome="Infraestrutura clínica",
            descricao="Equipamentos ligados ao atendimento.",
            cor="#22aa88",
            ordem=3,
        ),
        db,
    )
    assert activity_type.slug == "infraestrutura-clinica"

    updated = update_activity_type(
        activity_type.id,
        CompetencyActivityTypeUpdate(nome="Infraestrutura hospitalar", cor="#119977"),
        db,
    )
    assert updated.nome == "Infraestrutura hospitalar"
    assert updated.cor == "#119977"

    create_activity(
        CompetencyActivityCreate(nome="Configurar leito", tipo=activity_type.slug),
        db,
    )
    with pytest.raises(HTTPException) as exc_info:
        delete_activity_type(activity_type.id, db)
    assert exc_info.value.status_code == 409


def test_scope_and_procedure_accept_configurable_content_fields(db: Session):
    activity = create_activity(
        CompetencyActivityCreate(
            nome="Acesso seguro",
            tipo="sistema",
            descricao="Validação de identidade",
            escopo_tipo_campo="radio",
            escopo_opcoes=[
                {"valor": "local", "rotulo": "Acesso local"},
                {"valor": "remoto", "rotulo": "Acesso remoto"},
            ],
            escopo_valor="remoto",
        ),
        db,
    )
    situation = create_situation(
        activity.id,
        CompetencySituationCreate(
            nome="Restabelecer credencial",
            procedimento_esperado="Validar identidade e registrar",
            procedimento_tipo_campo="multipla_selecao",
            procedimento_opcoes=[
                {"valor": "identidade", "rotulo": "Validar identidade"},
                {"valor": "registro", "rotulo": "Registrar evidência"},
            ],
            procedimento_valor=["identidade", "registro"],
            tipo_campo="sim_nao",
        ),
        db,
    )

    assert activity.escopo_tipo_campo == "radio"
    assert activity.escopo_valor == "remoto"
    assert situation.procedimento_tipo_campo == "multipla_selecao"
    assert situation.procedimento_valor == ["identidade", "registro"]

    detail = technician_competencies(1, db)
    progress = detail.atividades[0]
    assert progress.escopo_opcoes[1].rotulo == "Acesso remoto"
    assert progress.situacoes[0].procedimento_opcoes[0].rotulo == "Validar identidade"


def test_tecnico_pode_avaliar_colega(db: Session):
    _, first, _ = _catalog(db)
    result = create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=3),
        _tecnico(2, "Bruno Lima"),
        db,
    )
    assert result.avaliador_users_id == 2
    assert result.avaliado_por == "Bruno Lima"


def test_tecnico_nao_pode_avaliar_a_si_mesmo(db: Session):
    _, first, _ = _catalog(db)
    with pytest.raises(HTTPException) as exc_info:
        create_assessment(
            CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=3),
            _tecnico(1, "Ana Silva"),
            db,
        )
    assert exc_info.value.status_code == 422


def test_nota_final_e_a_media_entre_avaliadores_distintos(db: Session):
    _, first, _ = _catalog(db)
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=2),
        _tecnico(2, "Bruno Lima"),
        db,
    )
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=4),
        _tecnico(3, "Carla Souza"),
        db,
    )

    detail = technician_competencies(1, db)
    situacao = detail.atividades[0].situacoes[0]
    assert situacao.n_avaliacoes == 2
    assert situacao.pontos == 3  # media de 2 e 4


def test_mesmo_avaliador_reavaliando_substitui_a_propria_nota_na_media(db: Session):
    _, first, _ = _catalog(db)
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=1),
        _tecnico(2, "Bruno Lima"),
        db,
    )
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=4),
        _tecnico(2, "Bruno Lima"),
        db,
    )
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=4),
        _tecnico(3, "Carla Souza"),
        db,
    )

    detail = technician_competencies(1, db)
    situacao = detail.atividades[0].situacoes[0]
    # 2 avaliadores distintos (Bruno, Carla), nao 3 avaliacoes - a primeira
    # nota do Bruno (1) foi substituida pela segunda (4), nao somada.
    assert situacao.n_avaliacoes == 2
    assert situacao.pontos == 4  # media de 4 e 4, nao (1+4+4)/3


def test_avaliacao_anonima_esconde_identidade_em_toda_leitura(db: Session):
    _, first, _ = _catalog(db)
    create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=3, anonimo=True),
        _tecnico(2, "Bruno Lima"),
        db,
    )

    detail = technician_competencies(1, db)
    avaliacao = detail.atividades[0].situacoes[0].avaliacoes[0]
    assert avaliacao.avaliado_por == "Anônimo"
    assert avaliacao.avaliador_users_id is None

    historico = assessment_history(1, db)
    assert historico[0].avaliado_por == "Anônimo"
    assert historico[0].avaliador_users_id is None


def test_admin_nunca_fica_anonimo_mesmo_pedindo(db: Session):
    _, first, _ = _catalog(db)
    result = create_assessment(
        CompetencyAssessmentCreate(users_id=1, situacao_id=first.id, pontos=3, anonimo=True),
        ADMIN,
        db,
    )
    assert result.anonimo is False
    assert result.avaliado_por == "Admin"
