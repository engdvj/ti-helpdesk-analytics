# Checklist pós-implementação (v1)

Ver `CLAUDE.md` para o contexto arquitetural completo. Este arquivo é só a lista prática do que falta verificar/decidir — descartável quando tudo abaixo estiver resolvido.

## Verificação pendente (ninguém confirmou ainda)

- [ ] **Docker Compose nunca rodou de ponta a ponta.** Foi só testado API (sqlite direto via `uvicorn`) e frontend (`npm run dev` direto) separadamente, nunca os três serviços juntos containerizados. Rodar:
  ```
  docker compose up -d --build
  ```
  e confirmar: os 3 serviços sobem sem erro, `http://localhost:8000/health` responde, e o frontend em `http://localhost:3000` carrega os dados via a API containerizada (lendo `pipeline/data/gold/` pelo volume montado, não via sqlite local).

- [ ] **Ninguém olhou o frontend renderizado num navegador de verdade.** A verificação até aqui foi só `npm run build --webpack` limpo + `curl` confirmando que o HTML contém os textos esperados — sem ambiente de browser disponível na sessão que construiu isso. Abrir `http://localhost:3000` e conferir manualmente:
  - Hub lista as unidades (HGVC, UPA) + opção "Todas as unidades"
  - Dashboard de cada unidade abre sem erro (`/u/hgvc/dashboard`, `/u/upa/dashboard`, `/u/geral/dashboard`)
  - Aba **Corrida**: a barra anima de verdade ao mover o slider ou clicar "Reproduzir"
  - Aba **Perfis**: grid de cards aparece, clicar em um card abre o modal (abas Resumo/Chamados/Histórico)
  - Alternar tema claro/escuro funciona sem flash
  - Ananda (coordenadora) e Davi/Julia (táticos) aparecem com nota de baixa confiança quando o filtro de papel inclui essas categorias, e ficam de fora do ranking principal quando só "Plantonistas" está marcado

## Decisões de produto em aberto (não bloqueiam nada, só não foram resolvidas)

- [ ] **Hospedagem definitiva** — hoje só roda local (coleta manual + docker-compose local). Decidir se/quando migra pra um host fixo na rede interna do hospital.
- [ ] **Automatizar a coleta** — hoje só manual (`ti-analytics coletar` ou `POST /admin/collect`). Se o volume justificar, replicar o padrão de scheduler do fifa_analytics (`api/app/scheduler.py`).
- [ ] **`foi_reaberto` entra no `score_geral`?** — já coletado e exibido no perfil do técnico (aba Chamados/Histórico), mas ainda não pesa na nota. Avaliar depois de mais semanas de dado se o sinal é forte/estável o bastante pra virar um `score_qualidade`.
- [ ] Autenticação/login — hoje não existe (acesso é só por estar na rede interna do hospital). Adicionar se decidirem que precisa.

## Documentação planejada mas não feita

- [ ] **`docs/data_catalog/` e `docs/semantic_model/` estão vazios.** O plano original previa rodar as skills `data-quality-audit`, `data-catalog-entry` e `semantic-model-builder` (do repo `data-analytics-skills`) pra documentar formalmente o schema do GLPI e cada sub-score antes/durante a implementação — isso foi pulado pra priorizar entregar o sistema funcionando. Se quiser esse nível de documentação formal, essas skills ainda fazem sentido de rodar agora, com o sistema já em pé e validado.

## Cosmético / opcional, zero risco

- [ ] Apagar `dev.db` e `dev_smoketest.db` da raiz — sqlite de teste manual, já no `.gitignore`, não afetam nada.

---

Ao resolver um item, marque `[x]` ou apague a linha. Quando a seção "Verificação pendente" estiver vazia, este arquivo pode sumir — o que sobrar de decisões em aberto pode migrar pra uma issue ou ficar só no `CLAUDE.md`.
