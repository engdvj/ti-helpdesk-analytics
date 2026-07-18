# Padrões de Testes — Frontend

## Stack

- `vitest` — test runner (integra direto com Vite, sem Babel)
- `@testing-library/react` + `@testing-library/user-event` — renderiza e interage como usuário real
- `@testing-library/jest-dom` — matchers extras (`toHaveStyle`, `toBeInTheDocument`...)
- `jsdom` — ambiente de DOM simulado

`vitest.config.ts` **não** precisa forçar `esbuild.jsx: "automatic"` — diferente do `refeitorio`,
o `tsconfig.json` daqui já usa `"jsx": "react-jsx"` (não `"preserve"`), então o transform padrão
do plugin `@vitejs/plugin-react` já resolve.

## Organização

Teste co-localizado ao lado do arquivo, sufixo `.test.ts`/`.test.tsx`:

```
src/lib/score.ts
src/lib/score.test.ts
src/components/ui/RankBadge.tsx
src/components/ui/RankBadge.test.tsx
```

## O que testar

### Funções puras (`lib/`)
- Toda faixa de decisão testada isoladamente (ex.: `scoreColor` — um caso por faixa de score,
  incluindo os limites exatos como `46`/`45.9`).

### Componentes
- Renderiza o que deveria (`getByText`, `getByRole`).
- **Cor vem de token, não hardcode** — diferente do `refeitorio` ("nunca testar estilo"), aqui
  `toHaveStyle({ background: "var(--ouro)" })` é uma asserção de comportamento válida: o bug real
  que motivou este padrão (`RankingRace.tsx` com hex hardcoded — ver `design_system.md`) só é
  pego por um teste que olha o valor do style, não só o texto renderizado.
- Interação do usuário via `userEvent` (`click`, `type`) — nunca `fireEvent` direto.

## O que NÃO testar

- Next.js/React em si (roteamento do framework, hooks do React).
- Snapshot tests genéricos sem asserção de comportamento.
- Fetch/SWR em si — mocar o client (`lib/api.ts`) quando o componente sob teste depende de dado
  remoto, não testar a integração HTTP real aqui (isso é coisa de `tests/` do pytest, contra o
  gold real).

## Rodar

```bash
cd frontend && npm test          # roda uma vez
cd frontend && npm run test:watch
```

## Regras

- Nunca commitar com testes falhando.
- Todo primitivo novo em `components/ui/` e toda função nova em `lib/` ganham teste.
- Retrofit de testes em componentes de domínio já existentes (`components/dashboard/`) é opcional
  — priorizar cobertura em código novo.
