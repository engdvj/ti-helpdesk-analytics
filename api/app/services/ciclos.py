"""State machine dos ciclos de manutencao preventiva - docs/requisitos.md
Épico C. Toda regra de transicao mora aqui, nunca no model nem no router
(ver .claude/docs/standards/backend.md §2.1/§4). Servico levanta excecao de
dominio, o router traduz pra HTTPException - mesmo padrao de
CollectionAlreadyRunningError em services/collection_jobs.py."""
from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.checklist_item_def import ChecklistItemDef
from api.app.models.computer import Computer
from api.app.models.maintenance_cycle import MaintenanceCycle
from api.app.models.maintenance_cycle_item import MaintenanceCycleItem
from api.app.models.technician import Technician


class ItemStatus(str, Enum):
    PLANEJADO = "planejado"
    CONFIRMADO = "confirmado"
    CONCLUIDO = "concluido"
    REMARCADO = "remarcado"
    PENDENTE = "pendente"


class Prioridade(str, Enum):
    ALTA = "alta"
    NORMAL = "normal"
    BAIXA = "baixa"


class Resultado(str, Enum):
    SEM_ACHADO = "sem_achado"
    AJUSTE_SIMPLES = "ajuste_simples"
    CORRETIVA_ABERTA = "corretiva_aberta"
    INTERROMPIDO = "interrompido"


_RESULTADOS_QUE_EXIGEM_PENDENCIA = {Resultado.CORRETIVA_ABERTA, Resultado.INTERROMPIDO}

ALLOWED_TRANSITIONS: dict[ItemStatus, set[ItemStatus]] = {
    ItemStatus.PLANEJADO: {ItemStatus.CONFIRMADO},
    ItemStatus.CONFIRMADO: {ItemStatus.CONCLUIDO, ItemStatus.PENDENTE, ItemStatus.REMARCADO},
    ItemStatus.REMARCADO: {ItemStatus.CONFIRMADO},
    ItemStatus.CONCLUIDO: set(),  # terminal
    ItemStatus.PENDENTE: set(),  # terminal pro MVP - resolucao futura fica fora de escopo
}

# Tipos validos de ChecklistItemDef.tipo.
TIPO_PLANEJAMENTO = "planejamento"
TIPO_RECONFIRMACAO = "reconfirmacao"
TIPO_EXECUCAO = "execucao"
CHECKLIST_TIPOS = (TIPO_PLANEJAMENTO, TIPO_RECONFIRMACAO, TIPO_EXECUCAO)

# Vocabulario ORIGINAL dos 3 checklists do PDF - usado so como dado de seed
# (api/app/seed.py::seed_preventiva_checklist_items), nunca lido em runtime
# daqui pra frente. O catalogo de verdade mora em ChecklistItemDef (editavel
# pelo admin - docs/requisitos.md Épico C) e e sempre consultado via
# active_checklist_items().
DEFAULT_PLANEJAMENTO_CHECKLIST_ITEMS = [
    "Lista de computadores conferida no inventário",
    "Prioridades definidas (Alta, Normal ou Baixa)",
    "Quantidade compatível com a disponibilidade da equipe",
    "Responsável do setor e janela combinados com cada setor",
    "Cronograma registrado em local único",
    "Técnicos e chamados/tarefas preparados",
]

DEFAULT_RECONFIRMACAO_CHECKLIST_ITEMS = [
    "Setor confirmou data, horário e equipamentos que serão liberados",
    "Usuários foram orientados a salvar arquivos e encerrar sistemas",
    "Responsável do setor está identificado e disponível",
    "Chamados/tarefas estão abertos e vinculados aos computadores",
    "Ferramentas e materiais de limpeza aprovados estão disponíveis",
    "Existe alternativa de continuidade para computador crítico, quando necessária",
]

DEFAULT_EXECUCAO_CHECKLIST_ITEMS = [
    "Identificação, setor e chamado conferidos",
    "Usuário salvou o trabalho; condição inicial e sintomas foram registrados",
    "Equipamento, monitor, periféricos, cabos e fonte inspecionados",
    "Limpeza externa, ventilação, temperatura e ruídos verificados",
    "Inicialização e armazenamento verificados: saúde, alertas e espaço livre",
    "Sistema operacional e atualizações críticas verificados",
    "Antivírus/EDR institucional ativo e atualizado",
    "Rede, login e sistemas essenciais do setor testados",
    "Equipamento reiniciado e usuário/responsável do setor validou o uso",
    "Chamado, inventário e próxima preventiva atualizados",
]

