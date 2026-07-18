import type { ScoreWeights, TechSnapshot } from "@/lib/api";

export const SCORE_LABELS: { key: keyof ScoreWeights; label: string }[] = [
  { key: "score_volume", label: "Volume" },
  { key: "score_velocidade_resolucao", label: "Velocidade de resolução" },
  { key: "score_complexidade", label: "Complexidade" },
  { key: "score_velocidade_resposta", label: "Velocidade de resposta" },
  { key: "score_abrangencia", label: "Abrangência" },
];

export function scoreColor(v: number | null | undefined): string {
  if (v == null) return "var(--apagado)";
  if (v >= 62) return "var(--acento)";
  if (v >= 54) return "color-mix(in srgb, var(--acento) 65%, white)";
  if (v >= 46) return "var(--aviso)";
  return "var(--critico)";
}

export function confidenceLabel(nivel: TechSnapshot["nivel_evidencia"]): { label: string; color: string } {
  if (nivel === "alta") return { label: "Confiança alta", color: "var(--acento)" };
  if (nivel === "media") return { label: "Confiança média", color: "var(--aviso)" };
  return { label: "Confiança baixa", color: "var(--critico)" };
}
