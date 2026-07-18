# Design System — "Súmula"

> Decalcado do sistema de tokens da branch `multicampeonato` do `fifa_analytics`, com o acento trocado
> de verde de gramado (`--grama`) para azul/teal (`--acento`) — contexto é hospital/TI, não estádio.
> Diferente do `fifa_analytics` e do `refeitorio`: aqui **dark mode é suportado desde o início**, não é
> luz invertida — cada tema tem seus próprios valores de token.

## Tokens de cor (CSS custom properties em `globals.css`)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--papel` | `#f2efe6` | `#0d1117` | fundo de página |
| `--superficie` | `#faf8f1` | `#161b22` | cards, painéis, modais |
| `--tinta` | `#1c2620` | `#e6edf3` | texto principal |
| `--apagado` | `#6b7568` | `#8b949e` | texto secundário, labels |
| `--acento` | `#1f6f78` | `#58a6ff` | ações, links, foco, barra de progresso |
| `--acento-suave` | `#dde7e7` | `#1c2b3f` | trilho de barra, fundo de chip ok |
| `--aviso` | `#b8860f` | `#d29922` | atenção (score médio-baixo) |
| `--aviso-suave` | `#ede0c0` | `#33291a` | fundo de chip aviso |
| `--critico` | `#8f2a26` | `#f85149` | erro, score baixo |
| `--critico-suave` | `#ecdcd8` | `#3a2222` | fundo de chip/alerta |
| `--linha` | `#c7bfa8` | `#30363d` | bordas, divisores |
| `--linha-forte` | `#a89d7d` | `#3d4450` | borda do carimbo de auditoria |

**Medalhas de ranking** (`--ouro`, `--prata`, `--bronze`, `--medalha-texto`) são a única exceção
deliberada a "token por tema": valor único no `:root`, sem variante dark. Ouro/prata/bronze são
reconhecidos por convenção universal, não por contraste com `--papel` — e o texto sobre a medalha
(`--medalha-texto`) precisa continuar escuro nos dois temas porque o fundo da medalha é sempre claro.

### Como o tema é resolvido

- Atributo `data-theme="light"|"dark"` no `<html>`, lido por `:root[data-theme="..."]` no CSS.
- Sem atributo: cai no `@media (prefers-color-scheme: dark)`.
- Persistido em `localStorage` (`lib/theme.ts`), alternado pelo `ThemeToggle`.
- Script inline no `<head>` (`THEME_INIT_SCRIPT`) aplica o atributo **antes da primeira pintura** —
  evita flash de tema errado (FOUC). Não pode importar nada — é injetado como string crua.

## Tipografia — 3 papéis

| Papel | Fonte (`next/font/google`) | Onde |
|---|---|---|
| Display | **Fraunces** (600) | título de página, placar/contador grande |
| Texto | **Inter** | todo o resto da interface |
| Dados | **IBM Plex Mono** (400/500) | scores, timestamps, ids de chamado, labels uppercase |

### Escala fluida — `clamp()`, sempre em `rem`

| Token | Uso |
|---|---|
| `--fonte-placar` | contador/placar hero |
| `--fonte-titulo` | título de página |
| `--fonte-h` | subtítulo, título de modal |
| `--fonte-corpo` | texto padrão |
| `--fonte-label` | uppercase pequeno (abas, badges, botões) |
| `--fonte-dados` | mono pequeno (scores, ids) |

Números sempre `font-variant-numeric: tabular-nums` onde alinham em coluna (scores, ranking).

## Geometria

- **Raio zero** — `sumula-cartao` é `border-radius: 0`, sem exceção (nem avatar: o avatar de
  iniciais em `TechnicianCard` usa `border-radius: 50%`, que é uma exceção de círculo, não de
  arredondamento parcial). Estética de "súmula"/prancheta, não de card de app consumer.
