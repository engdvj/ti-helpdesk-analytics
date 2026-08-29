from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.app.db import Base
from api.app.models.computer import Computer
from api.app.models.sector import Sector
from api.app.models.technician import Technician
from api.app.seed import seed_preventiva_checklist_items
from api.app.services import ciclos
from api.app.services.ciclos import (
    ComputerAlreadyInOpenCycleError,
    DEFAULT_RECONFIRMACAO_CHECKLIST_ITEMS as RECONFIRMACAO_CHECKLIST_ITEMS,
    InvalidTransitionError,
    ItemStatus,
    Resultado,
    TransitionPreconditionError,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    session.add_all([
        Technician(users_id=1, username="responsavel", nome_completo="Responsável Um", papel="tatico"),
        Technician(users_id=2, username="tecnico", nome_completo="Técnico Dois", papel="plantonista"),
        Sector(id_glpi=1, nome="Nutrição", entities_id=2, unidade_slug="hgvc", ativo=True),
    ])
    session.commit()
    seed_preventiva_checklist_items(session)
    session.add(Computer(id=1, patrimonio="PAT-001", setor_atual_id=1, criado_em=ciclos.utc_now()))
    session.commit()
    yield session
    session.close()


def _reconfirmar_ok(db, item):
    return ciclos.reconfirmar_item(db, item, marcas={label: True for label in RECONFIRMACAO_CHECKLIST_ITEMS})


def test_criar_ciclo_inicializa_checklist_de_planejamento(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo Agosto", data_prevista_encerramento=None, responsavel_id=1)
    assert ciclo.status == "planejamento"
    assert len(ciclo.planejamento_itens) == 6
    assert all(item["ok"] is False for item in ciclo.planejamento_itens)


def test_criar_ciclo_rejeita_responsavel_inexistente(db):
    with pytest.raises(TransitionPreconditionError):
        ciclos.criar_ciclo(db, nome="X", data_prevista_encerramento=None, responsavel_id=999)


def test_criar_ciclo_guarda_intervalos_por_prioridade(db):
    padrao = ciclos.criar_ciclo(db, nome="Padrão", data_prevista_encerramento=None, responsavel_id=1)
    assert (padrao.intervalo_alta_meses, padrao.intervalo_normal_meses, padrao.intervalo_baixa_meses) == (3, 6, 12)

    custom = ciclos.criar_ciclo(
        db, nome="Custom", data_prevista_encerramento=None, responsavel_id=1,
        intervalo_alta_meses=1, intervalo_normal_meses=4, intervalo_baixa_meses=18,
    )
    assert (custom.intervalo_alta_meses, custom.intervalo_normal_meses, custom.intervalo_baixa_meses) == (1, 4, 18)


def test_criar_ciclo_guarda_datas_inicio_e_fim(db):
    ciclo = ciclos.criar_ciclo(
        db, nome="C", data_inicio=date(2026, 9, 1),
        data_prevista_encerramento=date(2026, 9, 30), responsavel_id=1,
    )
    assert ciclo.data_inicio == date(2026, 9, 1)
    assert ciclo.data_prevista_encerramento == date(2026, 9, 30)


def test_criar_ciclo_rejeita_fim_antes_do_inicio(db):
    with pytest.raises(TransitionPreconditionError, match="anterior à data de início"):
        ciclos.criar_ciclo(
            db, nome="C", data_inicio=date(2026, 9, 30),
            data_prevista_encerramento=date(2026, 9, 1), responsavel_id=1,
        )


def test_excluir_ciclo_apaga_ciclo_e_itens(db):
    from api.app.models.maintenance_cycle import MaintenanceCycle
    from api.app.models.maintenance_cycle_item import MaintenanceCycleItem

    ciclo = ciclos.criar_ciclo(db, nome="C", data_prevista_encerramento=None, responsavel_id=1)
    ciclos.adicionar_item(db, ciclo, computador_id=1)
    ciclo_id = ciclo.id

    ciclos.excluir_ciclo(db, ciclo)

    assert db.get(MaintenanceCycle, ciclo_id) is None
    assert db.query(MaintenanceCycleItem).filter(MaintenanceCycleItem.ciclo_id == ciclo_id).count() == 0
    # computador liberado - pode entrar em outro ciclo
    novo = ciclos.criar_ciclo(db, nome="C2", data_prevista_encerramento=None, responsavel_id=1)
    ciclos.adicionar_item(db, novo, computador_id=1)


def test_executar_item_calcula_proxima_preventiva_pelo_intervalo_do_ciclo(db):
    ciclo = ciclos.criar_ciclo(
        db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1, intervalo_normal_meses=6,
    )
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)  # prioridade normal
    item = ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)
    item = _reconfirmar_ok(db, item)

    finalizado = ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.SEM_ACHADO, resumo=None, chamado_glpi=None,
        pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
        ponto_focal_data=None, rascunho=False,  # sem proxima_preventiva -> calcula
    )
    assert finalizado.proxima_preventiva == date(2027, 3, 1)  # 2026-09-01 + 6 meses


