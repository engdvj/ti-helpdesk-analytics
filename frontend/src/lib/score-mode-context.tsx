"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import type { ScoreMode } from "./api";
import { useMetric } from "./metric-context";

interface ScoreModeState {
  scoreMode: ScoreMode;
  setScoreMode: (mode: ScoreMode) => void;
}

const ScoreModeContext = createContext<ScoreModeState | null>(null);

/** Equipe usa normalizacao relativa; Metas usa alvos absolutos configurados
 * no admin. E independente de acumulado/individual e da granularidade. */
export function ScoreModeProvider({ children }: { children: ReactNode }) {
  const [scoreMode, setScoreModeState] = useState<ScoreMode>("equipe");
  const { setMetricKey } = useMetric();
  const setScoreMode = useCallback((mode: ScoreMode) => {
    setScoreModeState(mode);
    // Equipe/Metas altera o calculo do score, nao os valores brutos. Voltar
    // para score geral evita uma corrida de "Metas" ainda exibindo chamados.
    setMetricKey("score_geral");
  }, [setMetricKey]);
  return <ScoreModeContext.Provider value={{ scoreMode, setScoreMode }}>{children}</ScoreModeContext.Provider>;
}

export function useScoreMode(): ScoreModeState {
  const ctx = useContext(ScoreModeContext);
  if (!ctx) throw new Error("useScoreMode() precisa estar dentro de <ScoreModeProvider>");
  return ctx;
}
