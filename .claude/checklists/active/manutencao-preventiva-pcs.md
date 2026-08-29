---
feature: Manutenção Preventiva de Computadores + Inventário
status: active
created: 2026-08-28
---

# Manutenção Preventiva de Computadores + Inventário

Digitaliza o processo de `Manutencao_Preventiva_PCs.pdf` (TI do CHVC): ciclos de preventiva em
lote por setor, inventário de computadores, setores sincronizados do GLPI. Requisitos completos em
`docs/requisitos.md`; decisões técnicas em `.claude/docs/standards/backend.md`. Estrutura aprovada
via `/davi-core:architect` em 2026-08-28; implementação começando na mesma sessão.

## Fatia MVP (ordem de dependência)

- [x] **B1 — Setores sincronizados do GLPI** — implementado, testado (6 testes unitários +
      validado ao vivo contra o GLPI real: 107 setores sincronizados corretamente, nomes vindo de
      `firstname`, nunca do login)
  - [x] `Sector` model + `sectors.py` schema
  - [x] `discover_user_category_id` em `src/ti_analytics/glpi/entities.py`
  - [x] `services/setor_sync.py` (lock, busca tudo antes de escrever, upsert por `id_glpi`)
  - [x] `routers/preventiva/sectors.py` (`GET /preventiva/sectors`)
  - [x] `POST /admin/sync-sectors` em `admin.py` + coluna `collection_runs.tipo` em `db.py`
        (reaproveitado com discriminador `tipo`, `list_collection_runs` agora filtra por tipo)
  - [x] `tests/test_setor_sync.py` (6 testes: criação com firstname, upsert idempotente,
        desativação sem deletar, falha não apaga dado local, lock de concorrência por tipo)
- [x] **A1+A2 — Inventário de computadores** — completo, backend + frontend
  - [x] `Computer` model + schema (`patrimonio` unique)
  - [x] `routers/preventiva/computers.py` (cadastrar, listar/filtrar, mover de setor)
  - [x] `GET /preventiva/sectors` agora inclui `qtd_computadores` (query agregada, sem N+1)
  - [x] `tests/test_inventory.py` (7 testes: criar, patrimônio duplicado→409, setor inexistente→404,
        filtro por setor/patrimônio, mover computador, contagem por setor incluindo setor vazio)
  - [x] Frontend: `/preventiva/inventario` (`SectorList`, `ComputerForm`, `ComputerList`)
- [x] **C1+C2+C2b — Criar ciclo, agendar, reconfirmar véspera** — completo, backend + frontend,
      validado ao vivo via HTTP (fluxo completo criar→agendar→bloqueio sem C2b→reconfirmar)
  - [x] `MaintenanceCycle`/`MaintenanceCycleItem` models + schemas
  - [x] `services/ciclos.py` (state machine — `ItemStatus`, `ALLOWED_TRANSITIONS`, `confirmar_item`,
        `reconfirmar_item`, `adicionar_item` com invariante de patrimônio em ciclo aberto)
  - [x] `routers/preventiva/_shared.py` (`require_admin_session`/`require_cycle_manager`/
        `require_item_executor`/`require_item_actor`)
  - [x] `routers/preventiva/cycles.py` + `cycle_items.py`
  - [x] Frontend: `/preventiva`, `/preventiva/novo`, `/preventiva/[id]` (`CycleList`, `CycleForm`,
        `CycleItemRow`, `ScheduleItemModal`, `ReconfirmChecklist`)
  - [x] `tests/test_ciclos.py` + `tests/test_preventiva_authz.py` (backend) +
        `ReconfirmChecklist.test.tsx` (frontend)
- [x] **C3+C4 — Checklist de execução + remarcar** — completo, backend + frontend, validado ao vivo
      (execução sem_achado→concluído confirmada via HTTP real)
  - [x] `executar_item`/`remarcar_item` em `services/ciclos.py`
  - [x] Endpoints de execução/remarcação em `cycle_items.py`
  - [x] Frontend: `ExecutionChecklist`, `RescheduleModal`
  - [x] `tests/test_ciclos.py` (transições C3/C4 + precondições) + `ExecutionChecklist.test.tsx`
        (obrigatoriedade condicional de chamado GLPI/pendência pra corretiva/interrompido)
