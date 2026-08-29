# Requisitos

Um arquivo cumulativo — uma seção por feature. Não fragmentar em arquivos separados.

---

## Manutenção Preventiva de Computadores + Inventário

**Origem**: `Manutencao_Preventiva_PCs.pdf` (processo já formalizado pela TI do CHVC — não é invenção
nossa, é a digitalização de um fluxo em papel/planilha que já roda). Pedido do usuário: trazer esse
fluxo pra dentro da plataforma, com inventário de computadores e setores puxados do GLPI.

**Necessidade real por trás do pedido**: hoje o ciclo de preventiva é controlado em planilha/papel,
sem ligação com o GLPI (que já é a fonte de verdade dos chamados neste projeto) nem com o dashboard
de scores. Sem a feature, não há visibilidade de quantos PCs cada setor tem, se estão em dia com a
preventiva, nem rastro estruturado de pendências/corretivas por ciclo.

**Mudança de escopo do projeto**: até aqui o catálogo Postgres só tinha `units`/`technicians`
(read-only analytics, v1 — ver CLAUDE.md). Esta feature introduz a primeira dado transacional real
(CRUD de ciclos, itens, checklists) — decisão consciente, não incidental.

### Decisões já tomadas nesta rodada (não reabrir sem motivo novo)

- **Ponto focal do setor não tem login próprio.** O técnico registra nome + data do ponto focal ao
  concluir o checklist do PC (replica 1:1 o campo "Validação do setor" do processo em papel). Auth
  continua só `tecnico`/`admin` — sem 3º `subject_type`, sem cadastro de usuário de setor clínico/
  administrativo.
- **"Responsável pelo ciclo" é um campo por-ciclo, não uma permissão global.** O admin cria o ciclo e
  atribui um técnico como responsável daquele ciclo específico (ou assume o papel ele mesmo). Não usa
  o `papel` de `team_roles.yaml` (coordenadora/tático/plantonista) como gate — é uma atribuição ad-hoc,
  reatribuível pelo admin a qualquer momento. Um técnico só gerencia (agenda, fecha) os ciclos em que
  foi designado responsável; continua podendo executar itens que lhe foram atribuídos em qualquer
  ciclo.

### Épico B — Setores sincronizados do GLPI

Pré-requisito dos outros dois épicos (inventário e ciclos referenciam setor).

**Modelo real, confirmado ao vivo contra o GLPI (não é suposição)**: setor **não** é o itemtype
`Location` (esse só tem 4 registros — os hospitais inteiros, sem granularidade nenhuma). Setor é uma
conta de **`User`** fictícia do GLPI (ex. `hgvc-nutricao`), membro do grupo **"Setores"** (hoje id 24
— descoberto por nome, nunca hardcoded, reaproveitando `entities.py::discover_group_id`) e com
`usercategories_id` apontando pra categoria **"Setor"** (hoje id 2 em `/UserCategory` — também
descoberta por nome, mesmo padrão). 108 setores já cadastrados no GLPI real hoje. Campos relevantes
de cada `User`: `id` (→ `id_glpi`), `firstname` (→ nome de exibição do setor — **nunca** usar `name`,
que é o login técnico tipo `hgvc-nutricao`), `entities_id` (liga direto à unidade HGVC/UPA — mesmos
ids que `discover_ti_entities` já resolve, sem árvore/hierarquia nenhuma pra achatar), `is_active`.

**B1 — Sincronizar setores do GLPI**
Como admin, quero sincronizar os setores do GLPI com a plataforma, para que o inventário e os ciclos
usem os setores reais do hospital sem recadastro manual.

