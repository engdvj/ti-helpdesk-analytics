# CLAUDE.md

Orientações para o Claude Code ao trabalhar neste repositório.

## O que é este projeto

Gamificação dos chamados de TI do CHVC (Hospital Geral de Vitória da Conquista/HGVC + UPA, extensível a novas unidades) a partir do GLPI. Pontua tecnicos individualmente (nunca por equipe) e serve um dashboard estilo `fifa_analytics` (branch `multicampeonato`): ranking race animado + perfis individuais de técnico.

Projeto irmão de `c:\Users\davicjr\Desktop\Formulários` (gerador de formulário de atendimento do mesmo GLPI) e decalcado da arquitetura de `C:\Users\davicjr\Repositórios\fifa_analytics`.

## Arquitetura

```
GLPI (10.17.38.243, rede interna)
    → src/ti_analytics/glpi/  (client + entities + transforms + pipeline)
        → pipeline/data/raw/glpi/   (snapshots JSON, particionados por data)
        → pipeline/data/silver/     (DataFrames normalizados)
        → pipeline/data/gold/       (dim_tecnico, dim_unidade, fact_chamado, bridge_chamado_tecnico)
            → src/ti_analytics/analytics/  (pivot, scores, snapshot)
                → pipeline/data/gold/analytics/  (wide_chamado_tecnico, snapshot_timeline, weights.json)
                    → api/app/  (FastAPI, le os parquets direto com pandas)
                        → frontend/  (Next.js: ranking race + perfis)
```

Catálogo (Postgres, via `api/`): só `units` e `technicians` — sem tabela de usuário/predição, não há dado transacional submetido por usuário aqui (diferente do "bolão" do fifa_analytics).

## Peculiaridades do GLPI desta instância (não re-investigar)

- **Sem SLA/OLA configurado**: `/SLA`/`/SLM` sempre vazios, `slas_id_ttr=0` em todo chamado. Use `takeintoaccount_delay_stat` (resposta) e `solve_delay_stat` (resolução) — o GLPI calcula os dois sozinho, independente de SLA.
- **`impact` é sempre 3** (zero variância) — nunca usar pra score. `priority` varia pouco (2/3/4). `urgency` (1-5) é o campo certo pra complexidade.
- **Status quase nunca chega a 6 ("Fechado")** — use `status >= 5` (`is_solved`) e `solvedate`, não `closedate`.
- **Reabertura de chamado**: não existe campo pronto. Detectada via `/Ticket/{id}/Log`, filtrando `id_search_option == 12` (Status) e olhando se algum `new_value` volta pra <5 depois de já ter passado por >=5. Ver `analytics/reopens.py::detect_reopened()`.
- **Multi-técnico por chamado é raro mas existe** (~5-7%). Rateio de crédito (`peso_credito = 1/n_tecnicos_atribuidos`) mora só em `bridge_chamado_tecnico` (`glpi/transforms.py::normalize_ticket_bridge`) — `scores.py` nunca precisa saber que um chamado teve mais de 1 técnico.
- **Duas (ou mais) unidades, mesma equipe**: entidades GLPI `CHVC > HGVC > TI` e `CHVC > UPA > TI` hoje. **Nunca hardcodear `entities_id`** — `glpi/entities.py::discover_ti_entities()` acha qualquer `Entity` cujo `name` seja `"TI"` dinamicamente. O mesmo vale pro grupo (`discover_group_id`, nome vem de `pipeline/config/pipeline.yaml::grupo_ti.nome`).
- **`papel` (coordenadora/tático/plantonista) não existe no GLPI** — é conhecimento organizacional puro, configurado em `pipeline/config/team_roles.yaml` (`overrides` por `users_id`, nunca por código/username hardcoded).

## Convenções

### `unidade` é coluna, não partição

Ao contrário do fifa_analytics (onde cada competição isola dados em `data/gold/{slug}/` porque um time nunca joga duas competições ao mesmo tempo), aqui a mesma equipe atende várias unidades simultaneamente — a visão primária é o ranking **geral** combinado. Uma única árvore `pipeline/data/gold/`, com `entities_id` como coluna filtrável em `fact_chamado`/`wide_chamado_tecnico`. O filtro por unidade na API (`GET /analytics/snapshots?entities_id=`) recomputa a timeline sob demanda a partir de `wide_chamado_tecnico.parquet` (não lê `snapshot_timeline.parquet` pré-calculado, que só cobre o "geral") — no volume atual isso roda em milissegundos.

### Normalização do score (`analytics/scores.py`)

`ref_stats` (média/desvio de referência do z-score) deve ser semeado **só com técnicos `papel=="plantonista"`** — quem chama `build_tech_scores` pela primeira vez (populando um dict vazio) precisa passar `wide`/`dim_tecnico` pré-filtrados pra plantonista (ver `analytics/snapshot.py::_seed_ref_stats`). Chamadas seguintes (inclusive pra Ananda/táticos) reusam o mesmo `ref_stats` sem filtrar — assim eles recebem nota própria sem distorcer a média de quem vive resolvendo chamado full-time.