- [x] **C5 — Fechamento do ciclo** — completo, backend + frontend, validado ao vivo (fechamento
      encerrado confirmado via HTTP real)
  - [x] `fechar_ciclo` em `services/ciclos.py` (bloqueia com pendência sem responsável+prazo)
  - [x] Endpoint de fechamento
  - [x] Frontend: `CloseCycleSummary`
  - [x] `tests/test_ciclos.py` (fechamento bloqueado vs liberado)

**Status geral: MVP completo — backend e frontend, todas as 5 fatias.** 195 testes Python + 52
testes frontend passando, `npm run build` limpo (0 erros TS), fluxo ponta a ponta validado via HTTP
real contra Postgres (docker compose) e GLPI real (107 setores sincronizados, ciclo de demonstração
criado: `Preventiva Setembro 2026`, id 1, em `/preventiva/1`).

## Pós-MVP — feedback do usuário testando ao vivo no navegador (2026-08-28)

- [x] Título "Manutenção Preventiva" quebrando linha no card do hub → fonte reduzida + nowrap
- [x] Dropdown "Adicionar computador ao ciclo" mostrava computador que já está no ciclo → filtrado
      (`jaNoCiclo`), com estado vazio quando não sobra nenhum
- [x] Filtro de Status em `CycleList` sem espaçamento (label colado no select) → classe
      `preventiva-inline-form` aplicada (as outras telas já estavam corretas)
- [x] **Catálogo de checklist editável pelo admin** (não pedido no MVP original, pedido nesta
      rodada): `ChecklistItemDef` (model+schema+CRUD em `routers/preventiva/checklist_items.py`),
      seed do vocabulário original do PDF só na 1ª subida, `ChecklistItemsPanel` em `/admin` → aba
      Checklists (abas por tipo, adicionar/editar/ativar-desativar/remover/reordenar). Backend não
      lê mais listas fixas — `services/ciclos.py::active_checklist_items()` consulta o catálogo.
- [x] **Permissão de edição no checklist de execução**: técnico só preenche até finalizar
      (Concluído/Pendente vira somente-leitura pra ele); admin pode reabrir e corrigir a qualquer
      momento (`executar_item(..., permitir_edicao=True)`, gate real no router `cycle_items.py`).
      `CycleItemRow` mostra "Ver checklist" (técnico) ou "Editar checklist" (admin) no lugar do
      resumo de texto simples.
  - [x] 2 testes novos em `test_ciclos.py` (bloqueia sem `permitir_edicao`, libera com admin)
- [x] **Formulário de execução reorganizado em abas** (Checklist / Resultado / Validação) — estava
      "muito feio" (feedback literal) com os 10 itens + todos os campos condicionais numa lista só
  - [x] `tests/test_checklist_items.py` (5 testes CRUD) + `ExecutionChecklist.test.tsx` reescrito
        pro modo somente-leitura + navegação por aba
- [x] **2ª rodada de feedback visual (ainda "feio")**: `ChecklistItemDef.secao` novo (coluna +
      schema + CRUD) — admin agrupa as perguntas em seções (ex. "Abertura do atendimento",
      "Inspeção física", "Diagnóstico do sistema", "Testes funcionais", "Fechamento" — seed já
      populado com essa divisão pro checklist de execução, e retrocompatibilizado no Postgres
      rodando via `PUT` em cada item já existente, já que o seed só roda na 1ª subida)
  - [x] Controle OK/NA trocado de radio nativo (saindo com cor vermelha do SO, não do tema) pra
        pill segmentado estilizado 100% em CSS (`preventiva-exec-okna-option`)
  - [x] Campo de observação vira "+ observação" (só aparece quando clicado ou já tem texto) em vez
        de input sempre visível em todo item — menos poluição visual
  - [x] Contador "N/10 marcados" na aba Checklist
  - [x] `agruparPorSecao()` compartilhado (`lib/preventiva-checklists.ts`) — usado em
        `ExecutionChecklist`, `ReconfirmChecklist` e no próprio painel admin (`ChecklistItemsPanel`
        agora mostra/edita `secao` por item)