- Sombras: nenhuma — profundidade vem de `border: 1px solid var(--linha)`.
- Sem sistema formal de espaçamento em múltiplos de 4px documentado ainda — a prática atual usa
  `rem` soltos por componente (`0.35rem`, `0.6rem`, `1.25rem`...). Se o número de telas crescer,
  vale extrair uma escala de espaçamento como token.

## Convenção de estilização — inline `style={{}}`, não classes Tailwind

Diferente do `refeitorio` (que usa utilitários Tailwind extensivamente: `bg-tinta/45`, `rounded-lg`
etc.), **todo componente deste projeto estiliza via objeto `style={{}}` inline, referenciando os
custom properties diretamente** (`background: "var(--acento)"`). Tailwind está disponível (`@import
"tailwindcss"` + `@theme inline` mapeando `--color-background`/`--color-foreground`/fontes) mas só é
usado para: `min-h-full flex flex-col` no `body` e classes utilitárias de layout pontuais — nunca
para cor. Isso é convenção estabelecida no código, não uma lacuna — manter ao adicionar tela nova.

Classes utilitárias próprias do sistema (definidas em `globals.css`, usadas via `className`):

- `sumula-container-estreita` / `-media` / `-hub` — largura máxima de página + padding lateral fluido.
- `sumula-cartao` — superfície padrão (fundo `--superficie`, borda `--linha`, raio 0). Usada por
  `Modal`, `TechnicianCard`.
- `sumula-carimbo` — "carimbo de auditoria": mono uppercase, rotacionado -3deg, fundo `--acento-suave`.
  Ainda sem consumidor no código — reservado pra quando houver necessidade de assinar um evento
  registrado (ex.: timestamp de coleta), no espírito do carimbo de auditoria do `refeitorio`.

## Primitivos (`components/ui/`)

| Componente | Resolve | Consumido por |
|---|---|---|
| `Modal.tsx` | portal + overlay + `Escape`/clique-fora | `TechnicianModal` |
| `Tabs.tsx` | abas com indicador de borda inferior | `DashboardPage`, `TechnicianModal` |
| `RankBadge.tsx` | selo numerado com cor de medalha (top 3) | `RankingRace` |
| `Bar.tsx` | trilho + preenchimento animado | `RankingRace`, `TechnicianModal` (sub-scores) |
| `ConfidenceBadge.tsx` | dot + label de nível de evidência | `TechnicianCard`, `TechnicianModal` |

Regra: **extrair primitivo só quando o mesmo padrão visual se repete em 2+ lugares** (foi assim que
os 5 acima nasceram — não existe biblioteca de componentes especulativa aqui). Não copiar 1:1 os 16
primitivos do `refeitorio` (`Botao`, `Campo`, `Tabela`...) — aquele projeto é CRUD com formulários e
listagens; este é um dashboard analítico read-only, o inventário de UI é outro.

## Cores por faixa de score (`lib/score.ts`)

`scoreColor(v)`: `>= 62` → `--acento`; `>= 54` → acento clareado (`color-mix`); `>= 46` → `--aviso`;
abaixo → `--critico`. Usado em toda superfície que mostra score (badge, barra, borda de card).

`confidenceLabel(nivel)`: `alta` → `--acento`, `media` → `--aviso`, qualquer outro valor (inclusive
`baixa`) → `--critico`. Consumido pelo `ConfidenceBadge`.

## Nunca

- Cor hex solta em componente — sempre `var(--token)`. (Havia uma violação real em `RankingRace.tsx`
  — cores de medalha hardcoded — corrigida virando token `--ouro`/`--prata`/`--bronze`.)
- Gradiente, glassmorphism, sombra longa.
- `dark:` do Tailwind — o tema já é resolvido via `data-theme` + custom properties, não por variante
  de classe.

## Acessibilidade

- `prefers-reduced-motion: reduce` zera duração de toda animação/transição globalmente.
- Scrollbar customizada (`scrollbar-color`) segue os tokens de tema, não cor fixa.