def test_adicionar_item_cria_planejado_prioridade_normal(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    assert item.status == ItemStatus.PLANEJADO.value
    assert item.prioridade == "normal"


def test_adicionar_item_rejeita_ciclo_encerrado(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    ciclo.status = "encerrado"
    db.commit()
    with pytest.raises(TransitionPreconditionError):
        ciclos.adicionar_item(db, ciclo, computador_id=1)


def test_adicionar_item_rejeita_computador_ja_em_ciclo_aberto(db):
    ciclo1 = ciclos.criar_ciclo(db, nome="Ciclo 1", data_prevista_encerramento=None, responsavel_id=1)
    ciclos.adicionar_item(db, ciclo1, computador_id=1)
    ciclo2 = ciclos.criar_ciclo(db, nome="Ciclo 2", data_prevista_encerramento=None, responsavel_id=1)
    with pytest.raises(ComputerAlreadyInOpenCycleError):
        ciclos.adicionar_item(db, ciclo2, computador_id=1)


def test_adicionar_item_rejeita_computador_desativado(db):
    db.get(Computer, 1).ativo = False
    db.commit()
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    with pytest.raises(TransitionPreconditionError):
        ciclos.adicionar_item(db, ciclo, computador_id=1)


def test_adicionar_item_aceita_tecnico_pre_atribuido(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1, tecnico_id=2)
    assert item.status == ItemStatus.PLANEJADO.value  # tecnico nao confirma sozinho, so junto com data
    assert item.tecnico_id == 2


def test_adicionar_item_rejeita_tecnico_inexistente(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    with pytest.raises(TransitionPreconditionError):
        ciclos.adicionar_item(db, ciclo, computador_id=1, tecnico_id=999)


def test_remover_item_apaga_item_nao_finalizado(db):
    from api.app.models.maintenance_cycle_item import MaintenanceCycleItem

    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item_id = item.id

    ciclos.remover_item(db, item)

    assert db.get(MaintenanceCycleItem, item_id) is None
    # computador liberado - pode entrar em outro ciclo aberto
    ciclos.adicionar_item(db, ciclo, computador_id=1)


def test_remover_item_bloqueia_se_finalizado(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)
    item = ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.SEM_ACHADO, resumo=None, chamado_glpi=None,
        pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
        ponto_focal_data=None, rascunho=False,
    )
    with pytest.raises(TransitionPreconditionError, match="finalizado"):
        ciclos.remover_item(db, item)


def test_confirmar_item_exige_data_e_tecnico_juntos(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    with pytest.raises(TransitionPreconditionError):
        ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=None)


def test_confirmar_item_transicao_invalida_a_partir_de_concluido(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item.status = ItemStatus.CONCLUIDO.value
    db.commit()
    with pytest.raises(InvalidTransitionError):
        ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)


def test_confirmar_item_sucesso(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    confirmado = ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)
    assert confirmado.status == ItemStatus.CONFIRMADO.value
    assert confirmado.tecnico_id == 2
    assert confirmado.data_agendada == date(2026, 9, 1)


def test_reconfirmar_item_exige_status_confirmado(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)  # ainda Planejado
    with pytest.raises(TransitionPreconditionError):
        _reconfirmar_ok(db, item)


def test_reconfirmar_item_exige_todos_os_itens(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)
    with pytest.raises(TransitionPreconditionError):
        ciclos.reconfirmar_item(db, item, marcas={RECONFIRMACAO_CHECKLIST_ITEMS[0]: True})  # faltam os outros 5


def test_executar_item_bloqueado_sem_reconfirmacao_completa(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)
    with pytest.raises(TransitionPreconditionError, match="reconfirmação"):
        ciclos.executar_item(
            db, item, itens={}, resultado=Resultado.SEM_ACHADO, resumo=None, chamado_glpi=None,
            pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
            ponto_focal_data=None, proxima_preventiva=None, rascunho=False,
        )


def _confirmar_e_reconfirmar(db, item):
    item = ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)
    return _reconfirmar_ok(db, item)


def test_executar_item_rascunho_nao_muda_status(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)

    salvo = ciclos.executar_item(
        db, item, itens={ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS[0]: "ok"}, resultado=None, resumo=None,
        chamado_glpi=None, pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
        ponto_focal_data=None, proxima_preventiva=None, rascunho=True,
    )
    assert salvo.status == ItemStatus.CONFIRMADO.value
    assert salvo.execucao_status == "rascunho"


def test_executar_item_sem_achado_marca_concluido(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)

    finalizado = ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.SEM_ACHADO, resumo="Tudo certo", chamado_glpi=None,
        pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome="Maria",
        ponto_focal_data=date(2026, 9, 2), proxima_preventiva=date(2026, 12, 1), rascunho=False,
    )
    assert finalizado.status == ItemStatus.CONCLUIDO.value
    assert finalizado.execucao_status == "finalizado"