- [x] **3ª rodada de feedback visual — tela de Inventário + tabela do ciclo** (usuário testando via
      `docker compose`, porta 3300; lembrete: o serviço `web` é build de produção assado na imagem,
      então cada ajuste de UI exige `docker compose up -d --build web` + hard-refresh — não tem mount
      de código)
  - [x] `SectorList` sem paginação despejava os 107 setores → paginação client-side de 10 +
        busca + filtro de unidade + filtro ativo/inativo + cabeçalhos ordenáveis
  - [x] `ComputerList` idem: busca por patrimônio (debounce 300ms) + filtro de setor + ordenação
        por coluna (nova param `sort`/`sort_dir` no `GET /preventiva/computers`, +1 teste em
        `test_inventory.py`), page size 10
  - [x] `SortHeader`/`compareBy` compartilhados (`components/preventiva/SortHeader.tsx`)
  - [x] Tabelas "tortas"/com scroll horizontal: `table-layout: fixed` virou opt-in
        (`.preventiva-table.is-fixed`) só nas 3 tabelas paginadas, colgroup em `%` (não `rem` —
        `rem` colapsava coluna a 1 letra por linha em telas médias); `.preventiva-move-cell`
        segura o `<select>` de "Mover para" com `min-width:0` pra não estourar
  - [x] `.preventiva-inline-form` distribui os campos por igual (`flex:1 1 11rem; max-width:17rem`)
        — o `<select>` de setor não estica mais sozinho pro tamanho da maior option
  - [x] Checklist de execução: espaçamento 2rem entre seções + barra lateral indentando os itens
  - [x] Tabela do ciclo (`/preventiva/[id]`): coluna "Ações / Resultado" → "Ações", "Ver/Editar
        checklist" virou ícone (`Eye`/`SquarePen`), resumo de resultado sai da tabela (fica no modal)
  - [x] `PlanningChecklist` novo componente — checklist de planejamento agora usa a mesma linguagem
        do de execução (pill "Feito/Pendente" + contador), a pedido do usuário (era o inverso do que
        eu tinha entendido: manter o de execução, subir o de planejamento pro mesmo nível)
- [x] **4ª rodada — "ponto focal" → "responsável do setor" + próxima preventiva automática**
  - [x] Termo "ponto focal" trocado por "responsável do setor" nos rótulos da aba Validação e no
        vocabulário de seed dos 3 checklists (`DEFAULT_*_CHECKLIST_ITEMS` + `DEFAULT_EXECUCAO_SECOES`).
        Colunas do banco continuam `ponto_focal_nome`/`ponto_focal_data` (rename sem Alembic não
        compensa) — só rótulo. Itens de checklist já existentes no Postgres: o admin edita em
        /admin → Checklists (o seed só roda na 1ª subida).
  - [x] `MaintenanceCycle` ganhou `intervalo_alta_meses`/`intervalo_normal_meses`/`intervalo_baixa_meses`
        (default 3/6/12; +3 linhas em `db.py::ensure_additive_columns`, aplicado ao ciclo demo). Admin
        define na criação do ciclo (`CycleForm` — fieldset novo).
  - [x] `executar_item` calcula `proxima_preventiva` = `data_agendada` (ou hoje) + intervalo do
        ciclo p/ a prioridade do item (`calcular_proxima_preventiva`, via `dateutil.relativedelta`).
        Param `proxima_preventiva` virou override opcional (default None → calcula). Frontend não
        manda mais — campo na aba Validação virou somente-leitura.
  - [x] +2 testes em `test_ciclos.py` (guarda intervalos custom; calcula próxima preventiva)
- [x] **5ª rodada — tela "Novo ciclo" + lista de ciclos**
  - [x] `/preventiva/novo` estava em `sumula-container-estreita` (560px) → `sumula-container-hub`
        como as irmãs, card capado em 44rem. Título "Novo ciclo de manutenção preventiva" quebrava
        linha no container estreito → encurtado pra "Novo ciclo de preventiva".
  - [x] Bug de layout: `.preventiva-form` tinha `flex-wrap: wrap` num container `column` → o browser
        abria buracos verticais quando havia `.preventiva-inline-form` aninhado. `flex-wrap` agora
        só no `.preventiva-inline-form`.
  - [x] `MaintenanceCycle.data_inicio` novo (+ `db.py::ensure_additive_columns`). `CycleForm` tem
        "Data de início" + "Data final (prevista)" lado a lado; validação fim ≥ início (schema +
        serviço). `CycleList` e `/preventiva/[id]` mostram as duas datas.
  - [x] `DELETE /preventiva/cycles/{id}` (admin) — hard delete do ciclo + itens
        (`ciclos.excluir_ciclo`), libera os PCs. Botão de lixeira (`Trash2`) por linha no `CycleList`
        com `window.confirm`. `cycles.remove` no api.ts.
  - [x] +3 testes em `test_ciclos.py` (datas início/fim, fim antes do início → 422, excluir apaga
        ciclo+itens e libera o PC)
  - [x] `CycleForm` reescrito com grid `.preventiva-cycle-form` (2 col; nome/responsável/fieldset
        ocupam a linha, datas dividem) — estava "feio e desalinhado" (campos em 3 larguras
        diferentes, spinners de número espremidos). Inputs `type=number` sem spinner, botão não
        estica mais (`justify-self: start`). `.preventiva-fieldset` antigo removido.
  - [x] `CycleList`: coluna Status centralizada (`.preventiva-cell-center`, zera o `margin-left` do
        badge). "Abrir →" removido — linha inteira clicável (`tr.is-clickable` + `onClick` →
        `router.push`; nome vira `<a class="preventiva-row-link">` p/ teclado/middle-click, com
        `stopPropagation`). Lixeira também com `stopPropagation`. Colgroup rebalanceado (última col
        6%).