# Agrupamento visual (ChecklistItemDef.secao) do vocabulario original -
# usado so no seed inicial (api/app/seed.py); dai pra frente e o admin quem
# edita. Texto -> secao, nao indice, pra nao depender de ordem.
DEFAULT_EXECUCAO_SECOES: dict[str, str] = {
    "Identificação, setor e chamado conferidos": "Abertura do atendimento",
    "Usuário salvou o trabalho; condição inicial e sintomas foram registrados": "Abertura do atendimento",
    "Equipamento, monitor, periféricos, cabos e fonte inspecionados": "Inspeção física",
    "Limpeza externa, ventilação, temperatura e ruídos verificados": "Inspeção física",
    "Inicialização e armazenamento verificados: saúde, alertas e espaço livre": "Diagnóstico do sistema",
    "Sistema operacional e atualizações críticas verificados": "Diagnóstico do sistema",
    "Antivírus/EDR institucional ativo e atualizado": "Diagnóstico do sistema",
    "Rede, login e sistemas essenciais do setor testados": "Testes funcionais",
    "Equipamento reiniciado e usuário/responsável do setor validou o uso": "Testes funcionais",
    "Chamado, inventário e próxima preventiva atualizados": "Fechamento",
}


class InvalidTransitionError(Exception):
    def __init__(self, current: ItemStatus, target: ItemStatus):
        super().__init__(f"transição inválida: {current.value} -> {target.value}")
        self.current = current
        self.target = target


class TransitionPreconditionError(Exception):
    pass


class ComputerAlreadyInOpenCycleError(Exception):
    def __init__(self, computador_id: int, ciclo_id: int):
        super().__init__(f"computador {computador_id} já está no ciclo aberto {ciclo_id}")
        self.computador_id = computador_id
        self.ciclo_id = ciclo_id


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _checklist_skeleton(labels: list[str]) -> list[dict]:
    return [{"item": label, "ok": False} for label in labels]


def active_checklist_items(db: Session, tipo: str) -> list[str]:
    """Textos ativos do catálogo (docs/requisitos.md Épico C), na ordem
    configurada pelo admin - fonte única usada tanto pra montar o esqueleto
    de um checklist novo quanto pra validar o que o cliente envia."""
    rows = db.scalars(
        select(ChecklistItemDef)
        .where(ChecklistItemDef.tipo == tipo, ChecklistItemDef.ativo.is_(True))
        .order_by(ChecklistItemDef.ordem, ChecklistItemDef.id)
    ).all()
    return [row.texto for row in rows]


def _require_transition(item: MaintenanceCycleItem, target: ItemStatus) -> None:
    current = ItemStatus(item.status)
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise InvalidTransitionError(current, target)


# ---------------------------------------------------------------------------
# Ciclo (C1, C5)
# ---------------------------------------------------------------------------

def criar_ciclo(
    db: Session,
    *,
    nome: str,
    data_prevista_encerramento: date | None,
    responsavel_id: int,
    data_inicio: date | None = None,
    intervalo_alta_meses: int = 3,
    intervalo_normal_meses: int = 6,
    intervalo_baixa_meses: int = 12,
) -> MaintenanceCycle:
    if db.get(Technician, responsavel_id) is None:
        raise TransitionPreconditionError("responsável designado não encontrado")
    for meses in (intervalo_alta_meses, intervalo_normal_meses, intervalo_baixa_meses):
        if meses < 1:
            raise TransitionPreconditionError("intervalo até a próxima preventiva precisa ser de pelo menos 1 mês")
    if data_inicio is not None and data_prevista_encerramento is not None and data_prevista_encerramento < data_inicio:
        raise TransitionPreconditionError("a data final não pode ser anterior à data de início")

    ciclo = MaintenanceCycle(
        nome=nome,
        data_inicio=data_inicio,
        data_prevista_encerramento=data_prevista_encerramento,
        responsavel_id=responsavel_id,
        status="planejamento",
        intervalo_alta_meses=intervalo_alta_meses,
        intervalo_normal_meses=intervalo_normal_meses,
        intervalo_baixa_meses=intervalo_baixa_meses,
        planejamento_itens=_checklist_skeleton(active_checklist_items(db, TIPO_PLANEJAMENTO)),
        criado_em=utc_now(),
    )
    db.add(ciclo)
    db.commit()
    db.refresh(ciclo)
    return ciclo