### Pesos fixos, não calibrados

`TECH_SCORE_WEIGHTS` em `analytics/scores.py` é julgamento de design documentado (comentário no topo do arquivo explica o porquê de cada peso), não regressão — o histórico real é curto (GLPI começou em 11/06/2026). Revisitar conforme mais semanas de dado se acumulam.

### Credenciais

`GLPI_APP_TOKEN`/`GLPI_USER_TOKEN`/`DATABASE_URL` sempre via `.env` (nunca hardcoded) — ao contrário do repo irmão `Formulários`, que tem esses tokens hardcoded e commitados (problema pré-existente lá, não repetir aqui).

### Schema validation é de verdade aqui

O fifa_analytics tem um hook `load_schema`/`SCHEMAS_DIR` que nunca é chamado (gap conhecido). Aqui `utils/schema_validate.py::validate_dataframe()` É chamado no fim de cada `normalize_*()` em `glpi/transforms.py`, contra `pipeline/schemas/*.yaml`.

## O que NÃO fazer

- Não hardcodear `entities_id` de unidade nem o id do grupo GLPI — sempre descoberta dinâmica (`glpi/entities.py`).
- Não hardcodear `papel` de técnico em código — só em `pipeline/config/team_roles.yaml`.
- Não usar `priority`/`impact` como sinal de complexidade — usar `urgency`.
- Não usar `closedate`/`status==6` como sinal de "chamado terminado" — usar `solvedate`/`status>=5`.
- Não commitar `pipeline/data/` (raw/silver/gold) nem `.env` — estão no `.gitignore`.
- Não adicionar tabela de auth/predição no catálogo Postgres sem necessidade real — não há dado transacional de usuário neste projeto (v1 é read-only analytics).

## CLI

```bash
.venv\Scripts\activate
pip install -e ".[dev,api]"

ti-analytics coletar         # GLPI -> raw -> silver -> gold -> scores -> snapshots
ti-analytics quality-check   # nulos/referencial sobre o gold ja coletado

pytest -q
```

## API / Frontend (dev local)

```bash
# API (sqlite pra dev rapido, sem precisar subir Postgres)
DATABASE_URL=sqlite:///./dev.db uvicorn api.app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev   # ja usa --webpack (ver "Problemas conhecidos")
```

`docker-compose.yml` na raiz sobe Postgres + API + frontend (sem Caddy/HTTPS — uso é só rede interna do hospital).

## Estado da implementação

### Feito
- Coleta completa GLPI -> raw/silver/gold (`glpi/pipeline.py::run()`), validada contra o GLPI real (431 chamados de TI, 16 técnicos, 28 reaberturas detectadas).
- Motor de score (`analytics/scores.py`) com shrinkage por confiança e `ref_stats` estável entre snapshots.
- 3 granularidades de snapshot (`diaria_acumulada`/`semanal`/`mensal`) em `analytics/snapshot.py`.
- API FastAPI (`api/app/`): `/units`, `/technicians`, `/analytics/snapshots`, `/analytics/technicians/{id}`, `/admin/collect` — testada contra o gold real via sqlite.
- Frontend Next.js (`frontend/`): hub, dashboard por unidade (`/u/[slug]/dashboard`) com abas Corrida (ranking race) e Perfis (grid + modal), tokens de design "Súmula" adaptados (acento azul/teal em vez do verde de gramado do fifa_analytics).
- 27 testes pytest (transforms, scores, snapshot, reopens, schema_validate, entities).

### Pendente / decisões em aberto
- **Hospedagem definitiva**: v1 roda local (coleta manual + docker-compose local). Falta decidir se/quando migra pra um host fixo na rede do hospital.
- **Agendamento automático da coleta**: hoje só manual (`ti-analytics coletar` ou `POST /admin/collect`). Se o volume justificar, adicionar um scheduler tipo `api/app/scheduler.py` do fifa_analytics.
- **`score_qualidade` (reabertura)**: `foi_reaberto` já é coletado e exposto no perfil do técnico, mas ainda não entra em `score_geral` — avaliar depois de mais semanas de dado se o sinal é forte/estável o bastante pra pesar.
- Sem autenticação/login — acesso é só rede interna. Adicionar se decidirem que precisa.

## Problemas conhecidos

- **Turbopack quebra no build/dev** por causa do acento em `Repositórios` no caminho do repo (bug do Turbopack com paths não-ASCII, não é bug do nosso código). `frontend/package.json` já usa `--webpack` nos scripts `dev`/`build` por causa disso — não tirar essa flag enquanto o repo estiver sob esse caminho.
- `.venv` não versionado — criar com `python -m venv .venv` antes de rodar qualquer coisa.
- Verificação de UI feita só via build/type-check + curl das rotas (sem browser real disponível no ambiente de desenvolvimento) — abrir no navegador antes de considerar o frontend definitivamente validado visualmente.