- [x] **Nota de sessão paralela**: durante as rodadas 4-5 outra sessão trabalhou em paralelo na
      área de inventário (baixa de PC, `Computer.ativo`, `EditComputerModal`, página por setor,
      `incluir_inativos`). Os dois fluxos coexistiram sem conflito — `SortHeader`/`ComputerSort`/
      `.preventiva-icon-btn` foram reaproveitados pela outra sessão. Testes: 212 py + 55 front.
- [x] **Setores clicáveis + gestão de computadores por setor** (pedido em 2026-08-28,
      `docs/requisitos.md` A4/A5, plano aprovado via `/architect`)
  - Backend:
    - [x] `Computer.ativo` (soft-delete/baixa) + linha em `db.py::ensure_additive_columns`.
          **Bug pego pelo usuário testando no docker**: `... ADD COLUMN ativo BOOLEAN NOT NULL
          DEFAULT 1` falha no Postgres (`column is of type boolean but default expression is of
          type integer`) — e o `except (OperationalError, ProgrammingError): pass` engole o erro,
          então a coluna nunca era criada e todo `SELECT computers.ativo` dava 500 (o frontend
          mostrava "NetworkError" porque o 500 vinha sem header de CORS). Corrigido pra
          `DEFAULT true` (funciona em PG e SQLite). Coluna aplicada na mão no PG do compose
          (`ADD COLUMN IF NOT EXISTS ... DEFAULT true`); `up -d --build api` reroda limpo.
          As linhas `DEFAULT 1/0` que já existiam nunca rodaram no PG — as tabelas delas sempre
          nasceram com a coluna via `create_all()` (defaults viram `true`/`false` lá).
    - [x] `ComputerUpdate` schema (parcial) + `PATCH /preventiva/computers/{id}` — corrigir
          patrimônio (409 em duplicado, exclui o próprio id), hostname, transferir de setor
          (grava `setor_alterado_em`), `ativo`. `PATCH /{id}/move` mantido (tem testes).
    - [x] `GET /preventiva/computers?incluir_inativos=` (default só ativos).
    - [x] `GET /preventiva/sectors/{id_glpi}` (setor + contagem, 404). Contagem de PCs por setor
          (`list_sectors` e `get_sector`) passou a contar **só ativos** — predicado no ON do
          outerjoin pra setor vazio continuar aparecendo com 0.
    - [x] `ciclos.adicionar_item` rejeita PC `ativo=false` (`TransitionPreconditionError` → 422).
    - [x] `test_inventory.py` +10 testes, `test_ciclos.py` +1. `pytest -q` → 212 passa
          (as 3 rodadas da sessão paralela já tinham subido a contagem; total consistente).
  - Frontend:
    - [x] Nova rota `/preventiva/inventario/setor/[id]` (`SetorInventarioPage`) — cabeçalho do
          setor + `ComputerForm lockedSetorId` + `ComputerList setorId`.
    - [x] `SectorList`: nome do setor virou `<Link>` (`.preventiva-link`) + hint no header do painel.
    - [x] `ComputerForm` ganhou `lockedSetorId?` (esconde o `<select>` de setor).
    - [x] `ComputerList` ganhou `setorId?` (trava o filtro) + `onChanged?` + checkbox "Mostrar
          desativados". Célula inline "Mover para" → botão "Editar" (`SquarePen`) abrindo
          `EditComputerModal` (patrimônio + hostname + setor + desativar/reativar num modal só).
    - [x] `/preventiva/[id]`: resolução de nome de PC usa `incluir_inativos:true` (PC baixado que
          já está no ciclo mostra o patrimônio); `AddItemSection` usa só ativos. SWR keys
          separadas (`["computers-all","incl-inativos"]` vs `["computers-all","ativos"]`).
    - [x] `api.ts`: `Computer.ativo`, `computers.update`, `computers.list({incluirInativos})`,
          `sectors.get`. `.preventiva-checkbox-label` novo em `globals.css`.
    - [x] `EditComputerModal.test.tsx` (+3). `npm run test` → 55, `npm run build` limpo, `tsc` limpo.
    - [x] Smoke test HTTP real (sqlite): create→ativo, `GET /sectors/{id}` count, 404, PATCH
          hostname/patrimônio-dup-409/transfer/setor-404/deactivate, list default vs
          `incluir_inativos`, contagem do setor ignorando baixado — todos OK.
    - [x] Revalidado contra o Postgres do `docker compose` (porta 8800) depois do fix do
          `DEFAULT true`: `/preventiva/sectors` (107 setores + contagem), `/preventiva/computers`
          (`ativo:true` no PC demo), `/preventiva/sectors/{id}` — todos 200.
