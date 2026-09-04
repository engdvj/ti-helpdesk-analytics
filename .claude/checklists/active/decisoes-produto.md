# Decisões de produto em aberto

Não bloqueiam nada — só não foram resolvidas.

- [ ] **Automatizar a coleta** — hoje só manual (`ti-analytics coletar` ou `POST /admin/collect`). Se
      o volume justificar, replicar o padrão de scheduler do fifa_analytics (`api/app/scheduler.py`).
- [ ] **`foi_reaberto` entra no `score_geral`?** — já coletado e exibido no perfil do técnico (aba
      Chamados/Histórico), mas ainda não pesa na nota. Avaliar depois de mais semanas de dado se o
      sinal é forte/estável o bastante pra virar um `score_qualidade`.
