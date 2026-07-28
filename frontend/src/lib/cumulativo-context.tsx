"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface CumulativoState {
  cumulativo: boolean;
  setCumulativo: (v: boolean) => void;
}

const CumulativoContext = createContext<CumulativoState | null>(null);

/** Modo temporal global: cumulativo=true representa um intervalo agregado;
 * false representa um unico balde diario/semanal/mensal. Os controles sao
 * exclusivos: aplicar intervalo liga o acumulado, escolher uma granularidade
 * volta ao periodo individual. */
export function CumulativoProvider({ children }: { children: ReactNode }) {
  const [cumulativo, setCumulativo] = useState(false);
  return <CumulativoContext.Provider value={{ cumulativo, setCumulativo }}>{children}</CumulativoContext.Provider>;
}

export function useCumulativo(): CumulativoState {
  const ctx = useContext(CumulativoContext);
  if (!ctx) throw new Error("useCumulativo() precisa estar dentro de <CumulativoProvider>");
  return ctx;
}
