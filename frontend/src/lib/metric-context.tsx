"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { TechSnapshot } from "./api";

export interface MetricOption {
  key: keyof TechSnapshot;
  label: string;
  higherIsBetter: boolean;
  format: (v: number) => string;
  /** true = o valor muda conforme scoreMode (equipe/metas, ver scores.py) -
   * so score_geral e score_qualidade passam por essa normalizacao. As
   * demais sao metricas brutas (contagem/media), o mesmo numero nos dois
   * modos - ver ScoreModeSwitcher, que usa isso pra saber quando o toggle
   * Equipe/Metas deixa de fazer sentido. */
  modeDependent?: boolean;
}

export const METRIC_OPTIONS: MetricOption[] = [
  { key: "score_geral", label: "Score geral", higherIsBetter: true, format: (v) => v.toFixed(1), modeDependent: true },
  { key: "chamados_resolvidos", label: "Créditos", higherIsBetter: true, format: (v) => v.toFixed(0) },
  { key: "n_categorias", label: "Abrangência", higherIsBetter: true, format: (v) => v.toFixed(0) },
  { key: "complexidade_categoria_media", label: "Complexidade real", higherIsBetter: true, format: (v) => `${v.toFixed(2)}x` },
  { key: "score_qualidade", label: "Qualidade da resposta", higherIsBetter: true, format: (v) => v.toFixed(0), modeDependent: true },
  { key: "resposta_media_min", label: "Velocidade de resposta", higherIsBetter: false, format: (v) => `${v.toFixed(0)} min` },
];

/** Metrica bruta usada como destino ao clicar "Métricas" no ScoreModeSwitcher
 * - primeira opcao nao mode-dependent da lista. */
export const DEFAULT_RAW_METRIC_KEY = METRIC_OPTIONS.find((m) => !m.modeDependent)!.key;

export function metricValue(row: TechSnapshot, metric: MetricOption): number | null {
  const value = row[metric.key];
  return typeof value === "number" ? value : null;
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