def excluir_ciclo(db: Session, ciclo: MaintenanceCycle) -> None:
    """Hard delete - apaga o ciclo e todos os itens dele. Sem soft delete
    (requisito explícito do usuário: "hard delete mesmo"). Libera os
    computadores que estavam nele para entrar em outro ciclo."""
    db.query(MaintenanceCycleItem).filter(MaintenanceCycleItem.ciclo_id == ciclo.id).delete(synchronize_session=False)
    db.delete(ciclo)
    db.commit()


def _intervalo_meses(ciclo: MaintenanceCycle, prioridade: str) -> int:
    return {
        Prioridade.ALTA.value: ciclo.intervalo_alta_meses,
        Prioridade.NORMAL.value: ciclo.intervalo_normal_meses,
        Prioridade.BAIXA.value: ciclo.intervalo_baixa_meses,
    }.get(prioridade, ciclo.intervalo_normal_meses)


def calcular_proxima_preventiva(ciclo: MaintenanceCycle, item: MaintenanceCycleItem) -> date:
    """Data agendada da preventiva (ou hoje, se não houver) + o intervalo
    padrão do ciclo para a prioridade do item. Substitui a digitação manual
    da data no Checklist 3."""
    base = item.data_agendada or utc_now().date()
    return base + relativedelta(months=_intervalo_meses(ciclo, item.prioridade))


def marcar_item_planejamento(db: Session, ciclo: MaintenanceCycle, indice: int, ok: bool, marcado_por: str) -> MaintenanceCycle:
    itens = list(ciclo.planejamento_itens or [])
    if indice < 0 or indice >= len(itens):
        raise TransitionPreconditionError("item de planejamento inexistente")
    itens[indice] = {**itens[indice], "ok": ok, "marcado_por": marcado_por, "marcado_em": utc_now().isoformat()}
    ciclo.planejamento_itens = itens
    db.commit()
    db.refresh(ciclo)
    return ciclo


