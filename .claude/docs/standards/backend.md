# Padrões de Projeto — Backend (FastAPI + SQLAlchemy + Postgres)

Ver [design_system.md](design_system.md)/[frontend_patterns.md](frontend_patterns.md) para o lado
Next.js. Este arquivo cobre `api/app/` (e os `services/` que ele chama). Derivado a partir do
código já existente (`routers/auth.py`, `routers/admin.py`, `routers/competencies.py`,
`services/collection_jobs.py`, `models/*.py`) — não é um padrão importado de fora, é o que o
projeto já faz, escrito de uma vez num lugar só, mais as decisões que a feature de **Manutenção
Preventiva de Computadores + Inventário** (`docs/requisitos.md`) precisa de imediato porque é a
primeira feature com CRUD transacional real deste projeto (v1 era só `units`/`technicians`,
read-only — ver `CLAUDE.md`).

Convenção geral do projeto, reafirmada aqui: **nomes de tabela em inglês, plural, snake_case**
(`technicians`, `units`, `collection_runs`, `competency_activities`...) — **nomes de coluna em
português**, no vocabulário do domínio (`papel`, `nome_completo`, `ativa`, `criada_em`). Nenhuma
tabela existente hoje foge disso; as tabelas novas desta feature seguem o mesmo padrão (ver
"Nomenclatura de tabelas" abaixo) mesmo `docs/requisitos.md` usando os nomes em português
(`setores`, `computadores`, `ciclos`) — isso é vocabulário de negócio, não o nome físico da
tabela.

---

## 1. Contrato de API

- **Formato de erro**: `HTTPException(status, "mensagem em português")` em todo endpoint —
  FastAPI serializa isso como `{"detail": "..."}`. Não introduzir um envelope de erro próprio
  pra esta feature; manter o formato único que já existe em `auth.py`/`admin.py`/`competencies.py`.
- **Convenção de status code**, extraída do uso real (nunca escrita antes, mas consistente em
  todos os routers existentes) — seguir à risca nos endpoints novos:
  - `401` — sessão ausente/inválida/expirada (`require_session` já faz isso)
  - `403` — sessão válida, mas sem permissão pra *esta* ação/recurso (ver §5 — autorização por
    recurso, não só por `subject_type`)
  - `404` — recurso não existe (ciclo, item, computador, setor)
  - `409` — conflito com estado já existente (patrimônio duplicado, ciclo já com esse PC aberto)
  - `422` — request bem-formado mas viola regra de negócio (`WeightsUpdate`/`PresetParameters`
    em `admin.py` já usam esse padrão pra "confirmar exige data E técnico", "pesos somam 1.0" etc.)
- **DTO nunca é o model**: todo endpoint devolve um schema Pydantic (`response_model=...`), nunca
  o objeto SQLAlchemy cru — já é assim em todo router existente (`TechnicianOut`,
  `CompetencyActivityOut`...); os schemas novos (`MaintenanceCycleOut`, `ComputerOut`,
  `SectorOut`...) seguem o mesmo padrão: `ConfigDict(from_attributes=True)` + campos explícitos.
- **Paginação/filtro**: reusar o padrão já implementado em `admin.py::list_collection_runs`
  (`page`, `page_size`, `sort_by: Literal[...]`, `sort_dir`, filtro por `status` como query param
  opcional, resposta com `items`/`page`/`page_size`/`total`/`total_pages`) para
  `GET /preventiva/cycles` e `GET /inventory/computers` — não inventar um formato de paginação
  novo.
- **Versionamento**: nenhum hoje (não existe prefixo `/v1`). Decisão explícita: **sem
  versionamento até o primeiro breaking change real** — consistente com o resto da API (uso é
  rede interna do hospital, consumidor único é o próprio frontend deste repo).
- **Roteador por domínio, sub-pacote quando o domínio tem mais de um recurso**: seguir o padrão
  de `routers/analytics/` (pacote com `__init__.py` + `_shared.py` + módulos por recurso) em vez
  de um único arquivo — esta feature tem 3 recursos (setores, inventário, ciclos) com uma
  dependência de autorização compartilhada entre eles (§5), o mesmo motivo que justificou o
  sub-pacote em `analytics/`. Proposta: `routers/preventiva/` com `sectors.py`, `computers.py`,
  `cycles.py` e `_shared.py` (dependências de autorização, §5).

## 2. Modelagem de domínio

### 2.1 State machine do item de ciclo — decisão central desta feature

**Coluna `status`: `String` simples, indexada — não `sqlalchemy.Enum` nativo do Postgres, não
tabela de lookup.**

Por quê: o precedente já existente no projeto é exatamente esse —
`CollectionRun.status: Mapped[str] = mapped_column(String(20), index=True)`, com os valores
válidos (`queued`/`running`/`success`/`error`) vivendo só em código Python
(`ACTIVE_COLLECTION_STATUSES` em `services/collection_jobs.py`), nunca como `CHECK` constraint
nem enum de banco. Duas razões pra manter isso aqui:

1. **Projeto não usa Alembic** (`api/app/db.py::ensure_additive_columns` — lista de `ALTER TABLE
   ADD COLUMN` idempotente, aditiva só). Um `ENUM` nativo do Postgres exige DDL não-aditivo pra
   mudar (`ALTER TYPE ... ADD VALUE`, que nem roda dentro de transação em algumas versões; remover
   valor é pior ainda) — não existe hoje um mecanismo no projeto pra aplicar isso com segurança
   fora de uma migration de verdade. Um `CHECK` constraint teria o mesmo problema (precisa
   `DROP CONSTRAINT` + `ADD CONSTRAINT`, não é aditivo). `String` simples não tem esse custo:
   qualquer evolução do vocabulário de status é só código Python, sem DDL.
