"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { TechSnapshot } from "./api";

export type Granularidade = TechSnapshot["granularidade"];

export const GRANULARIDADE_OPTIONS: { key: Granularidade; label: string }[] = [
  { key: "diaria", label: "Diário" },
  { key: "semanal", label: "Semanal" },
  { key: "mensal", label: "Mensal" },
];

interface GranularidadeState {
  granularidade: Granularidade;
  setGranularidade: (g: Granularidade) => void;
}

const GranularidadeContext = createContext<GranularidadeState | null>(null);

/** Granularidade e global (vale pra Corrida, Perfis e o modal de detalhe nas
 * paginas de dashboard) - por isso mora num context provido no layout raiz e
 * o seletor fica na Header, nao dentro de uma pagina especifica. */
export function GranularidadeProvider({ children }: { children: ReactNode }) {
  const [granularidade, setGranularidade] = useState<Granularidade>("diaria");
  return (
    <GranularidadeContext.Provider value={{ granularidade, setGranularidade }}>
      {children}
    </GranularidadeContext.Provider>
  );
}

export function useGranularidade(): GranularidadeState {
  const ctx = useContext(GranularidadeContext);
  if (!ctx) throw new Error("useGranularidade() precisa estar dentro de <GranularidadeProvider>");
  return ctx;
}