- Dado que o admin aciona "sincronizar setores" (painel `/admin`, mesmo padrão do botão "Rodar
  coleta" já existente), quando a sincronização roda, então a plataforma busca os `User` membros do
  grupo "Setores" (`/Group/{id}/User`, id descoberto por nome) e grava/atualiza uma tabela local
  `setores` (`id_glpi`, `nome` ← `firstname`, `entities_id`, `unidade` ← resolvida a partir de
  `entities_id` no mesmo padrão de `unidade_pai`/`unidade_slug` de `entities.py`, `ativo` ←
  `is_active`).
- Dado um setor já existente localmente (por `id_glpi`), quando a sincronização roda de novo, então
  nome/unidade/ativo são atualizados (upsert) — nunca duplicado.
- Dado um setor com `is_active=0` no GLPI (ou removido do grupo "Setores"), quando a sincronização
  roda, então ele é marcado `ativo=false` localmente (nunca deletado — preserva histórico de PCs/
  ciclos que já o referenciam).
- Dado que a sincronização falha (GLPI fora do ar, timeout), quando isso acontece, então a última
  lista sincronizada com sucesso continua disponível e o erro fica visível pro admin — nunca apaga o
  que já tinha.

Casos de borda:
- GLPI devolve zero usuários no grupo "Setores" (grupo renomeado/esvaziado) → estado vazio explícito
  na tela, não erro.
- Duas sincronizações disparadas em sequência rápida → só uma roda por vez (mesmo padrão de lock já
  usado pela coleta, se existir em `scheduler.py`; verificar na implementação).
- Um `User` no grupo "Setores" sem `firstname` preenchido (cadastro incompleto no GLPI) → cai pro
  `name` (login) como fallback de exibição, mas fica sinalizado como "nome incompleto" pro admin
  corrigir direto no GLPI (a plataforma não edita usuário do GLPI).

### Épico A — Inventário de computadores

**A1 — Cadastrar computador**
Como técnico ou admin, quero cadastrar um computador com patrimônio, hostname e setor, para que cada
equipamento tenha um registro único rastreável.

- Dado o formulário de cadastro, quando preenchido com patrimônio (obrigatório, único), hostname e
  setor (escolhido da lista sincronizada) e salvo, então o PC aparece na lista do setor escolhido.
- Dado um patrimônio já cadastrado, quando alguém tenta cadastrar outro PC com o mesmo patrimônio,
  então a plataforma rejeita com mensagem clara.
- Dado um PC cadastrado, quando o setor dele muda (equipamento transferido), então uma ação de "mover
  de setor" atualiza o setor atual e registra a data da mudança (histórico mínimo, não precisa de
  tela própria de histórico de transferência no MVP).

**A2 — Ver quantidade de PCs por setor**
Como responsável pelo ciclo, quero ver quantos computadores cada setor tem, para dimensionar o ciclo
(quantidade planejada vs. disponibilidade da equipe).

- Dado a tela de setores, quando carregada, então cada setor mostra a contagem de PCs cadastrados.
- Dado um setor sem PCs, quando exibido, então mostra "0 computadores" (não some da lista).

**A3 — Ver histórico de preventiva de um PC**
Como técnico, quero ver a última e a próxima preventiva de um computador, para saber se está em dia
ou vencido.

- Dado um PC com preventiva concluída, quando aberto o detalhe, então mostra data/resultado da última
  e a próxima prevista.
- Dado um PC nunca atendido, quando aberto, então mostra "nunca atendido" (estado vazio explícito).

**A4 — Página do setor + editar computador** (pós-MVP, pedido em 2026-08-28)
Como técnico ou admin, quero clicar num setor na tela de Inventário e ver/gerenciar os computadores
daquele setor, para não ter que filtrar a lista global toda vez.

- Dado a tela de Inventário, quando carrega, então tem duas abas — **Setores** e **Computadores**.
  O cadastro de computador **não fica mais na tela de Inventário**: só na página de um setor
  (abaixo), porque cadastrar sempre exige escolher o setor.
- Dado a tabela de setores, quando clico no nome de um setor, então abro `/preventiva/inventario/
  setor/{id}` — cabeçalho do setor (nome, unidade, contagem, badge "inativo" quando for o caso) +
  formulário de cadastro já travado nesse setor + lista dos computadores do setor.
- Dado a lista de computadores (aba Computadores ou página do setor), quando abro "Editar" num PC,
  então um único modal permite corrigir patrimônio e hostname e transferir de setor (substitui a
  ação inline "mover de setor" do MVP — mesma regra: transferir grava a data da mudança).
- Dado que troco o patrimônio para um valor já usado por outro PC, quando salvo, então a plataforma
  rejeita com mensagem clara (a constraint `unique` continua valendo).
- Dado a lista de computadores, quando carrega, então cada PC mostra a **próxima manutenção
  prevista** (`—` se nunca teve preventiva finalizada). É derivada do item de ciclo mais recente do
  PC que já tem `proxima_preventiva` preenchida — não é campo digitado nem coluna de `computers`
  (cumpre a parte "próxima" do A3 sem denormalizar).

**A5 — Desativar computador (baixa/descarte)** (pós-MVP, pedido em 2026-08-28)
Como técnico ou admin, quero marcar um computador como baixado quando ele é descartado, para ele sair
das listas sem perder o histórico de preventiva.

- Dado um PC no modal de edição, quando aciono "Desativar computador" e salvo, então ele fica
  `ativo=false` — nunca é deletado.