- [x] **Abas na tela de Inventário + coluna "próxima manutenção"** (feedback do usuário no navegador,
      2026-08-28)
  - [x] `/preventiva/inventario` virou 2 abas (`Tabs`): **Setores** / **Computadores** (`useState`,
        mesmo padrão do dashboard/admin).
  - [x] `ComputerForm` **removido da tela de Inventário** — cadastro só na página do setor (sempre
        precisa escolher setor de qualquer jeito). `ComputerList.refreshKey` virou opcional
        (`= 0`), já que sem form não há trigger externo na aba Computadores.
  - [x] `ComputerList`: coluna **"Próxima manutenção"** (`computer.proxima_preventiva ?? "—"`).
        Backend: `ComputerOut.proxima_preventiva` (default `None` nas mutações) derivada em
        `list_computers` por subquery escalar correlacionada — `proxima_preventiva` do
        `maintenance_cycle_item` de maior `id` do PC que já a tem preenchida (só finalizados
        preenchem). Não é coluna de `computers`, não denormaliza. Coluna+filtro de Setor somem
        quando `ComputerList` está travado num setor (`showSetor`).
  - [x] `api.ts`: `Computer.proxima_preventiva`. `test_inventory.py` +2, `ComputerList.test.tsx`
        novo (+2). Verificado que a subquery correlacionada roda no Postgres do compose (PC demo
        → `2027-02-28`).
- [x] **6ª rodada — tirar computador do ciclo + adicionar em lote por setor**
  - [x] `DELETE /preventiva/cycles/{ciclo_id}/items/{item_id}` (`ciclos.remover_item`, gate
        `require_cycle_manager`) — hard delete do item, bloqueado se já Concluído/Pendente (é
        histórico do ciclo, não se apaga). Ícone de lixeira em `CycleItemRow` (admin), ao lado dos
        botões de fluxo (Agendar/Executar/Remarcar).
  - [x] `AddItemsSection` (novo componente, substitui o antigo `AddItemSection` inline em
        `[id]/page.tsx`): fluxo virou **por setor, em lote** — seleciona 1+ setores (chips
        pesquisáveis, `.preventiva-sector-picker`) → aparece um checklist dos PCs disponíveis
        desses setores → marca quais entram, cada um com um **técnico opcional já pré-atribuído**
        (select por linha, desabilitado se o PC não estiver marcado) → 1 prioridade pro lote →
        `POST /items` em paralelo (`Promise.allSettled`, 1 por PC, sem corrida entre eles - ids
        distintos).
  - [x] `adicionar_item`/`AddItemRequest`/`POST /cycles/{id}/items` ganharam `tecnico_id` opcional
        (não confirma sozinho - Confirmado ainda exige data junto, ver `confirmar_item`).
  - [x] +6 testes em `test_ciclos.py` (técnico pré-atribuído, técnico inexistente → 422, remover
        item não-finalizado apaga e libera o PC, remover finalizado bloqueia).
  - [x] Limitação conhecida: o botão de remover item só aparece pro admin no front (`isAdmin`),
        embora o backend também libere pro responsável do ciclo (`require_cycle_manager`) - mesma
        simplificação já usada no delete de ciclo do `CycleList`. Se um responsável não-admin
        precisar tirar item, hoje só via API direta.
