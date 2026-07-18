# Frontend renderizado num navegador de verdade

A verificação até aqui foi só `npm run build --webpack` limpo + `curl` confirmando que o HTML
contém os textos esperados — sem ambiente de browser disponível na sessão que construiu isso.

Abrir `http://localhost:3000` e conferir manualmente:

- [ ] Hub lista as unidades (HGVC, UPA) + opção "Todas as unidades"
- [ ] Dashboard de cada unidade abre sem erro (`/u/hgvc/dashboard`, `/u/upa/dashboard`, `/u/geral/dashboard`)
- [ ] Aba **Corrida**: a barra anima de verdade ao mover o slider ou clicar "Reproduzir"
- [ ] Aba **Perfis**: grid de cards aparece, clicar em um card abre o modal (abas Resumo/Chamados/Histórico)
- [ ] Alternar tema claro/escuro funciona sem flash
- [ ] Ananda (coordenadora) e Davi/Julia (táticos) aparecem com nota de baixa confiança quando o
      filtro de papel inclui essas categorias, e ficam de fora do ranking principal quando só
      "Plantonistas" está marcado