def adicionar_item(
    db: Session,
    ciclo: MaintenanceCycle,
    *,
    computador_id: int,
    prioridade: Prioridade = Prioridade.NORMAL,
    tecnico_id: int | None = None,
) -> MaintenanceCycleItem:
    if ciclo.status != "planejamento":
        raise TransitionPreconditionError("só é possível adicionar item a um ciclo em planejamento")
    computador = db.get(Computer, computador_id)
    if computador is None:
        raise TransitionPreconditionError("computador não encontrado")
    if not computador.ativo:
        raise TransitionPreconditionError("computador desativado (baixado) não pode entrar em ciclo")
    if tecnico_id is not None and db.get(Technician, tecnico_id) is None:
        raise TransitionPreconditionError("técnico não encontrado")

    # invariante entre agregados (nao e UNIQUE simples - o mesmo PC pode
    # estar em varios ciclos ao longo do tempo, so nao em dois *abertos* ao
    # mesmo tempo) - ver backend.md §3.3.
    ja_em_ciclo_aberto = db.scalar(
        select(MaintenanceCycleItem)
        .join(MaintenanceCycle, MaintenanceCycle.id == MaintenanceCycleItem.ciclo_id)
        .where(
            MaintenanceCycleItem.computador_id == computador_id,
            MaintenanceCycle.status == "planejamento",
        )
        .limit(1)
    )
    if ja_em_ciclo_aberto is not None:
        raise ComputerAlreadyInOpenCycleError(computador_id, ja_em_ciclo_aberto.ciclo_id)

    item = MaintenanceCycleItem(
        ciclo_id=ciclo.id,
        computador_id=computador_id,
        prioridade=prioridade.value,
        tecnico_id=tecnico_id,
        status=ItemStatus.PLANEJADO.value,
        criado_em=utc_now(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def remover_item(db: Session, item: MaintenanceCycleItem) -> None:
    """Tira um computador do ciclo (ex.: entrou por engano, não vai mais
    entrar nesta rodada). Hard delete - mas só até a execução: depois de
    Concluído/Pendente o item é registro histórico (o que foi feito no
    computador), não se apaga mais, igual não se reescreve resultado sem
    `permitir_edicao`."""
    status_atual = ItemStatus(item.status)
    if status_atual in (ItemStatus.CONCLUIDO, ItemStatus.PENDENTE):
        raise TransitionPreconditionError(
            "não é possível remover um item já finalizado (concluído/pendente) - é histórico do ciclo"
        )
    db.delete(item)
    db.commit()


def fechar_ciclo(db: Session, ciclo: MaintenanceCycle) -> MaintenanceCycle:
    if ciclo.status != "planejamento":
        raise TransitionPreconditionError("ciclo já está encerrado")

    itens = list(db.scalars(select(MaintenanceCycleItem).where(MaintenanceCycleItem.ciclo_id == ciclo.id)).all())
    if not itens:
        raise TransitionPreconditionError("ciclo sem nenhum item não pode ser encerrado")

    pendentes: list[str] = []
    for item in itens:
        status = ItemStatus(item.status)
        if status == ItemStatus.CONCLUIDO:
            continue
        if status == ItemStatus.REMARCADO and item.data_agendada is not None:
            continue
        if status == ItemStatus.PENDENTE and item.pendencia_responsavel and item.pendencia_prazo:
            continue
        pendentes.append(
            f"item {item.id} (computador {item.computador_id}, status {status.value}) precisa ser resolvido"
        )

    if pendentes:
        raise TransitionPreconditionError(
            "não é possível encerrar o ciclo - itens pendentes: " + "; ".join(pendentes)
        )

    ciclo.status = "encerrado"
    db.commit()
    db.refresh(ciclo)
    return ciclo


# ---------------------------------------------------------------------------
# Item (C2, C2b, C3, C4)
# ---------------------------------------------------------------------------

def confirmar_item(
    db: Session,
    item: MaintenanceCycleItem,
    *,
    data_agendada: date,
    tecnico_id: int,
) -> MaintenanceCycleItem:
    """C2 (Planejado->Confirmado) e reagendamento apos remarcar
    (Remarcado->Confirmado) - mesma regra: data E tecnico juntos, sempre."""
    _require_transition(item, ItemStatus.CONFIRMADO)
    if data_agendada is None or tecnico_id is None:
        raise TransitionPreconditionError("confirmar exige data agendada e técnico juntos")
    if db.get(Technician, tecnico_id) is None:
        raise TransitionPreconditionError("técnico não encontrado")

    item.status = ItemStatus.CONFIRMADO.value
    item.data_agendada = data_agendada
    item.tecnico_id = tecnico_id
    # reagendar depois de remarcado reabre a reconfirmacao - o combinado
    # anterior nao vale mais pra vespera nova.
    item.reconfirmacao_itens = None
    item.motivo_remarcacao = None
    db.commit()
    db.refresh(item)
    return item


def reconfirmar_item(db: Session, item: MaintenanceCycleItem, *, marcas: dict[str, bool]) -> MaintenanceCycleItem:
    """C2b - Checklist 2 (vespera). Nao muda o status do item (continua
    Confirmado) - so preenche reconfirmacao_itens, que executar_item exige
    completo antes de liberar o Checklist 3."""
    if ItemStatus(item.status) != ItemStatus.CONFIRMADO:
        raise TransitionPreconditionError("só é possível reconfirmar um item confirmado")

    labels = active_checklist_items(db, TIPO_RECONFIRMACAO)
    if not labels:
        raise TransitionPreconditionError("nenhum item de reconfirmação ativo no catálogo (configure em /admin)")

    itens = []
    for label in labels:
        if label not in marcas:
            raise TransitionPreconditionError(f"item de reconfirmação ausente: {label}")
        itens.append({"item": label, "ok": bool(marcas[label])})

    item.reconfirmacao_itens = itens
    db.commit()
    db.refresh(item)
    return item


def _reconfirmacao_completa(item: MaintenanceCycleItem) -> bool:
    """Snapshot tirado no momento da reconfirmação (ver reconfirmar_item) -
    nunca recompara contra o catálogo atual, que pode ter mudado depois."""
    itens = item.reconfirmacao_itens
    return bool(itens) and all(i["ok"] for i in itens)


def executar_item(
    db: Session,
    item: MaintenanceCycleItem,
    *,
    itens: dict[str, str],  # label -> "ok" | "na"
    observacoes: dict[str, str] | None = None,
    resultado: Resultado | None,
    resumo: str | None,
    chamado_glpi: str | None,
    pendencia_responsavel: str | None,
    pendencia_prazo: date | None,
    ponto_focal_nome: str | None,
    ponto_focal_data: date | None,
    proxima_preventiva: date | None = None,  # None ao finalizar = calcula pelo intervalo do ciclo
    rascunho: bool,
    permitir_edicao: bool = False,
) -> MaintenanceCycleItem:
    """C3 - Checklist de execucao. rascunho=True so salva o progresso (nao
    muda status, nao exige nada preenchido); rascunho=False finaliza e exige
    tudo (bloqueado sem C2b completo - regra de ouro do PDF).

    `permitir_edicao=True` (so o admin - checagem de "quem" fica no router,
    ver routers/preventiva/cycle_items.py) reabre um item ja Concluido/
    Pendente pra correcao. Tecnico nunca reabre um item ja finalizado -
    "so pode editar antes de finalizar" (requisito explicito do usuario)."""
    status_atual = ItemStatus(item.status)
    editando_finalizado = status_atual in (ItemStatus.CONCLUIDO, ItemStatus.PENDENTE)
    if status_atual != ItemStatus.CONFIRMADO and not (editando_finalizado and permitir_edicao):
        raise TransitionPreconditionError(
            "só é possível executar um item confirmado (ou editar um já finalizado, restrito ao admin)"
        )
    if not _reconfirmacao_completa(item):
        raise TransitionPreconditionError(
            "reconfirmação da véspera (Checklist 2) precisa estar completa antes de executar"
        )

    observacoes = observacoes or {}
    checklist = []
    labels = active_checklist_items(db, TIPO_EXECUCAO)
    if not labels:
        raise TransitionPreconditionError("nenhum item de execução ativo no catálogo (configure em /admin)")
    for label in labels:
        marca = itens.get(label)
        if not rascunho and marca not in ("ok", "na"):
            raise TransitionPreconditionError(f"item de execução ausente: {label}")
        checklist.append({"item": label, "status": marca, "observacao": observacoes.get(label, "")})
    item.execucao_itens = checklist

    if rascunho:
        item.execucao_status = "rascunho"
        db.commit()
        db.refresh(item)
        return item

    if resultado is None:
        raise TransitionPreconditionError("resultado do atendimento é obrigatório para finalizar")
    if resultado in _RESULTADOS_QUE_EXIGEM_PENDENCIA:
        if not chamado_glpi:
            raise TransitionPreconditionError("chamado GLPI é obrigatório para corretiva aberta/interrompido")
        if not pendencia_responsavel or not pendencia_prazo:
            raise TransitionPreconditionError(
                "pendência com responsável e prazo é obrigatória para corretiva aberta/interrompido"
            )

    item.execucao_status = "finalizado"
    item.resultado = resultado.value
    item.resumo = resumo
    item.chamado_glpi = chamado_glpi
    item.pendencia_responsavel = pendencia_responsavel
    item.pendencia_prazo = pendencia_prazo
    item.ponto_focal_nome = ponto_focal_nome
    item.ponto_focal_data = ponto_focal_data
    if proxima_preventiva is not None:
        item.proxima_preventiva = proxima_preventiva
    else:
        ciclo = db.get(MaintenanceCycle, item.ciclo_id)
        item.proxima_preventiva = calcular_proxima_preventiva(ciclo, item) if ciclo else None
    item.status = (
        ItemStatus.CONCLUIDO.value
        if resultado in (Resultado.SEM_ACHADO, Resultado.AJUSTE_SIMPLES)
        else ItemStatus.PENDENTE.value
    )
    db.commit()
    db.refresh(item)
    return item


def remarcar_item(
    db: Session,
    item: MaintenanceCycleItem,
    *,
    motivo: str,
    nova_data: date | None,
) -> MaintenanceCycleItem:
    """C4 - "quando não iniciar ou interromper" do PDF."""
    _require_transition(item, ItemStatus.REMARCADO)
    if not motivo or not motivo.strip():
        raise TransitionPreconditionError("motivo da remarcação é obrigatório")

    item.status = ItemStatus.REMARCADO.value
    item.motivo_remarcacao = motivo.strip()
    item.data_agendada = nova_data
    db.commit()
    db.refresh(item)
    return item