- [x] **7ª rodada — `/preventiva/[id]` em abas**: tela virou uma rolagem só (checklist de
      planejamento + adicionar computadores + tabela + fechamento, tudo empilhado). Reorganizada com
      `Tabs` (mesmo padrão do `/preventiva/inventario`): **Planejamento** / **Computadores (N)**
      (contador de itens no rótulo) / **Fechamento** — só aparecem pra ciclo em planejamento; ciclo
      encerrado mostra só a aba Computadores (sem abas, já que é a única), num modo histórico.
- [x] **8ª rodada — Score de saúde do equipamento** (pedido em 2026-08-29, sessão paralela já tinha
      feito o `computer_sync.py` de identidade/setor; esta rodada é a camada de hardware por cima).
      Investigação ao vivo primeiro (`glpi_probe*.py` no scratchpad): confirmado que o agente traz
      RAM/disco(SSD-HDD)/espaço-livre/SO/CPU/GPU de graça, mas **não** traz patrimônio nem setor
      (decidido: score não precisa deles). Antivírus via GLPI não existe nessa instalação.
  - [x] `ComputerHardware` (model 1:1 com `Computer`, upsert por sync — nunca histórico) +
        `services/hardware_sync.py` (busca `Item_Device*`/`Item_Disk`/`Item_OperatingSystem` por PC,
        `_CatalogCache` pra não repetir resolução de catálogo entre máquinas do mesmo lote).
        Integrado no `execute_computer_sync` existente (mesmo `CollectionRun tipo=computadores`, sem
        endpoint novo) — `counts["hardware_atualizado"]`.
  - [x] `services/hardware_score.py::calcular_score` — 0-100, maior=melhor, pesos documentados
        (RAM 25 / disco tipo 20 / espaço livre 15 / SO 20 / tempo sem formatar 10 / GPU 5 / CPU 5).
        `None` pra PC sem sync (nunca inventa nota). Nível critico(<40)/atencao(<70)/bom.
  - [x] `ComputerOut.hardware_score`/`hardware_nivel`/`hardware_detalhes` — derivados em
        `list_computers` via outerjoin + Python (só a página, 10-20 linhas). Coluna **"Saúde"** no
        `ComputerList` (badge colorido por nível, tooltip = breakdown; "—" quando sem dado).
  - [x] +19 testes (`test_hardware_score.py` 13, `test_computer_sync.py` +3 hardware, `test_inventory.py`
        +2, `ComputerList.test.tsx` +1). **Validado ao vivo**: sync real contra o GLPI (1 PC de teste,
        `HGVC-TI-002`) → score **69 (atenção)**: puxado pra baixo por *5% de espaço livre (crítico)* e
        *Windows 10 (suporte estendido)*, apesar de 16GB RAM + SSD + i3-12ª ger.
  - [x] **Bug crítico corrigido** (usuário no navegador): editar um PC importado do GLPI (sem
        patrimônio, sem setor) explodia a tela inteira ("This page couldn't load"). Causa:
        `EditComputerModal` fazia `computer.patrimonio.trim()` durante o render com `patrimonio=null`.
        Tipo `Computer` no `api.ts` ainda dizia `patrimonio: string` / `setor_atual_id: number` —
        alinhado com o backend (`string | null` / `number | null`). Modal: patrimônio deixou de ser
        obrigatório, select de setor ganhou "Sem setor atribuído", dá pra atribuir/limpar. `ComputerList`
        mostra "—"/"sem patrimônio" em vez de `#null`. `AddItemsSection` só lista PC com setor (o
        fluxo é por setor). `computers.update` no api.ts aceita `null` explícito.
  - [ ] **Pendente / fast-follow** (conversado, deprioritizado de propósito):
        - "N chamados recentes do PC" como métrica separada (via `Item_Ticket`, relacionamento já
          confirmado que existe) — NÃO entra no score, mostrar do lado.
        - "tempo sem formatar" hoje usa `install_date` do GLPI; ideal é uma reinstalação registrada
          via preventiva prevalecer (mesmo padrão do `proxima_preventiva`).
        - auto-sugerir `prioridade=alta` no `AddItemsSection` quando o score é baixo.