2. **Tabela de lookup é overkill pra 5 valores fixos e donos do próprio domínio** (não são dado
   editável pelo admin, ao contrário de `CompetencyActivityType`, que É uma tabela porque o admin
   cria/edita tipos pela UI). Status do item de ciclo não tem UI de cadastro — é vocabulário
   fechado do processo (`Manutencao_Preventiva_PCs.pdf`).

```python
# api/app/models/maintenance_cycle_item.py
status: Mapped[str] = mapped_column(String(20), index=True)  # ver ItemStatus abaixo
```

```python
# api/app/services/ciclos.py (ou schemas/maintenance.py — mesmo módulo que valida o payload)
class ItemStatus(str, Enum):
    PLANEJADO = "planejado"
    CONFIRMADO = "confirmado"
    CONCLUIDO = "concluido"
    REMARCADO = "remarcado"
    PENDENTE = "pendente"
```
Usar esse mesmo `Enum` como tipo de campo nos schemas Pydantic de saída (dá validação de formato
de graça, sem precisar de `CHECK` no banco) — a `Mapped[str]` do model guarda `.value`.

**Onde mora a validação de transição: `services/ciclos.py`, nunca no model, nunca no router.**

- **Não no model**: nenhum model deste projeto tem método de negócio (todos são
  `DeclarativeBase` puro, dado + `Mapped[...]` — ver `Technician`, `CompetencyActivity`,
  `CollectionRun`). Manter esse padrão: SQLAlchemy models continuam burros aqui.
- **Não no router**: o precedente de "service levanta exceção de domínio, router traduz pra
  HTTP" já existe (`CollectionAlreadyRunningError` em `services/collection_jobs.py`, capturada em
  `admin.py::trigger_collect` e mapeada pra `HTTPException(409, ...)`). Replicar exatamente essa
  forma para transição inválida: `class InvalidTransitionError(Exception)` (e
  `class TransitionPreconditionError(Exception)` pras regras "confirmar exige data E técnico",
  "C2b precisa dos 6 itens OK antes de liberar C3" etc.), levantadas em `services/ciclos.py`,
  capturadas no router e mapeadas pra `422`.
- **Service = grafo de transição + precondição por aresta**, não só "esse status pode virar
  aquele":

  ```python
  ALLOWED_TRANSITIONS: dict[ItemStatus, set[ItemStatus]] = {
      ItemStatus.PLANEJADO: {ItemStatus.CONFIRMADO},
      ItemStatus.CONFIRMADO: {ItemStatus.CONCLUIDO, ItemStatus.PENDENTE, ItemStatus.REMARCADO},
      ItemStatus.REMARCADO: {ItemStatus.CONFIRMADO},
      ItemStatus.CONCLUIDO: set(),   # terminal
      ItemStatus.PENDENTE: set(),    # terminal pro MVP — ver nota abaixo
  }
  ```

  - `Planejado -> Confirmado` (C2): só é uma transição válida se `data_agendada` **e**
    `tecnico_id` foram fornecidos juntos — não é possível confirmar faltando um dos dois (regra
    explícita do requisito). Essa checagem é adicional ao grafo, vive na função
    `confirmar_item(db, item, data_agendada, tecnico_id, ...)`.
  - `Confirmado -> Concluído`/`Pendente` (C3): só é permitida se a reconfirmação da véspera
    (C2b, 6 itens do Checklist 2) estiver completa — é **pré-requisito bloqueante**, não um
    registro informativo (requisito explícito: "a plataforma bloqueia e aponta o que falta"). O
    resultado do checklist (`Sem achado`/`Ajuste simples` → Concluído;
    `Corretiva aberta`/`Interrompido` → Pendente, com `chamado_glpi` +
    `pendencia_responsavel` + `pendencia_prazo` obrigatórios) decide qual dos dois.
  - `Confirmado -> Remarcado` (C4): exige `motivo` (obrigatório); `nova_data` é opcional
    (`None` = "sem data definida").
  - `Remarcado -> Confirmado`: reagendamento, mesma regra de C2 (data+janela+técnico juntos).
  - `Pendente` é terminal pro MVP: o requisito (C5) trata "pendente-com-responsável" como um dos
    3 estados aceitos pra **fechar o ciclo** — o item continua `Pendente` mesmo depois do ciclo
    encerrado, sua "resolução" é ter responsável+prazo preenchidos, não uma nova transição de
    status. **Não especificado no requisito**: o que acontece quando a corretiva de um item
    `Pendente` é resolvida depois — tratar como fora do MVP, revisitar se virar necessidade real
    (não inventar um `Resolvido` novo sem confirmação).
  - **"Atrasado" nunca é um valor de `status`** — é um indicador calculado em tempo de leitura
    (`status == CONFIRMADO and data_agendada < hoje`), exatamente como o requisito pede
    ("indicador visual sobre 'Confirmado', não um status novo"). Não persistir isso em coluna
    nenhuma.

### 2.2 Duas state machines, não uma