- Dado um PC desativado, quando as listas de inventário carregam, então ele não aparece por padrão;
  um filtro "Mostrar desativados" o traz de volta (marcado como "baixado"). A contagem de PCs do
  setor passa a considerar só os ativos.
- Dado um PC desativado, quando alguém tenta adicioná-lo a um ciclo, então a plataforma bloqueia
  (422). Um PC que já estava num ciclo antes da baixa continua aparecendo naquele ciclo com o
  patrimônio (histórico intacto).
- Reativar é o mesmo modal ("Reativar computador").

Casos de borda:
- Setor do PC foi inativado no GLPI depois do cadastro → PC mantém a referência, setor aparece como
  inativo na tela, não quebra o registro.
- Fora do MVP (não pedido, cortado explicitamente): importação em massa via CSV. Cadastro é unitário
  por enquanto; revisitar se o volume de PCs tornar o cadastro manual inviável.

**A6 — Importar computadores do GLPI + score de saúde** (pós-MVP, pedido em 2026-08-29)
Como admin, quero puxar os computadores do GLPI Agent e ver um score de saúde de cada um, para
priorizar a preventiva e o plano de troca do parque pelas máquinas mais fracas/obsoletas.

- Dado o GLPI com o agente instalado, quando aciono a sincronização de computadores, então cada
  `Computer` do GLPI vira/atualiza um PC na plataforma (`id_glpi_computer` linka os dois). Hostname e
  patrimônio (`otherserial`) vêm do GLPI; setor é resolvido pelo "Usuário" (`users_id`) quando bate
  com um setor conhecido, senão fica pra atribuir na plataforma. Cadastro manual (A1) segue existindo
  e o sync **nunca** sobrescreve um setor já atribuído na plataforma.
- Dado um PC sincronizado, quando a sincronização roda, então o hardware (RAM, tipo de disco SSD/HDD,
  espaço livre, SO, data de instalação do SO, CPU, GPU) é lido do inventário do agente e guardado
  como snapshot (`ComputerHardware`, 1:1, sempre o estado atual — não histórico).
- Dado um PC com hardware conhecido, quando a lista de computadores carrega, então cada PC mostra um
  **score de saúde 0-100** (maior = melhor) com nível crítico/atenção/bom. Pesos são julgamento de
  design documentado (`services/hardware_score.py`), não calibração: RAM e disco (tipo + espaço) e
  SO pesam mais; CPU/GPU pesam pouco (heurística por nome). Um PC nunca sincronizado com o GLPI não
  tem score (`null`) — a plataforma nunca inventa uma nota.
- "Tempo sem formatar" usa a data de instalação do SO reportada pelo GLPI. (Evolução prevista: uma
  reinstalação registrada durante a preventiva deve prevalecer sobre esse campo — não implementado.)
- Dado a lista de computadores, quando **clico numa linha**, então abro o detalhe do PC:
  especificações do hardware (CPU, memória, disco tipo + espaço livre, SO + data de instalação,
  vídeo) e o **score aberto por dimensão** — cada dimensão com sua barra proporcional
  (`pontos`/`peso`) e o motivo em texto, estilo painel de indicadores. PC sem hardware (cadastro
  manual) mostra estado vazio explícito. `GET /preventiva/computers/{id}` devolve isso
  (`ComputerHardware` + `score_componentes`).
- Dado um PC que **não roda o GLPI Agent** (cadastro manual), quando abro o detalhe, então posso
  **informar o hardware à mão** (CPU, memória, disco tipo + tamanho, SO + data, vídeo) e o score de
  saúde passa a ser calculado igual a um PC sincronizado. Dá pra editar e remover esses dados
  depois. `PUT`/`DELETE /preventiva/computers/{id}/hardware` — bloqueado (422) pra PC vinculado ao
  GLPI (o hardware dele vem do agente e seria sobrescrito no próximo sync).
- Dado um PC cadastrado por engano / duplicado, quando abro editar, então posso **excluir
  permanentemente** (`DELETE /preventiva/computers/{id}`, hard delete) — bloqueado (409) se o PC
  está em algum ciclo de preventiva (aí o certo é a baixa/`ativo=false`, que preserva o histórico).
  Mesmo critério do delete de ciclo.

- Dado a tela de editar computador (e a de cadastro), quando escolho o setor, então escolho a
  **unidade** primeiro (HGVC/UPA) e a lista de setores mostra só os daquela unidade — são 100+
  setores numa lista só, senão. O setor atual do PC continua aparecendo mesmo sendo de outra
  unidade / inativo.
