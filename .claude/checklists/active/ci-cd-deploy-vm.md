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
- [x] Commitado em `f999909` (2026-09-04) — `.github/workflows/ci-cd.yml` +
      `docker-compose.vm.yml` + `docs/requisitos.md`
- [x] **Setup na VM (10.17.132.99)** — runner self-hosted `tichvc` registrado, online, rodando
      como serviço (`gh api repos/.../actions/runners` confirma `status: online`)
- [x] Primeiro push real na `master` disparou o pipeline de ponta a ponta (run
      `33922130668`, 2026-09-04): jobs `backend`, `frontend` e `build-and-push` passaram; job
      `deploy` **falhou** — `git` no runner recusou operar em `/opt/ti-helpdesk-analytics` por
      "dubious ownership".
- [x] Investigado por SSH (2026-09-11): causa raiz não era só permissão — `/opt/ti-helpdesk-analytics`
      tinha sido recriado em 08/09 (dono `root`, só uma pasta `pipeline/` solta, sem `.git` —
      resíduo de rodar o CLI manualmente ali, não um clone real). Corrigido: `chown admin:admin`
      + `git clone` de verdade, feito como `admin` (mesmo usuário do serviço do runner
      `actions.runner.engdvj-ti-helpdesk-analytics.tichvc.service`).
- [x] Fix defensivo adicionado a `.github/workflows/ci-cd.yml`: `git config --global --add
      safe.directory /opt/ti-helpdesk-analytics` como primeiro passo do job `deploy` (idempotente
      — protege contra o mesmo problema se a pasta for recriada por outro dono de novo). Ainda
      **não commitado**.
- [x] `.env` de produção confirmado existente em `/opt/ti-helpdesk-analytics/.env` (usuário
      confirmou e preencheu via SSH)
- [x] `docker compose -f docker-compose.vm.yml pull` testado manualmente via SSH — deu
      `denied` no GHCR. **Não é bug**: a sessão SSH interativa nunca rodou `docker login`; dentro
      do job real do GitHub Actions o login roda na mesma sessão/job antes do pull, e o repo tem
      `default_workflow_permissions: read` (confirmado via `gh api .../actions/permissions/workflow`),
      então o `GITHUB_TOKEN` do job já tem `packages: read` — o pull deve funcionar de dentro do
      pipeline mesmo sem login manual.
- [ ] Containers hoje de pé na VM (`ti-helpdesk-analytics-{api,web,db}`, portas 8800/3300) vieram
      de um `docker compose up` manual usando o compose **local** (build, não `image:` do GHCR) —
      não é o deploy automático. Serão substituídos quando o job `deploy` rodar de verdade
      (`web` migra de 3300→80). Não precisa de ação, só not-surprise se as portas mudarem.
- [ ] Commitar o fix do `safe.directory` + push na `master` pra rodar o pipeline de ponta a ponta
      de novo — essa é a validação real pendente agora.

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
