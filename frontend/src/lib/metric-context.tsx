"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { TechSnapshot } from "./api";

export interface MetricOption {
  key: keyof TechSnapshot;
  label: string;
  higherIsBetter: boolean;
  format: (v: number) => string;
}

export const METRIC_OPTIONS: MetricOption[] = [
  { key: "score_geral", label: "Score geral", higherIsBetter: true, format: (v) => v.toFixed(1) },
  { key: "chamados_resolvidos", label: "Chamados resolvidos", higherIsBetter: true, format: (v) => v.toFixed(0) },
  { key: "resposta_media_min", label: "Resposta média (min)", higherIsBetter: false, format: (v) => v.toFixed(0) },
  { key: "resolucao_media_h", label: "Resolução média (h)", higherIsBetter: false, format: (v) => v.toFixed(1) },
  { key: "n_categorias", label: "Categorias distintas", higherIsBetter: true, format: (v) => v.toFixed(0) },
  { key: "urgencia_media", label: "Urgência média", higherIsBetter: true, format: (v) => v.toFixed(1) },
  { key: "confianca", label: "Confiança", higherIsBetter: true, format: (v) => `${Math.round(v * 100)}%` },
];

export function metricValue(row: TechSnapshot, metric: MetricOption): number {
  return row[metric.key] as number;
}

interface MetricState {
  metric: MetricOption;
  setMetricKey: (key: MetricOption["key"]) => void;
}

const MetricContext = createContext<MetricState | null>(null);

/** Metrica de ordenacao/normalizacao - global (Header), vale pra Corrida e
 * Perfis igual granularidade. Cada metrica sabe sua propria direcao
 * (higherIsBetter) porque resposta/resolucao sao "menor e melhor" - sem
 * isso o sort e a barra do ranking ficariam invertidos nessas duas. */
export function MetricProvider({ children }: { children: ReactNode }) {
  const [metricKey, setMetricKey] = useState<MetricOption["key"]>("score_geral");
  const metric = METRIC_OPTIONS.find((m) => m.key === metricKey) ?? METRIC_OPTIONS[0];
  return <MetricContext.Provider value={{ metric, setMetricKey }}>{children}</MetricContext.Provider>;
}

export function useMetric(): MetricState {
  const ctx = useContext(MetricContext);
  if (!ctx) throw new Error("useMetric() precisa estar dentro de <MetricProvider>");
  return ctx;
}