def test_executar_item_ja_finalizado_bloqueia_sem_permitir_edicao(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)
    item = ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.SEM_ACHADO, resumo=None, chamado_glpi=None,
        pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
        ponto_focal_data=None, proxima_preventiva=None, rascunho=False,
    )
    assert item.status == ItemStatus.CONCLUIDO.value

    with pytest.raises(TransitionPreconditionError):
        ciclos.executar_item(
            db, item,
            itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
            resultado=Resultado.AJUSTE_SIMPLES, resumo="tentativa de tecnico editar", chamado_glpi=None,
            pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
            ponto_focal_data=None, proxima_preventiva=None, rascunho=False, permitir_edicao=False,
        )


def test_executar_item_ja_finalizado_permite_edicao_do_admin(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)
    item = ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.SEM_ACHADO, resumo=None, chamado_glpi=None,
        pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
        ponto_focal_data=None, proxima_preventiva=None, rascunho=False,
    )

    corrigido = ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.CORRETIVA_ABERTA, resumo="correção do admin", chamado_glpi="999",
        pendencia_responsavel="João", pendencia_prazo=date(2026, 9, 20), ponto_focal_nome=None,
        ponto_focal_data=None, proxima_preventiva=None, rascunho=False, permitir_edicao=True,
    )
    assert corrigido.status == ItemStatus.PENDENTE.value
    assert corrigido.resumo == "correção do admin"


def test_executar_item_corretiva_exige_chamado_e_pendencia(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)

    with pytest.raises(TransitionPreconditionError, match="chamado GLPI"):
        ciclos.executar_item(
            db, item,
            itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
            resultado=Resultado.CORRETIVA_ABERTA, resumo=None, chamado_glpi=None,
            pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
            ponto_focal_data=None, proxima_preventiva=None, rascunho=False,
        )


def test_executar_item_corretiva_marca_pendente(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)

    finalizado = ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.CORRETIVA_ABERTA, resumo="Fonte queimada", chamado_glpi="12345",
        pendencia_responsavel="João", pendencia_prazo=date(2026, 9, 10), ponto_focal_nome=None,
        ponto_focal_data=None, proxima_preventiva=None, rascunho=False,
    )
    assert finalizado.status == ItemStatus.PENDENTE.value


def test_remarcar_item_exige_motivo(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)
    with pytest.raises(TransitionPreconditionError):
        ciclos.remarcar_item(db, item, motivo="   ", nova_data=None)


def test_remarcar_e_reagendar_volta_ao_fluxo_normal(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    ciclos.confirmar_item(db, item, data_agendada=date(2026, 9, 1), tecnico_id=2)

    remarcado = ciclos.remarcar_item(db, item, motivo="Setor não liberou o PC", nova_data=None)
    assert remarcado.status == ItemStatus.REMARCADO.value
    assert remarcado.data_agendada is None

    reagendado = ciclos.confirmar_item(db, remarcado, data_agendada=date(2026, 9, 15), tecnico_id=2)
    assert reagendado.status == ItemStatus.CONFIRMADO.value
    assert reagendado.data_agendada == date(2026, 9, 15)


def test_fechar_ciclo_rejeita_ciclo_vazio(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    with pytest.raises(TransitionPreconditionError):
        ciclos.fechar_ciclo(db, ciclo)


def test_fechar_ciclo_bloqueia_item_nao_resolvido(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    ciclos.adicionar_item(db, ciclo, computador_id=1)  # continua Planejado
    with pytest.raises(TransitionPreconditionError, match="pendentes"):
        ciclos.fechar_ciclo(db, ciclo)


def test_fechar_ciclo_bloqueia_pendente_sem_responsavel_e_prazo(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)
    ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.INTERROMPIDO, resumo=None, chamado_glpi="999",
        pendencia_responsavel="João", pendencia_prazo=date(2026, 9, 10), ponto_focal_nome=None,
        ponto_focal_data=None, proxima_preventiva=None, rascunho=False,
    )
    # forcar um estado invalido (pendente sem responsavel/prazo) pra provar o gate
    item.pendencia_responsavel = None
    db.commit()
    with pytest.raises(TransitionPreconditionError):
        ciclos.fechar_ciclo(db, ciclo)


def test_fechar_ciclo_sucesso_quando_tudo_resolvido(db):
    ciclo = ciclos.criar_ciclo(db, nome="Ciclo", data_prevista_encerramento=None, responsavel_id=1)
    item = ciclos.adicionar_item(db, ciclo, computador_id=1)
    item = _confirmar_e_reconfirmar(db, item)
    ciclos.executar_item(
        db, item,
        itens={label: "ok" for label in ciclos.DEFAULT_EXECUCAO_CHECKLIST_ITEMS},
        resultado=Resultado.SEM_ACHADO, resumo=None, chamado_glpi=None,
        pendencia_responsavel=None, pendencia_prazo=None, ponto_focal_nome=None,
        ponto_focal_data=None, proxima_preventiva=None, rascunho=False,
    )
    fechado = ciclos.fechar_ciclo(db, ciclo)
    assert fechado.status == "encerrado"