`maintenance_cycles.status` é **binário**: `"planejamento"` / `"encerrado"` — só esses dois nomes
aparecem no requisito para o ciclo em si (C1 cria em "Planejamento", C5 fecha pra "Encerrado"); os
5 estados detalhados (Planejado/Confirmado/.../Pendente) são todos do **item**, não do ciclo.
"Ciclo aberto" (linguagem usada nos casos de borda) é `status == "planejamento"`, não um 3º valor
armazenado. Não confundir os dois — implementar como duas colunas de status independentes, cada
uma com seu próprio vocabulário fechado, sem tentar unificar num enum só.

### 2.3 Checklist de reconfirmação (C2b) e de execução (C3) — colunas no item, não tabela própria

Decisão: os 6 itens do Checklist 2 (reconfirmação) e os 10 itens do Checklist 3 (execução) vivem
como colunas `JSON` **direto em `maintenance_cycle_items`** (`reconfirmacao_itens: list[dict]`,
`execucao_itens: list[dict]`), não em tabelas `checklist_reconfirmacao`/`checklist_execucao`
separadas. Por quê:

- **Precedente direto no projeto**: `CompetencySituation.opcoes`/`escopo_opcoes` já guardam listas
  de dict como `JSON` numa coluna, exatamente quando a lista é sempre lida/escrita como unidade
  junto do registro pai e nunca filtrada item-a-item por query (`api/app/models/competency.py`).
  O checklist de reconfirmação/execução é o mesmo padrão: sempre ida e volta inteiro (o técnico
  abre o checklist, marca os itens, salva tudo de uma vez), nunca "me dê só o item 4 de todos os
  checklists".
  - Cada item da lista JSON: `{"item": "...", "status": "ok"|"na", "observacao": "..."}` (ou
    campo próprio pro Checklist 3 que tem observação livre por item).