- [x] **9ª rodada — camada de identidade/sync do GLPI (a "outra" sessão paralela)**: o
      `services/computer_sync.py` que a 8ª rodada assumiu pronto foi de fato construído aqui, junto
      com o resto do vínculo PC↔GLPI. Feito nesta rodada:
  - [x] `Computer.id_glpi_computer` (nullable unique) + `setor_atual_id`/`patrimonio` **nullable**
        (migração via `db.py::ensure_additive_columns` — `ALTER COLUMN ... DROP NOT NULL`, idempotente
        no PG, no-op no SQLite; `CREATE UNIQUE INDEX IF NOT EXISTS` pro link). Decisão do usuário:
        patrimônio é etiqueta externa (setor de patrimônio do hospital), existe PC sem ela — opcional
        **nos dois** caminhos (manual e importado).
  - [x] `services/computer_sync.py` (mirror de `setor_sync.py`, `CollectionRun tipo=computadores`,
        lock): pull-only, `otherserial`→patrimônio (nunca `serial`), `users_id`→setor só quando
        resolve, **nunca zera setor já atribuído na plataforma**, colisão de patrimônio → sufixo
        `-glpiN`. `POST /admin/sync-computers` + `list_collection_runs` aceita o tipo novo.
  - [x] `ComputerUpdate` aceita `null` explícito pra **limpar** patrimônio/setor (`"key" in data`
        em vez de `is not None`, mesmo padrão do `hostname`). `create_computer` só checa duplicata de
        patrimônio quando um valor de verdade veio.
  - [x] Front: `ComputerSyncPanel` no `/admin` → aba Coleta (fecha o "pendente" da 8ª rodada),
        `adminApi.syncComputers`, `Computer.id_glpi_computer` no `api.ts`.
  - [x] **Unidade → setor em cascata** (pedido do usuário: 100+ setores numa lista só): `EditComputerModal`
        e `ComputerForm` escolhem a unidade (HGVC/UPA) primeiro, o `<select>` de setor mostra só os
        dela. Setor atual do PC continua aparecendo mesmo de outra unidade/inativo.
  - [x] `tests/test_computer_sync.py` (8), `test_inventory.py` (+6: patrimônio opcional, limpar
        patrimônio/setor via update, 2 PCs sem patrimônio não colidem). `EditComputerModal.test.tsx`
        ajustado pro fluxo unidade→setor. **Validado ao vivo** contra o GLPI real: sync criou
        `HGVC-TI-002` (`sem_patrimonio:1`, `sem_setor_resolvido:1`); usuário depois preencheu
        `otherserial=762122` + "Usuário"=Terapia Ocupacional no GLPI e re-sincronizou — resolveu.
  - [x] **Linha do computador clicável → detalhe com specs + score aberto** (feito nesta rodada, o
        usuário confirmou que as "sessões paralelas" eram outro projeto):
    - [x] `hardware_score.py::calcular_score` ganhou `componentes: list[ScoreComponente]`
          (`dimensao`/`pontos`/`peso`/`texto`) — aditivo, os 13 testes existentes seguem passando.
    - [x] `GET /preventiva/computers/{id}` → `ComputerDetailOut` (= `ComputerOut` + `hardware:
          ComputerHardwareOut | None` + `score_componentes`). outerjoin com `ComputerHardware`,
          404 se o PC não existe.
    - [x] `ComputerDetailModal` — score hero (número + nível) + barra por dimensão
          (`pontos/peso`, cor por completude: verde/âmbar/vermelho) + grid de especificações
          (CPU / Memória / Disco / Sistema / Vídeo). Estado vazio pra PC sem hardware (manual).
          Linha da `ComputerList` virou `is-clickable` → abre o detalhe; botão Editar dentro dela
          faz `stopPropagation`. "Editar" no detalhe fecha e abre o `EditComputerModal`.
    - [x] `computers.get` no `api.ts` + tipos `ComputerHardware`/`ScoreComponente`/`ComputerDetail`.
          `.preventiva-detail-box`/`.preventiva-detail-specs`/`tr.is-clickable` no `globals.css`.
    - [x] `+3` testes backend (`get_computer` com/sem hardware, 404) + `ComputerDetailModal.test.tsx`
          (2). **Validado ao vivo** contra o GLPI real: `GET /preventiva/computers/1` do PC de teste
          devolveu specs completas + score 69 aberto (RAM 25/25, disco SSD 20/20, espaço livre
          **0/15**, Win10 10/20, GPU 2/5, CPU 2/5).
