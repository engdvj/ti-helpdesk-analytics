"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { units as unitsApi, type Unit } from "./api";

/** Slug especial pra "todas as unidades combinadas" - a visao PRIMARIA do
 * ranking (diferente do fifa_analytics, onde voce sempre esta dentro de
 * exatamente uma competicao - aqui a mesma equipe atende varias unidades ao
 * mesmo tempo, entao "geral" precisa ser um estado de primeira classe, nao
 * so a ausencia de filtro). */
export const GERAL_SLUG = "geral";

export type UnitState =
  | { status: "fora" }
  | { status: "carregando" }
  | { status: "erro" }
  | { status: "pronta"; unit: Unit | null }; // unit === null quando slug === GERAL_SLUG

const UnitContext = createContext<UnitState>({ status: "fora" });

type Resolved = { slug: string; unit: Unit | null } | { slug: string; erro: true };

export function UnitProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // A classificacao fora/dentro precisa ser SINCRONA (calculada direto do
  // pathname a cada render), nao dentro de um useEffect - useEffect nao roda
  // no SSR nem no 1o render client antes da hidratacao, entao useUnit()
  // sempre veria "fora" nesse meio-tempo e lancaria erro em /u/[slug]/...
  // Sé a parte assincrona (buscar o Unit por slug) precisa de efeito.
  const match = pathname?.match(/^\/u\/([^/]+)/);
  const slug = match?.[1] ?? null;

  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!slug || slug === GERAL_SLUG) return;
    let cancelled = false;
    unitsApi
      .list()
      .then((all) => {
        if (cancelled) return;
        const found = all.find((u) => u.slug === slug);
        setResolved(found ? { slug, unit: found } : { slug, erro: true });
      })
      .catch(() => {
        if (!cancelled) setResolved({ slug, erro: true });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  let state: UnitState;
  if (!slug) {
    state = { status: "fora" };
  } else if (slug === GERAL_SLUG) {
    state = { status: "pronta", unit: null };
  } else if (resolved && resolved.slug === slug) {
    state = "erro" in resolved ? { status: "erro" } : { status: "pronta", unit: resolved.unit };
  } else {
    state = { status: "carregando" };
  }

  return <UnitContext.Provider value={state}>{children}</UnitContext.Provider>;
}

/** So usar dentro de componentes que renderizam exclusivamente sob /u/[slug]/... */
export function useUnit(): UnitState {
  const ctx = useContext(UnitContext);
  if (ctx.status === "fora") {
    throw new Error("useUnit() so pode ser usado dentro de uma rota /u/[slug]/...");
  }
  return ctx;
}

/** Seguro em qualquer lugar (ex.: Header) - null quando fora de /u/[slug]/... */
export function useUnitOptional(): UnitState | null {
  const ctx = useContext(UnitContext);
  return ctx.status === "fora" ? null : ctx;
}
