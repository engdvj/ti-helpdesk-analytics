# Docker Compose de ponta a ponta

Resolvido em 2026-07-20. Faltava `frontend/Dockerfile` (nunca existiu -
`docker compose build` falhava direto) e `output: "standalone"` no
`next.config.ts`; criados junto com `.dockerignore` (raiz + frontend).

- [x] Rodar `docker compose up -d --build`
- [x] Os 3 serviços sobem sem erro (`db` healthy, `api`/`web` up)
- [x] `http://localhost:8000/health` responde
- [x] Frontend em `http://localhost:3000` carrega os dados via a API containerizada (lendo
      `pipeline/data/gold/` pelo volume montado, não via sqlite local) - confirmado via
      `/analytics/snapshots` retornando dado real pela stack containerizada.

Segue em `.claude/checklists/active/lan-access.md` o que falta pra acesso de
outro PC (era o motivo de ligar o docker-compose agora).