- [x] **Setores de manutenção TI/ME/MP + hardware manual + hard delete** (3 pedidos do usuário na
      mesma rodada):
  - [x] **TI/ME/MP não apareciam** como setor: são categoria `Supervisor` (id 3), fora do grupo
        "Setores", `entities_id=raiz`. `setor_sync` agora também puxa contas das
        `categorias_extra` configuradas (`pipeline.yaml::setores`, default `["Supervisor"]`) via
        scan de `/User`, com `unidade_slug` fixa `"geral"` (transversais — o `ti-supervisor` cobre
        HGVC e UPA). Frontend: filtro de unidade ordena "geral" por último (`ordenarUnidades` em
        `SortHeader`). **Validado ao vivo**: 110 setores (107 + 3 "geral"). +2 testes
        (`test_setor_sync.py`).
  - [x] **Hardware manual** pra PC sem agente: `ComputerHardwareInput` + `PUT`/`DELETE
        /preventiva/computers/{id}/hardware` (422 se `id_glpi_computer` setado — vem do agente).
        `_montar_detalhe` extraído pra reuso. `ComputerHardwareForm` (GB↔MB no front) dentro do
        `ComputerDetailModal` — "Informar manualmente" / "Editar" / "Remover"; o score recalcula
        na hora. **Validado ao vivo**: PUT com 4GB/HDD/Celeron → score 28 (crítico); DELETE → volta
        a None.
  - [x] **Hard delete** de PC: `DELETE /preventiva/computers/{id}` (apaga PC + `ComputerHardware`),
        409 se está em ciclo. Botão "Excluir permanentemente" (`window.confirm`) no
        `EditComputerModal`, separado da baixa. `.preventiva-linkish`/`.is-danger` no `globals.css`.
  - [x] `+7` testes backend (`test_inventory.py`: hardware manual/upsert/422, delete hardware,
        hard delete ok/409/404) + `ComputerDetailModal.test.tsx` reescrito pro estado manual.

## Quality gates

- [x] Testes passando: `pytest -q` → 260/260. `npm run test` → 61/61. `npm run build` → limpo.
- [ ] `/davi-core:review` aprovado (inclui security — autorização por recurso e captura de ator
      já mapeadas em `backend.md` §5/§6, conferir que a implementação seguiu à risca; conferir
      também o gate novo de edição pós-finalização)
- [~] Verificado de ponta a ponta — API: chamada real via `/docs` e fluxo HTTP completo, feito.
      UI: **usuário testando ao vivo no navegador nesta sessão** (não sou eu, Claude, que não tenho
      navegador neste ambiente) — 3 rodadas de feedback visual já aplicadas e corrigidas. Ainda não
      há confirmação formal de fim-a-fim (`/davi-ux:verify-ui` com screenshot) nem cobertura de todo
      o fluxo (ex.: painel de checklists do admin, edição pós-finalização) foi clicada pelo usuário.
- [ ] `/davi-core:retro` ao concluir (milestone) — primeira feature transacional do projeto,
      aprendizados prováveis sobre o padrão sem-Alembic e autorização por recurso

## Notas

- GLPI real já confirmado ao vivo: grupo "Setores" (id descoberto por nome, hoje 24) com 108
  usuários fictícios, categoria "Setor" (id descoberto por nome, hoje 2 em `/UserCategory`), nome
  de exibição em `firstname` — nunca usar o `name`/login.
- Gotcha sem Alembic: qualquer coluna nova adicionada depois da primeira criação de uma destas 4
  tabelas precisa de linha manual em `db.py::ensure_additive_columns` (`backend.md` §3.4) — não
  esquecer ao evoluir o schema depois do MVP.
- Gotcha **coluna BOOLEAN nova em `ensure_additive_columns`**: usar `DEFAULT true`/`DEFAULT false`,
  nunca `DEFAULT 1`/`DEFAULT 0`. O Postgres rejeita int→boolean num `ADD COLUMN` e o
  `except (OperationalError, ProgrammingError): pass` engole o erro — a coluna some sem aviso e só
  aparece como 500 em runtime. As linhas `DEFAULT 1/0` que já estão no arquivo são no-ops
  históricos (as tabelas delas nasceram com a coluna via `create_all()`); não copiar o padrão.
