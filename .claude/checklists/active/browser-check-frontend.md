# Frontend renderizado num navegador de verdade

A verificação até aqui foi só `npm run build --webpack` limpo + `curl` confirmando que o HTML
contém os textos esperados — sem ambiente de browser disponível na sessão que construiu isso.

Abrir `http://localhost:3300` (porta local deste ambiente — `docker-compose.yml`; pode ser `3000`
noutro ambiente) e conferir manualmente:

- [ ] Hub lista as unidades (HGVC, UPA) + opção "Todas as unidades"
- [ ] Dashboard de cada unidade abre sem erro (`/u/hgvc/dashboard`, `/u/upa/dashboard`, `/u/geral/dashboard`)
- [ ] Aba **Corrida**: a barra anima de verdade ao mover o slider ou clicar "Reproduzir"
- [ ] Aba **Perfis**: grid de cards aparece, clicar em um card abre o modal (abas Resumo/Chamados/Histórico)
- [ ] Alternar tema claro/escuro funciona sem flash
- [ ] Ananda (coordenadora) e Davi/Julia (táticos) aparecem com nota de baixa confiança quando o
      filtro de papel inclui essas categorias, e ficam de fora do ranking principal quando só
      "Plantonistas" está marcado

## Manutenção Preventiva de Computadores (feature nova, ver
`.claude/checklists/active/manutencao-preventiva-pcs.md`)

Dado de demonstração já populado no Postgres local: 107 setores sincronizados, 1 computador
(`HGVC-DEMO-001`), 1 ciclo (`Preventiva Setembro 2026`, id 1) com 1 item em `/preventiva/1`.

- [ ] Card "Manutenção Preventiva" aparece no hub (`/`) e leva pra `/preventiva`
- [ ] `/preventiva` lista o ciclo de demonstração; `/preventiva/inventario` mostra os 107 setores
      com contagem de PC e o `HGVC-DEMO-001` cadastrado
- [ ] `/preventiva/1`: botão "Agendar" abre modal, agenda com sucesso
- [ ] Depois de agendado, "Executar" fica bloqueado até "Reconfirmar véspera" ter os 6 itens marcados
- [ ] Checklist de execução (10 itens): escolher resultado "Corretiva aberta" trava "Finalizar
      atendimento" até preencher chamado GLPI + responsável + prazo da pendência
- [ ] "Salvar rascunho" no meio do checklist de execução não perde o que já foi marcado
- [ ] Resumo de fechamento mostra a contagem por status e bloqueia "Encerrar ciclo" se sobrar item
      não resolvido
- [ ] `/preventiva/novo` só permite criar ciclo logado como admin (técnico vê aviso, não o formulário)
- [ ] Painel `/admin` → aba Coleta → botão "Sincronizar setores" funciona e mostra o resultado
