# TI Helpdesk Analytics

Gamificação dos chamados de TI do CHVC (HGVC + UPA, extensível a novas unidades) a partir dos dados do GLPI. Pontua tecnicos individualmente por volume, complexidade e velocidade de atendimento, com um dashboard de ranking (corrida animada) e perfis individuais, no estilo do projeto irmão `fifa_analytics`.

## Estrutura

- `pipeline/` — config, schemas e dados gerados (raw/silver/gold), nunca commitados além de `.gitkeep`.
- `src/ti_analytics/` — coleta GLPI (raw→silver→gold) e motor de scores/snapshots, pacote Python puro (sem servir HTTP).
- `api/` — FastAPI + Postgres (catálogo: unidades/técnicos) que lê os parquets gerados pelo pipeline para os endpoints de analytics.
- `frontend/` — Next.js (dashboard: ranking race + perfis de técnico).
- `tests/` — pytest do lado Python.

## Setup local (Python)

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev,api]"
copy .env.example .env   # preencher GLPI_APP_TOKEN / GLPI_USER_TOKEN
ti-analytics coletar
```

## Pendências

Ver `CHECKLIST.md` na raiz — verificação ainda não feita (Docker Compose de ponta a ponta, conferência visual no navegador) e decisões de produto em aberto.

## Documentação de apoio (planejada, ainda vazia)

- `docs/data_catalog/` — dicionário de dados das tabelas GLPI usadas.
- `docs/semantic_model/` — definição formal de cada sub-score.
