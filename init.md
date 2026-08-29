# Como iniciar o projeto

## 1. Pré-requisitos

- Docker + Docker Compose
- Acesso à rede interna do hospital (GLPI em `10.17.38.243`)

## 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencher no `.env`:
- `GLPI_APP_TOKEN` / `GLPI_USER_TOKEN` — tokens do GLPI (nunca hardcodear, nunca commitar)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — credencial do painel `/admin` (sem isso, `/admin` responde 500)
- `NEXT_PUBLIC_API_URL` — se for acessar de outra máquina na rede, trocar `localhost` pelo IP do host (ver comentário no `.env.example` — mudar depois exige `docker compose build web` de novo)

## 3. Subir a stack

```bash
docker compose up -d --build
```

Sobe:
- `db` — Postgres 16 (catálogo: `units`/`technicians`)
- `api` — FastAPI, lê `pipeline/data/gold` via volume, publicada em `8800` (porta `3000`/`8000` padrão já em uso nesta máquina)
- `web` — Next.js, publicado em `3300`

- API: http://localhost:8800 (docs em `/docs`)
- Frontend: http://localhost:3300

## 4. Coleta de dados (pipeline GLPI)

Pelo painel `/admin` do frontend (botão "Rodar coleta", roda dentro do container `api`), ou opcionalmente pelo host (requer venv Python — ver seção 5):

```bash
ti-analytics coletar         # GLPI -> raw -> silver -> gold -> scores -> snapshots
ti-analytics quality-check   # nulos/referencial sobre o gold já coletado
```

## 5. (Opcional) Dev local sem Docker

Só necessário pra hot-reload/dev rápido, ou pra rodar `ti-analytics coletar`/`pytest` pelo host.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev,api]"

DATABASE_URL=sqlite:///./dev.db uvicorn api.app.main:app --reload --port 8800
```

```bash
cd frontend
npm install
npm run dev -- -p 3300      # já roda com --webpack (ver "Problemas conhecidos" no CLAUDE.md)
```

## 6. Testes

```bash
pytest -q                          # suíte Python (requer venv da seção 5)
cd frontend && npm run test        # suíte frontend (vitest)
```