- Dado o painel `/admin` → aba Coleta, quando quero sincronizar, então tem o botão "Sincronizar
  computadores" (gêmeo do de setores), com o resumo da última rodada (novos / atualizados / sem
  setor / sem patrimônio). É só leitura — **nunca escreve no GLPI** (decisão da rodada: o painel web
  do GLPI estava bugado pra editar entidade/"Usuário"; o vínculo com o setor vive só na plataforma).

Fora do escopo desta rodada (conversado, deprioritizado): nº de chamados recentes do PC como métrica
separada (não somada ao score); auto-sugerir prioridade alta no ciclo pelo score; escrever o setor
de volta no `Computer.users_id` do GLPI (revisitar quando o GLPI parar de bugar — o token já tem
direito de escrita). Antivírus **não** é lido do GLPI (o recurso não existe nessa instalação) —
segue como item manual no checklist de execução.

### Épico C — Ciclos de manutenção preventiva

**C1 — Criar ciclo e adicionar itens**
Como admin (ou técnico designado responsável), quero criar um ciclo definindo nome/período e setores
incluídos, e adicionar PCs a ele, para iniciar o planejamento (Checklist 1 do PDF).

- Dado o formulário de novo ciclo, quando preenchido (nome, período, setores incluídos, responsável
  designado) e submetido, então o ciclo é criado com status "Planejamento" e visível na lista de
  ciclos.
- Dado um ciclo criado, quando PCs são adicionados (busca por setor/patrimônio), então cada PC vira
  um "item do ciclo" com status "Planejado" e prioridade "Normal" (ajustável pra Alta/Baixa).
- Dado o checklist de planejamento (lista conferida no inventário, prioridades definidas, quantidade
  compatível com a equipe, ponto focal/janela combinados por setor, cronograma único, técnicos/
  chamados preparados), quando cada item é marcado, então fica registrado quem marcou e quando.

**C2 — Agendar item**
Como responsável do ciclo, quero definir data/janela e técnico de cada item, para confirmar o
cronograma com os setores (etapas Agendar + Preparar do PDF, fundidas numa única ação).

- Dado um item "Planejado", quando o responsável define data/janela E técnico, então o status muda
  pra "Confirmado" — não é possível confirmar faltando um dos dois.
- Dado um item confirmado com data já vencida e ainda não concluído, quando exibido, então aparece
  sinalizado como atrasado (indicador visual sobre "Confirmado", não um status novo).

**C2b — Reconfirmar na véspera (Checklist 2 do PDF)**
Como responsável do ciclo ou técnico, quero reconfirmar um item já agendado pouco antes da execução,
para não descobrir só na hora que o setor não vai liberar o PC (decisão explícita: mantido como etapa
própria, não fundido em C2 — combinado 2 semanas antes pode não valer mais no dia).

- Dado um item "Confirmado", quando o responsável/técnico abre a reconfirmação, então vê os 6 itens do
  Checklist 2 (setor confirmou data/horário/equipamentos liberados; usuários orientados a salvar
  arquivos e encerrar sistemas; ponto focal identificado e disponível; chamados/tarefas abertos e
  vinculados; ferramentas/materiais disponíveis; alternativa de continuidade pra PC crítico, quando
  aplicável).
- Dado que nem todos os 6 itens foram marcados OK, quando o técnico tenta abrir o Checklist 3
  (execução) desse item, então a plataforma bloqueia e aponta o que falta reconfirmar — a
  reconfirmação da véspera é pré-requisito da execução, não é só um registro informativo.
- Dado um item cuja reconfirmação apontou problema (setor não vai liberar, por exemplo), quando
  registrado, então o caminho natural é ir direto pra "Remarcar" (C4) em vez de seguir pra execução.

**C3 — Preencher checklist do PC**
Como técnico, quero preencher o checklist do computador durante o atendimento, para registrar o que
foi verificado, o resultado, e a validação do setor (Checklist 3 do PDF).

- Dado um item confirmado **e com a reconfirmação da véspera (C2b) completa**, quando o técnico abre o
  checklist, então vê os 10 itens de verificação
  (OK/N/A + observação livre cada) + resultado (Sem achado / Ajuste simples / Corretiva aberta /
  Interrompido) + resumo + pendência + responsável e prazo da pendência + validação do setor (nome do
  ponto focal + data, digitados pelo técnico — sem login do ponto focal) + próxima preventiva.
- Dado resultado "Corretiva aberta" ou "Interrompido", quando o técnico salva, então "Chamado GLPI" e
  "Pendência com responsável e prazo" passam a ser obrigatórios (regra de ouro do PDF).
