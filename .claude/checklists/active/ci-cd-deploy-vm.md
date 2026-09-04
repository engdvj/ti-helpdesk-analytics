---
feature: ci-cd-deploy-vm
status: active
created: 2026-09-04
---

# CI/CD — Deploy automático pra VM

Pipeline GitHub Actions (`.github/workflows/ci-cd.yml`): push na `master` → testes backend+frontend
→ build+push das imagens no GHCR → deploy via runner self-hosted na VM interna do hospital
(10.17.132.99, Ubuntu Server). Ver `docs/requisitos.md` (seção "CI/CD — Deploy automático pra VM")
pra regra de negócio completa, casos de borda e por que essa arquitetura (referência real:
`engdvj/progest`, mesmo padrão, já roda em produção noutra VM da mesma rede).

## Tarefas

- [x] `docs/requisitos.md` — seção "CI/CD — Deploy automático pra VM" gravada
- [x] `.github/workflows/ci-cd.yml` — jobs `backend` (pytest), `frontend` (typecheck+test
      bloqueantes, lint informativo), `build-and-push` (GHCR), `deploy` (`runs-on: self-hosted`)
- [x] `docker-compose.vm.yml` — espelha o compose local trocando `build:` por `image:` nos serviços
      `api`/`web`; `web` publicado na porta 80 (pedido explícito do usuário — acesso sem porta na
      URL), `api` continua em 8800
- [x] GitHub Actions Variable `PROD_API_URL=http://10.17.132.99:8800` setada (`gh variable set`)
- [x] Validado localmente: `pytest -q` (262 passed, `DATABASE_URL=sqlite:///./ci.db`), frontend
      `tsc --noEmit` + `vitest run` (74 passed) + `npm run lint` (4 erros pré-existentes, confirma
      que o job não deve bloquear por lint), build das duas imagens Docker com os mesmos args do
      workflow, bundle do frontend conferido embutindo `10.17.132.99:8800` de verdade
- [ ] Usuário revisar e commitar `.github/workflows/ci-cd.yml` + `docker-compose.vm.yml` + o
      restante do diff da sessão (nada commitado ainda)
- [ ] **Setup na VM (10.17.132.99)** — exige acesso à máquina, não feito nesta sessão:
  - [ ] Registrar runner self-hosted do GitHub Actions no repo (`Settings → Actions → Runners →
        New self-hosted runner`) e instalar como serviço systemd (`svc.sh install && svc.sh
        start`) pra sobreviver a reboot
  - [ ] `git clone` do repo em `/opt/ti-helpdesk-analytics` (path fixo que o job `deploy` espera)
  - [ ] Criar `/opt/ti-helpdesk-analytics/.env` com as credenciais reais (GLPI_*, ADMIN_*,
        POSTGRES_*) — nunca commitado, sobrevive a `git reset --hard` por não ser versionado.
        Incluir `CORS_ORIGINS=http://10.17.132.99` (sem porta, já que `web` agora é porta 80) e
        `NEXT_PUBLIC_API_URL` **não** precisa estar aqui (é build-time, já embutido na imagem via
        a Variable `PROD_API_URL`)
  - [ ] Validar manualmente: `docker compose -f docker-compose.vm.yml pull && up -d` antes do
        primeiro deploy automático, confirmar `db` healthy e `api`/`web` respondendo
- [ ] Primeiro push real na `master` disparando o pipeline de ponta a ponta (validação real, não
      só local)

## Quality gates

- [x] Testes passando (backend + frontend, local)
- [ ] `/davi-core:review` aprovado (inclui security) — rodar sobre o diff antes do commit
- [ ] Verificado de ponta a ponta — pipeline completo rodando de verdade após push na `master` e
      runner self-hosted registrado na VM (não dá pra fechar isso sem acesso à VM)
- [ ] `/davi-core:retro` ao concluir (é primeiro módulo de infra/deploy do projeto — vale registrar
      o aprendizado da arquitetura self-hosted-runner + GHCR)

## Notas

- Decisão "Hospedagem definitiva" (estava em `decisoes-produto.md`) foi resolvida por esta feature
  e removida de lá.
- Padrão de build (GHCR + pull) e não SSH direto foi escolhido porque a VM não tem IP público (rede
  interna do hospital) — mesma razão documentada no `docker-compose.yml` local pra "sem Caddy/
  HTTPS público".
- Nenhum GitHub Secret novo: `secrets.GITHUB_TOKEN` cobre GHCR (push e pull); credenciais de
  aplicação continuam só no `.env` da VM, fora do git.