- **Relação é 1:1 com o item, não histórico append-only**: diferente de `CompetencyAssessment`
  (que É append-only de propósito — ver comentário no topo de `competency.py`), aqui não há
  requisito de manter tentativas anteriores; um item remarcado volta a "Confirmado" e o próximo
  ciclo de reconfirmação/execução **sobrescreve** o anterior. "Rascunho" (requisito C3: "checklist
  parcialmente preenchido... progresso fica salvo como rascunho") é um `execucao_status:
  "rascunho" | "finalizado"` na mesma linha, não uma nova linha numa tabela separada.
- **Evitar N+1/joins numa leitura muito comum**: "listar itens do ciclo com status" é o read path
  mais frequente da feature (tela de fechamento C5, tela do ciclo). Colunas no mesmo registro
  evitam um join a mais por item — mesma lógica de design já usada em `Technician`, que junta
  catálogo + auth + display numa linha só em vez de espalhar em tabelas 1:1.
- **Trade-off documentado, não escondido**: se um dia existir requisito de auditoria
  ("mostrar as 3 tentativas de execução desse item ao longo do tempo"), migrar pra uma tabela
  append-only nesse momento (mesmo padrão de `CompetencyAssessment`) — não antecipar agora, o
  requisito atual não pede isso.

### 2.4 Soft-delete vs hard-delete — decidido por entidade

- **`sectors`**: nunca deletado. `ativo: bool` (espelha `is_active` do GLPI) — requisito explícito
  ("nunca deletado — preserva histórico de PCs/ciclos que já o referenciam"). Sincronização faz
  upsert por `id_glpi`, nunca `DELETE`.
- **`computers`**: nunca deletado no MVP (não há requisito de exclusão de computador — só cadastro
  e "mover de setor"). Se precisar desativar um PC baixado/descartado no futuro, mesmo padrão
  `ativo: bool`, não excluir (histórico de preventivas do PC precisa sobreviver).
- **`maintenance_cycles`/`maintenance_cycle_items`**: sem endpoint de `DELETE` nenhum. O ciclo tem
  seu próprio "estado morto" via workflow (`Encerrado` = somente leitura, é o soft-delete
  natural do agregado) — não precisa de flag `ativo` adicional nem endpoint de exclusão. Único
  caso de borda plausível (não bloqueante, opcional): permitir hard-delete de um ciclo
  **rascunho** (`status == "planejamento"` E zero itens) — mesmo padrão já usado em
  `competencies.py` (`delete_activity_type`/`delete_activity`/`delete_situation`: só deleta se
  contagem de dependentes for zero, senão `409`). Não implementar isso a menos que vire pedido
  real — mencionado aqui só pra não ser redescoberto do zero depois.

## 3. Persistência

### 3.1 Nomenclatura de tabelas

| Domínio (requisito) | Tabela (código)             | PK                                  |
|---|---|---|
| Setor                | `sectors`                    | `id_glpi` (Integer, natural, **não** autoincrement) |
| Computador           | `computers`                  | `id` (Integer, autoincrement)       |
| Ciclo                | `maintenance_cycles`         | `id` (Integer, autoincrement)       |
| Item do ciclo        | `maintenance_cycle_items`    | `id` (Integer, autoincrement)       |

(Checklists de reconfirmação/execução: colunas em `maintenance_cycle_items`, ver §2.3 — não são
tabela própria.)

### 3.2 PK natural vs surrogate — critério, não flip de moeda

O requisito pergunta isso diretamente porque `id_glpi` (setor) e `patrimônio` (computador) já são
identificadores naturais externos — mas eles **não** têm a mesma característica, e por isso a
resposta é diferente pra cada um:

- **`sectors.id_glpi` como PK direto** (sem surrogate): mesmo padrão de
  `Technician.users_id` (PK = id numérico do GLPI, reusado direto, sem coluna `id` própria) —
  `id_glpi` é atribuído e controlado pelo GLPI, imutável do ponto de vista desta plataforma (a
  plataforma nunca cria nem edita usuário do GLPI). Não há motivo pra indireção.
- **`computers.id` (serial) + `patrimonio` como coluna `unique=True, index=True`**, **não** como
  PK: diferente de `id_glpi`, `patrimônio` é digitado por humano no formulário de cadastro (A1) —
  pode ter erro de digitação que precise correção depois. Se `patrimonio` fosse a PK e já tivesse
  virado FK em `maintenance_cycle_items` (o PC já está num ciclo) e alguém precisar corrigir um
  dígito, isso vira uma migração de PK em cascata. Com PK surrogate, corrigir o patrimônio é um
  `UPDATE` de uma coluna comum, e a constraint `unique` já impede duplicata (requisito: "rejeita
  com mensagem clara"). Critério geral pra próximas tabelas: **chave natural vira PK só quando é
  controlada por um sistema externo e efetivamente imutável do ponto de vista desta plataforma
  (GLPI); chave natural digitada por humano vira `unique` + PK surrogate.**
- `Unit.slug` (PK atual, string derivada, não o `entities_id` numérico do GLPI) já é um precedente
  de PK derivada/não puramente natural nesse projeto — não é uma contradição do critério acima:
  slug é gerado pela própria plataforma (não digitado por usuário em formulário), então continua
  do lado "controlado, estável" do critério, só que auto-gerado em vez de vindo do GLPI.
- **`maintenance_cycles`/`maintenance_cycle_items`: `Integer` autoincrement** (não UUID). O único
  precedente de UUID no projeto é `CollectionRun.id` (`String(36)`), e é UUID por um motivo
  técnico específico que não se aplica aqui: o id precisa existir *antes* do commit pra ser
  devolvido à chamada HTTP e rastreado por uma `BackgroundTask` assíncrona
  (`background_tasks.add_task(execute_collection_run, run.id)` em `admin.py`). Ciclos e itens não
  têm esse requisito — fluxo normal de `db.add()` + `db.commit()` + `db.refresh()` (mesmo padrão
  de `CompetencyActivity`/`CompetencySituation`) resolve.

### 3.3 Relacionamentos e índices

- `computers.setor_atual_id -> sectors.id_glpi` (FK), + `setor_alterado_em: DateTime | None` pra
  "mover de setor" (requisito A1: "registra a data da mudança... não precisa de tela própria de
  histórico" — uma coluna basta, não uma tabela de histórico de transferência).
- `maintenance_cycles.responsavel_id -> technicians.users_id`, **não nulo** (requisito C1: técnico
  responsável é definido na criação do ciclo).
- `maintenance_cycle_items.ciclo_id -> maintenance_cycles.id`, `.computador_id -> computers.id`,
  `.tecnico_id -> technicians.users_id` **nullable** (item nasce `Planejado` sem técnico; só fica
  obrigatório ao confirmar — C2).
- Índice em toda coluna usada em filtro de listagem frequente: `maintenance_cycle_items.status`,
  `maintenance_cycle_items.ciclo_id`, `computers.setor_atual_id`, `sectors.ativo` — mesmo padrão
  já aplicado em `CollectionRun.status`/`requested_at` (`index=True` direto na coluna).
- **N+1 a evitar de propósito, porque o requisito já nomeia o read path**: A2 pede "cada setor
  mostra a contagem de PCs cadastrados" — implementar como uma única query agregada
  (`select(Sector, func.count(Computer.id)).outerjoin(...).group_by(Sector.id_glpi)`), não um loop
  por setor fazendo `count()` individual.
- **Invariante entre agregados** ("um patrimônio só pode estar em um ciclo aberto por vez") **não**
  é uma `UNIQUE` constraint simples (a mesma PC pode estar em vários ciclos ao longo do tempo,
  só não em dois *abertos* simultaneamente) — é uma checagem no service ao adicionar item
  (`services/ciclos.py::adicionar_item`): query por `computador_id` em
  `maintenance_cycle_items JOIN maintenance_cycles WHERE maintenance_cycles.status =
  'planejamento'`, rejeita com `409` se já existir. Fica no service porque cruza duas tabelas
  (ver §4).

### 3.4 Migrations — sem Alembic, dois caminhos distintos

Não introduzir Alembic só por causa desta feature (fora do escopo pedido; se o time quiser adotar
depois, é uma decisão própria, não um efeito colateral desta feature). Dois caminhos já existem no
projeto, cada tabela nova cai num deles dependendo do momento:

1. **Tabela nova**: `Base.metadata.create_all(engine)` (chamado no `lifespan` de `main.py`) já
   cria automaticamente qualquer tabela que ainda não existe — `sectors`, `computers`,
   `maintenance_cycles`, `maintenance_cycle_items` não precisam de nenhuma linha extra em
   `ensure_additive_columns()` na primeira vez que o model é escrito.
2. **Coluna nova numa tabela já em produção**: `create_all()` **não** adiciona coluna em tabela
   existente. A partir do momento em que uma dessas 4 tabelas já tiver sido criada em produção,
   qualquer coluna nova precisa de uma linha `ALTER TABLE ... ADD COLUMN` em
   `api/app/db.py::ensure_additive_columns()` (mesmo padrão idempotente já usado ali, com
   `try/except (OperationalError, ProgrammingError): pass`). **Registrar isso explicitamente no
   checklist da feature** (`.claude/checklists/active/`) como item a não esquecer — é o gotcha
   real deste projeto sem migration tool.

### 3.5 Fronteira de transação

- `confirmar_item`, `remarcar_item`, `reconfirmar_item`: single-row, um `commit()` no fim da
  função de service (mesmo padrão de `execute_collection_run`/`seed_units` — commit único, não
  por campo).
- `fechar_ciclo` (C5): lê todos os itens do ciclo, valida que todos estão resolvidos (senão
  `422` listando quais faltam), só então seta `ciclo.status = "encerrado"` — tudo dentro da mesma
  `Session`/transação, um `commit()` só no fim. Nunca fechar parcialmente.
- `sincronizar_setores` (B1): buscar **toda** a lista da GLPI primeiro (falha aqui = não escreve
  nada, dado local intacto — requisito explícito), só então fazer upsert linha a linha na mesma
  sessão, `commit()` único ao final (mesmo padrão de `seed_units`/`seed_technicians`: loop de
  mutações em memória, um commit no fim, não um commit por linha).

## 4. Camadas — quando `services/` entra, quando o router basta

O projeto hoje tem só `services/collection_jobs.py` — pouco precedente, mas o pouco que existe é
claro o suficiente pra generalizar. `competencies.py` (maior router do projeto, ~590 linhas) segue
o caminho oposto — toda a lógica de validação de tipo de campo/pontuação vive direto no router —
e isso também é sinal válido: **router-inline continua sendo o padrão-default**, service só entra
quando pelo menos um destes critérios bate:

1. **A operação precisa ler outras linhas antes de decidir** (não é só "esse registro existe?"). Ex.:
   "patrimônio já está em outro ciclo aberto" (§3.3) — cruza `maintenance_cycle_items` e
   `maintenance_cycles`.
2. **É uma transição de state machine** — a lógica de "essa transição é válida + essas
   precondições bateram" (§2.1) não é uma checagem de shape (isso o Pydantic já faz), é regra de
   domínio com grafo próprio. Fica em `services/ciclos.py`.
3. **Mais de um ponto de entrada chama a mesma lógica** — `sincronizar_setores` precisa ser
   chamável tanto do endpoint `POST /admin/sync-sectors` quanto, potencialmente, de um job
   agendado no futuro (mesmo caso de `run_pipeline`/`create_collection_run`, hoje só chamado do
   admin panel mas desenhado pra não depender do FastAPI request/response).
4. **Concorrência explícita precisa de lock** — sincronização de setores replica o padrão de
   `_start_lock`/`_execution_lock` (module-level `threading.Lock()`) de `collection_jobs.py`,
   porque o requisito B1 pede exatamente isso ("só uma roda por vez").

Onde isso deixa cada pedaço da feature:

| Operação | Camada | Por quê |
|---|---|---|
| Cadastrar computador (A1) | Router | Single insert + 1 checagem de unicidade — mesmo nível de `update_technician_profile` em `admin.py`, não precisa de service |
| Mover PC de setor | Router | Single update, 1 checagem de existência do setor |
| Listar setores com contagem de PCs | Router | Query agregada única (§3.3), sem regra de negócio |
| `confirmar_item`/`remarcar_item`/`reconfirmar_item`/`concluir_item` | **Service** (`services/ciclos.py`) | Critério 2 (state machine) |
| Adicionar item ao ciclo | **Service** | Critério 1 (invariante entre ciclos) |
| Fechar ciclo (C5) | **Service** | Critério 1 (lê todos os itens antes de decidir) |
| Sincronizar setores (B1) | **Service** (`services/setor_sync.py`) | Critérios 3 e 4 (lock, chamável fora do request HTTP) |

Router permanece fino nesses casos: valida shape (Pydantic já faz), resolve a dependência de
autorização (§5), chama a função de service, traduz exceção de domínio pra `HTTPException`,
devolve o schema de saída.

## 5. Autorização por recurso — dependency factory com path param, não checagem duplicada por router

O requisito precisa de um nível de autorização que o projeto ainda não tem: hoje `require_session`
(sessão válida) e `require_technician_session` (sessão válida E é técnico) são globais — não
existe ainda "essa sessão pode agir *neste* recurso específico". Duas notas antes da solução:

- **A auth desta feature usa a sessão (`require_session`/`CurrentIdentity`), não o
  `require_admin` de headers** (`X-Admin-Username`/`X-Admin-Password` em `admin.py`). Esse
  segundo mecanismo é uma senha compartilhada sem identidade própria por trás ("não é conta de
  usuário de verdade", comentário no próprio código) — serve pra proteger o painel de
  configuração (pesos, presets), mas não carrega um ator identificável, e esta feature precisa
  identificar "qual admin/técnico fez o quê" (§6). Login de admin via `/auth/login` já devolve uma
  `CurrentIdentity(subject_type="admin", users_id=None, ...)` — é essa sessão que autoriza
  mutação de ciclo, não o header.
- Autorização de recurso não substitui `require_session` — compõe com ela. `admin` sempre passa
  (convenção já usada em todo o resto do projeto: admin nunca tem checagem de "dono" a mais,
  ver `update_technician_profile`, `apply_config_preset` etc. — nenhuma delas verifica
  propriedade, só `require_admin`/sessão admin).

**Solução: dependency que declara o path param do recurso e devolve o próprio recurso já
carregado** — FastAPI resolve dependências de `Depends()` contra os path params da rota quando o
nome bate, então a dependência pode declarar `ciclo_id: int` mesmo sem ser ela a função da rota:

```python
# api/app/routers/preventiva/_shared.py  (mesmo padrão de nome de routers/analytics/_shared.py)
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from api.app.db import get_db
from api.app.models.maintenance_cycle import MaintenanceCycle
from api.app.models.maintenance_cycle_item import MaintenanceCycleItem
from api.app.routers.auth import CurrentIdentity, require_session


def require_cycle_manager(
    ciclo_id: int,
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
) -> MaintenanceCycle:
    """So admin OU o tecnico designado responsavel deste ciclo especifico -
    usado em agendar (C2), reatribuir, fechar (C5)."""
    ciclo = db.get(MaintenanceCycle, ciclo_id)
    if ciclo is None:
        raise HTTPException(404, "ciclo não encontrado")
    if current.subject_type != "admin" and ciclo.responsavel_id != current.users_id:
        raise HTTPException(403, "só o admin ou o responsável designado gerencia este ciclo")
    return ciclo


def require_item_executor(
    item_id: int,
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
) -> MaintenanceCycleItem:
    """So admin OU o tecnico atribuido a ESTE item - usado em preencher o
    checklist de execucao (C3). Responsavel do ciclo NAO passa aqui a menos
    que tambem seja o tecnico atribuido ao item (item.tecnico_id == ele) -
    requisito explicito: "tecnicos comuns so executam itens atribuidos a eles"."""
    item = db.get(MaintenanceCycleItem, item_id)
    if item is None:
        raise HTTPException(404, "item não encontrado")
    if current.subject_type != "admin" and item.tecnico_id != current.users_id:
        raise HTTPException(403, "só o técnico atribuído executa este item")
    return item


def require_item_actor(
    item_id: int,
    current: CurrentIdentity = Depends(require_session),
    db: Session = Depends(get_db),
) -> MaintenanceCycleItem:
    """Admin OU responsavel do ciclo OU tecnico atribuido ao item - usado em
    reconfirmar (C2b) e remarcar (C4), que o requisito explicitamente
    permite tanto pro responsavel quanto pro tecnico designado."""
    item = db.get(MaintenanceCycleItem, item_id)
    if item is None:
        raise HTTPException(404, "item não encontrado")
    is_responsavel = item.ciclo.responsavel_id == current.users_id
    is_tecnico = item.tecnico_id == current.users_id
    if current.subject_type != "admin" and not (is_responsavel or is_tecnico):
        raise HTTPException(403, "só o responsável do ciclo ou o técnico atribuído age neste item")
    return item
```

Cada router usa `Depends(require_cycle_manager)`/`require_item_executor`/`require_item_actor` no
lugar de repetir a checagem — ganho duplo: zero duplicação de regra de autorização entre
endpoints, e o handler já recebe o objeto carregado (evita um segundo `db.get()` dentro da
função, mesmo espírito de evitar N+1 do §3.3). Dependências separadas, não uma genérica
parametrizada, porque as regras são de fato diferentes (`cycle_manager` exclui o técnico comum;
`item_actor` inclui responsável **e** técnico do item) — forçar isso numa função só com flags
booleanas espalha a decisão de "quem pode o quê" pro call-site de cada router, voltando ao
problema original.

### 5.1 Ajuste de 2026-08-31 (feedback do usuário testando ao vivo)

Duas mudanças, cada uma numa camada:

- **Inventário = só o admin muta.** Todas as mutações de `/preventiva/computers/*` (`POST`,
  `PATCH .../{id}`, `.../move`, `PUT`/`DELETE .../{id}/hardware`, `DELETE .../{id}`) usam
  `require_admin_session`. A leitura (`GET /computers`, `GET /sectors`, `GET /computers/{id}`)
  continua em `require_session` — o técnico **vê** o inventário (setores, PCs, specs, score de
  saúde), só não cria/edita/move/exclui. Decisão explícita do usuário: "a parte de inventários,
  quem pode editar/apagar/criar é apenas o admin; o resto apenas visualiza". Não há papel
  intermediário aqui (uma versão anterior tentou "responsável de ciclo aberto" — descartada por
  pedido do usuário).
- **`require_item_executor`** passou a aceitar também o **responsável do ciclo** do item (antes só
  admin + `item.tecnico_id`). Idem o gate de "reabrir item finalizado" em `execute_item`
  (admin **ou** responsável, não só admin). Isso é sobre o fluxo do ciclo, não sobre inventário:
  o responsável gerencia o ciclo dele por inteiro; o técnico comum só age nos itens atribuídos a
  ele. Consequência: `require_item_executor` e `require_item_actor` hoje têm a mesma regra; os
  nomes seguem separados de propósito — marcam intenções distintas no call site e podem divergir
  de novo (ex. se "executar" ganhar uma precondição que "remarcar" não tem).

O frontend espelha isso escondendo botão que daria 403 (`useAdmin().isAdmin` no inventário;
`isAdmin || cycle.responsavel_id === usersId` na tela do ciclo) — mas o controle de acesso real é
sempre o backend, por rota.

## 6. Quem fez a ação — sempre de `CurrentIdentity`, nunca do body

Precedente já existente e a ser replicado sem exceção:
`CompetencyAssessment.avaliado_por`/`avaliador_users_id` são preenchidos em
`competencies.py::create_assessment` a partir de `current.nome_completo`/`current.users_id`
(`Depends(require_session)`) — o schema de entrada (`CompetencyAssessmentCreate`) nem tem esses
campos; o `model_dump()` do payload explicitamente exclui o que não deveria vir do cliente
(`exclude={"anonimo"}` mais o resto simplesmente não existe no schema de entrada).

Regra para esta feature: **todo campo que responde "quem fez isso dentro da plataforma" vem de
`CurrentIdentity`, nunca é aceito no corpo da request** — vale para:

- `maintenance_cycle_items` — quem marcou cada item do checklist de planejamento (C1: "fica
  registrado quem marcou e quando") → `marcado_por_id`/`marcado_em` de `current.users_id`/
  `datetime.now(timezone.utc)`, nunca do payload.
- Quem confirmou (C2), quem reconfirmou (C2b), quem remarcou (C4), quem fechou o ciclo (C5) —
  mesmo princípio, mesmo campo de origem.
- `tecnico_id` do checklist de execução (C3) — **não** vem do body: o próprio
  `require_item_executor` (§5) já garante que só quem está logado como o técnico atribuído (ou
  admin) chega no handler; o handler usa `item.tecnico_id` (já setado na etapa de agendamento,
  C2) ou `current.users_id`, nunca um `tecnico_id` solto no payload de `POST
  .../checklist-execucao` — isso fecharia a brecha de um técnico "preencher em nome de outro"
  simplesmente digitando outro id no JSON.

**Exceção clara, não confundir com o acima**: `ponto_focal_nome`/`ponto_focal_data` (validação do
setor no Checklist 3) **são** campos legítimos do body — o ponto focal não tem login
(`decisão já registrada em docs/requisitos.md`: "sem 3º `subject_type`"), então não existe
`CurrentIdentity` nenhuma pra derivar isso. O técnico é o autor do registro (isso sim vem da
sessão, via `require_item_executor`), mas o **conteúdo** ("fulano validou, em tal data") é dado de
negócio transcrito pelo técnico, não uma alegação de identidade — por isso entra no
`ChecklistExecucaoCreate` como texto livre normal. Da mesma forma, `tecnico_id` **atribuído** a um
item durante o agendamento (C2, quem o responsável escolhe pra executar) é dado de negócio target
escolhido pelo gestor, não uma alegação de "quem eu sou" — esse sim vem do body de
`POST .../schedule`, só que validado contra `Technician` existente/ativo.

## 7. Testes

- **Nunca mockar a camada de persistência** — todo teste roda contra SQLite real em memória
  (`create_engine("sqlite+pysqlite:///:memory:")` + `Base.metadata.create_all(engine)`), exatamente
  como já é em `tests/test_collection_jobs.py` e `tests/test_competencies.py`. Continuar assim
  para `services/ciclos.py`/`services/setor_sync.py` — nenhum `Mock(spec=Session)` nem stub de
  query.
- **Teste de router chama a função do router direto, não sobe `TestClient`/HTTP** — precedente
  em `test_competencies.py` (`from api.app.routers.competencies import create_assessment, ...`,
  chamada com uma `CurrentIdentity` construída à mão e uma `Session` de fixture). Seguir o mesmo
  molde pros testes de autorização por recurso (§5): construir
  `CurrentIdentity(subject_type="tecnico", users_id=N, ...)` pra técnico dono vs. técnico não-dono
  vs. admin, chamando `require_cycle_manager`/`require_item_executor`/`require_item_actor`
  diretamente e checando o `HTTPException(403)` — é a forma mais direta de testar a matriz "quem
  pode o quê" sem precisar montar sessão de verdade por token.
  - `StaticPool` só é necessária quando o código sob teste abre sua **própria** `Session` nova
    (padrão de `services/collection_jobs.py`, testado via `monkeypatch.setattr(collection_jobs,
    "SessionLocal", factory)` em `tests/test_collection_jobs.py`) — replicar isso para
    `services/setor_sync.py` (que também roda fora do ciclo de vida de uma request, mesmo
    formato de `execute_collection_run`). Para testes de router/service que recebem a `Session` já
    aberta via fixture simples (padrão de `test_competencies.py`), `StaticPool` não é necessário.
- **Toda transição da state machine (§2.1) ganha teste próprio** — cada aresta do
  `ALLOWED_TRANSITIONS` (caminho feliz) e pelo menos uma aresta inválida por estado (ex.:
  `Planejado -> Concluído` direto deve levantar `InvalidTransitionError`), mais os casos de
  precondição (confirmar sem técnico, confirmar sem data, fechar ciclo com pendência sem
  responsável+prazo, abrir Checklist 3 sem Checklist 2 completo).
- **Threshold de coverage: sem enforcement, decisão explícita** — não há ferramenta de coverage
  configurada em `pyproject.toml`/`pytest.ini_options` hoje. Não introduzir gate de CI pra esta
  feature sozinha; se o projeto adotar `pytest-cov` no futuro, revisitar junto de
  `/davi-platform-eng:infra-standards`.
- **Contract testing**: não aplicável — único consumidor da API é o frontend deste mesmo repo, e
  ele testa contra o client mockado (`lib/api.ts`), não contra a API real (ver
  `testing_frontend.md` § "O que NÃO testar"). Sem par de serviços trocando contrato aqui.

## 8. Segurança

- **Autenticação**: sem mudança — sessão por token opaco (`X-Session-Token`), bcrypt
  (`routers/auth.py`), TTL de 24h (`AuthSession.SESSION_TTL`). Esta feature não introduz mecanismo
  novo, só consome `require_session`/`CurrentIdentity` já existentes, mais as 3 dependências
  novas de recurso (§5).
- **RBAC**: 2 papéis globais (`tecnico`/`admin`, inalterado) **+** autorização por instância de
  recurso (§5) — a parte nova. Documentado aqui porque `authorization-rbac-design` cobre
  exatamente essa distinção "checagem no nível de endpoint" vs "checagem no nível de instância", e
  o projeto até agora só tinha a primeira. Mutação de inventário é a exceção que ficou **só no
  nível de endpoint** (`require_admin_session`, §5.1) — não há dono de PC a checar.
- **Rate limiting**: não aplicável — mesma justificativa já documentada em `CLAUDE.md` (rede
  interna do hospital, sem exposição pública), reafirmada aqui pra não ficar implícita.
- **Input validation**: todo payload de mutação (agendar, remarcar, checklist, cadastro de PC)
  passa por schema Pydantic com `Field`/`field_validator`/`model_validator` antes de chegar no
  service — mesmo padrão de `admin.py`/`schemas/competency.py` (validação de formato no schema,
  regra de negócio no service — nunca misturado no mesmo lugar). Ex.: `patrimonio` não-vazio no
  schema; "patrimônio já existe" é regra de negócio (consulta ao banco), fica no router/service,
  não no `field_validator` (que não tem acesso à `Session`).
- **Captura de ator em mutação**: §6, sem exceção.
- **Dependências com vulnerabilidade conhecida**: fora do escopo desta derivação (nenhuma
  dependência nova é necessária pra esta feature — tudo já está em `pyproject.toml`
  `[project.optional-dependencies].api`).

## 9. Integração e resiliência

Único ponto de chamada síncrona a sistema externo desta feature: **sincronização de setores
(B1) contra o GLPI**, via `src/ti_analytics/glpi/client.py` (já tem retry curto em timeout de
conexão transitório — ver comentário em `client.py` linha ~26 — e `timeout=30`/`timeout=15` por
chamada). Reaproveitar esse client, não escrever um novo.

- **Lock de concorrência**: replicar o padrão `_start_lock`/`_execution_lock`
  (`threading.Lock()` module-level) de `services/collection_jobs.py` em
  `services/setor_sync.py` — requisito explícito ("só uma roda por vez").
- **Falha não apaga dado local**: buscar a lista inteira da GLPI antes de escrever qualquer coisa
  no Postgres; se a chamada GLPI falhar, não tocar em `sectors` — requisito explícito ("a última
  lista sincronizada com sucesso continua disponível e o erro fica visível"). Mesma lógica de
  "ordem de operações" que já existe implicitamente em `run_pipeline` (falha vira `status="error"`
  em `CollectionRun`, gold anterior não é sobrescrito).
- **Rastreamento do job**: reaproveitar o formato de `CollectionRun` em vez de inventar um novo —
  adicionar um discriminador (`tipo: Mapped[str] = mapped_column(String(20), default="chamados",
  server_default="'chamados'")`, migração aditiva via `ensure_additive_columns`) e gravar
  execuções de sync de setor como `tipo="setores"`. `counts` guarda
  `{"setores_sincronizados": n, "setores_desativados": m}`. Isso reaproveita
  `list_collection_runs`/`get_collection_run` (paginção, sort, filtro por status) já prontos em
  `admin.py` sem escrever um segundo endpoint de histórico do zero — só filtrar por `tipo` na
  listagem. Alternativa descartada: criar `SectorSyncRun` paralelo — rejeitada por duplicar um
  shape (status/requested_by/requested_at/started_at/finished_at/duration/counts/error/
  error_details) que já é idêntico ao que a sincronização de setor precisa.
- **Retry automático**: nenhum — mesmo padrão da coleta de chamados hoje (ação disparada
  manualmente pelo admin; se falhar, o erro fica visível e o admin aciona de novo). Não introduzir
  retry automático/backoff só pra esta feature sem esse já ser o padrão do resto do projeto.
- **Idempotência**: satisfeita estruturalmente pelo upsert por `id_glpi` (nunca duplica, rodar a
  sincronização 2x seguidas é seguro por construção) — não precisa de mecanismo de idempotência
  adicional (chave de idempotência, deduplicação por request-id etc.).
- **Circuit breaker**: não aplicável — dependência externa única (GLPI), já coberta por
  timeout + retry curto no client existente, sem cascata de chamadas a outros serviços.

---

## Resumo das decisões que a feature precisa hoje

1. `status` (item e ciclo) = `String` indexada, não enum de banco/CHECK/lookup table — validação
   de transição em `services/ciclos.py`, nunca no model ou no router.
2. Autorização por recurso via dependency factory que declara o path param
   (`require_cycle_manager`/`require_item_executor`/`require_item_actor` em
   `routers/preventiva/_shared.py`), compõe com `require_session`, admin sempre passa.
3. `services/` entra quando há invariante entre linhas/tabelas, transição de state machine,
   múltiplos entrypoints, ou lock de concorrência — resto fica no router.
4. Tabelas em inglês/plural (`sectors`, `computers`, `maintenance_cycles`,
   `maintenance_cycle_items`); PK natural (GLPI `id_glpi`) só quando controlada por sistema
   externo imutável, surrogate serial pra tudo digitado por humano (`patrimonio` fica `unique`,
   não PK).
5. Ator de mutação sempre de `CurrentIdentity` (nunca do body); dado de negócio sobre alguém sem
   conta no sistema (ponto focal) é a exceção legítima que continua vindo do body.