- Dado todos os itens marcados (OK/N/A) e resultado preenchido, quando salvo com sucesso, então o
  status do item muda pra "Concluído" (Sem achado/Ajustado) ou "Pendente" (Corretiva aberta/
  Interrompido), e "última preventiva"/"próxima preventiva" do PC no inventário são atualizadas
  automaticamente — nunca digitadas duas vezes.
- Dado um checklist parcialmente preenchido, quando o técnico sai sem finalizar, então o progresso
  fica salvo como rascunho.

**C4 — Remarcar item**
Como técnico ou responsável, quero remarcar um item que não pôde ser executado, registrando o motivo,
para não perder o rastro do porquê (critérios "quando não iniciar ou interromper" do PDF).

- Dado um item confirmado, quando marcado "Remarcar", então motivo (obrigatório) e nova data (ou "sem
  data definida") são exigidos, e o status muda pra "Remarcado".
- Dado um item remarcado, quando reagendado, então volta ao fluxo normal (equivalente a "Confirmado"
  com a nova data).

**C5 — Fechar ciclo**
Como responsável do ciclo, quero ver o resumo quantitativo e a lista de pendências antes de encerrar,
para não deixar corretivas esquecidas (Checklist 4 do PDF).

- Dado um ciclo com itens em qualquer status, quando a tela de fechamento é aberta, então a contagem
  por status (planejados/concluídos/remarcados/pendentes) é calculada automaticamente — nunca
  digitada manualmente — e itens com "Corretiva aberta"/"Pendente" aparecem com seu responsável e
  prazo.
- Dado pelo menos um item "Pendente"/"Corretiva aberta" sem responsável+prazo, quando o responsável
  tenta encerrar o ciclo, então a plataforma bloqueia e indica quais itens faltam completar.
- Dado todos os itens em estado resolvido (concluído, remarcado-com-nova-data, ou
  pendente-com-responsável), quando o ciclo é encerrado, então vira "Encerrado" (somente leitura,
  histórico).

Casos de borda gerais do épico:
- Um patrimônio só pode estar em um ciclo "aberto" (Planejamento/Confirmado/em execução) por vez —
  não pode ter dois ciclos ativos disputando o mesmo PC.
- Ciclo sem nenhum item adicionado pode existir como rascunho, mas não pode sair de "Planejamento"
  sem pelo menos 1 item.
- Concorrência (dois técnicos editando o mesmo item ao mesmo tempo): assumido last-write-wins pro
  MVP, dado o volume baixo de uso simultâneo — assunção explícita, revisitar se virar problema real.

### Primeira fatia entregável (MVP)

Ordem por dependência: **B1 → A1+A2 → C1+C2+C2b → C3(+C4) → C5**. A3 (histórico por PC) e o
refinamento de C4 podem entrar na mesma leva de C3 sem trabalho extra relevante.

### Decisões resolvidas nesta rodada (histórico — não reabrir sem motivo novo)

- **Checklist 2 do PDF é etapa própria (C2b)**, não fundida em C2 — decidido porque a reconfirmação
  acontece na véspera, tempo depois do agendamento inicial, e vira pré-requisito bloqueante pra abrir
  o Checklist 3 de execução.
- **Setor não é `Location` do GLPI** (só 4 registros, um por hospital, sem granularidade) — é `User`
  fictício no grupo "Setores" com `usercategories_id` = "Setor", confirmado ao vivo contra a API real
  (108 registros hoje). Não existe hierarquia pra achatar: `entities_id` do `User` já liga direto à
  unidade. Ver Épico B acima pro modelo completo.
- **Os itens dos 3 checklists (planejamento/reconfirmação/execução) são um catálogo editável pelo
  admin** (`ChecklistItemDef`, painel `/admin` → aba Checklists), não uma lista fixa no código. O
  texto usado num ciclo/item fica congelado como snapshot (JSON) no momento em que o checklist foi
  preenchido — editar ou apagar um item do catálogo depois nunca reescreve histórico já registrado.
  Seed inicial = o vocabulário original do PDF (6 planejamento + 6 reconfirmação + 10 execução),
  só na 1ª subida (tabela vazia).
- **Checklist de execução (C3) — quem edita depois de finalizado**: o técnico só preenche enquanto o
  item está "Confirmado"; uma vez "Concluído"/"Pendente", só o admin pode reabrir e corrigir (o
  técnico passa a só visualizar, somente leitura). Decisão explícita do usuário ("técnico não pode
  editar, admin sim") — o formulário de execução ganhou abas (Checklist/Resultado/Validação) nessa
  mesma rodada, pra ficar organizado com os campos extras de correção.
