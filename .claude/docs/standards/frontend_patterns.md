# Padrões de Projeto — Frontend (Next.js)

Ver [design_system.md](design_system.md) para tokens/geometria/tipografia. Este arquivo é só de
estrutura de código e fluxo de dados.

## Stack

- Next.js App Router
- TypeScript strict
- Tailwind CSS **só pra layout/utilitário** — cor e espaçamento de componente vão em `style={{}}`
  inline com custom properties (ver design_system.md § "Convenção de estilização")
- **SWR** pra data fetching (não `useEffect` + `useState` manual como no `refeitorio`) — cache,
  dedupe e revalidação vêm de graça; `SWRProvider` global desliga `revalidateOnFocus` (dashboard
  read-only, não precisa refetch a cada troca de aba) e usa `dedupingInterval: 30_000`.
- Sem autenticação — API é rede interna do hospital, sem login (ver `CLAUDE.md` da raiz).

## Estrutura de pastas

```
frontend/src/
├── app/                       # rotas (App Router)
│   ├── layout.tsx             # layout raiz — fontes, tema, Header
│   ├── page.tsx                # hub (lista de unidades)
│   └── u/[slug]/dashboard/page.tsx  # dashboard por unidade (Corrida + Perfis)
├── components/
│   ├── ui/                     # primitivos (ver design_system.md)
│   ├── dashboard/               # componentes de domínio do dashboard
│   ├── Header.tsx, ThemeToggle.tsx, UnitSwitcher.tsx, SWRProvider.tsx
├── lib/
│   ├── api.ts                  # client HTTP + tipos de resposta da API
│   ├── score.ts                # scoreColor / confidenceLabel (funções puras, não componente)
│   ├── theme.ts                 # resolução/persistência de tema
│   └── unit-context.tsx         # contexto React de unidade selecionada
```

Sem `hooks/` nem `types/` separados ainda — os tipos moram junto do client em `lib/api.ts`
(`Unit`, `Technician`, `TechSnapshot`...) porque são o contrato de resposta da API, não tipos de
domínio independentes. Se um hook customizado (`use<Recurso>`) precisar existir em mais de um
componente, criar `hooks/` — não antecipar.

## Client HTTP (`lib/api.ts`)

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const analytics = {
  snapshots: (opts: { granularidade?: string; entitiesId?: number } = {}) => { /* monta querystring */ },
  technicianProfile: (usersId: number, entitiesId?: number) => req<TechnicianProfile>(`/analytics/technicians/${usersId}`),
};
```

Um objeto por recurso (`units`, `technicians`, `analytics`) com métodos que retornam `req<T>(...)`
tipado — sem client genérico OO, sem axios.

## Busca de dados com SWR

```tsx
"use client";
import useSWR from "swr";
import { analytics } from "@/lib/api";

const { data, isLoading, error } = useSWR(
  ["snapshots", granularidade, entitiesId],   // chave composta — array, não string concatenada
  () => analytics.snapshots({ granularidade, entitiesId }),
);

if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando...</p>;
if (error) return <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>;
if (!data || data.length === 0) return <p style={{ color: "var(--apagado)" }}>Sem dados ainda.</p>;
```

Os 3 estados (`isLoading` / `error` / vazio) sempre tratados nessa ordem, com essa mensagem-padrão
de cor — repetido em `RankingRace`, `TechnicianModal`, `PerfisGrid`. Se aparecer uma 4ª tela com o
mesmo bloco, extrair um `<AsyncState />` (ainda não vale a pena com 3 usos inline curtos).

Todo componente que usa `useSWR`, `useState` ou evento é `"use client"` no topo — não existe Server
Component buscando dado direto aqui (diferente do `refeitorio`), porque toda tela é interativa
(slider de snapshot, toggle de papel, abas) e a API já não exige token/cookie de servidor.

## Nomenclatura

- Componente: PascalCase (`TechnicianCard.tsx`, `RankBadge.tsx`).
- Página: `page.tsx` (convenção Next.js), rota dinâmica em pasta `[slug]`.
- Função pura auxiliar (não componente): camelCase, fica em `lib/` (`scoreColor`, `confidenceLabel`),
  nunca dentro de um arquivo de componente — motivo de `scoreColor`/`confidenceLabel` terem saído de
  `TechnicianCard.tsx` pra `lib/score.ts`: eram importadas por outro componente (`TechnicianModal`),
  e uma função utilitária não deveria "morar" dentro do arquivo de quem só é o primeiro a usá-la.
- Objeto de API por recurso: `<recurso>Api` seria o padrão do `refeitorio`; aqui os objetos já
  chamam `units`/`technicians`/`analytics` sem sufixo — manter esse nome curto (`lib/api.ts` só
  exporta recursos, não precisa do sufixo pra desambiguar de outra coisa no arquivo).

## Contexto de unidade (`lib/unit-context.tsx`)

Unidade selecionada (HGVC/UPA/geral) vive em Context + query param de URL, provida uma vez em
`layout.tsx` (`UnitProvider`), consumida via `useUnit()`. Estados: `carregando` / `erro` / `pronta`
— toda página que depende de unidade trata os 3 antes de renderizar conteúdo (ver `DashboardPage`).

## Testes

Ver [testing_frontend.md](testing_frontend.md).
