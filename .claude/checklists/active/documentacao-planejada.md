# Documentação planejada mas não feita

`docs/data_catalog/` e `docs/semantic_model/` estão vazios. O plano original previa rodar as
skills `data-quality-audit`, `data-catalog-entry` e `semantic-model-builder` (do repo
`data-analytics-skills`) pra documentar formalmente o schema do GLPI e cada sub-score
antes/durante a implementação — isso foi pulado pra priorizar entregar o sistema funcionando.

- [ ] Rodar `data-quality-audit`, `data-catalog-entry` e `semantic-model-builder` sobre o gold já
      coletado, agora que o sistema está em pé e validado.

## Cosmético / opcional, zero risco

- [ ] Apagar `dev.db` e `dev_smoketest.db` da raiz — sqlite de teste manual, já no `.gitignore`,
      não afetam nada.
