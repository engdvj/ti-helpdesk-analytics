import type { ScoreWeights, TechSnapshot } from "@/lib/api";

export const SCORE_LABELS: { key: keyof ScoreWeights; label: string }[] = [
  { key: "score_volume", label: "Créditos" },
  { key: "score_abrangencia", label: "Abrangência" },
  { key: "score_complexidade", label: "Complexidade real" },
  { key: "score_qualidade", label: "Qualidade da resposta" },
  { key: "score_velocidade_resposta", label: "Velocidade de resposta" },
];

export function scoreColor(v: number | null | undefined): string {
  if (v == null) return "var(--apagado)";
  if (v >= 62) return "var(--acento)";
  if (v >= 54) return "color-mix(in srgb, var(--acento) 65%, white)";
  if (v >= 46) return "var(--aviso)";
  return "var(--critico)";
}

/** Compatibilidade com snapshots gerados antes do campo `elegivel`: a
 * existencia de credito no periodo e a fonte factual da participacao. */
export function snapshotHasActivity(snapshot: TechSnapshot): boolean {
  return snapshot.elegivel ?? snapshot.chamados_resolvidos > 0;
}

export function confidenceLabel(nivel: TechSnapshot["nivel_evidencia"]): { label: string; color: string } {
  if (nivel === "alta") return { label: "Confiança alta", color: "var(--acento)" };
  if (nivel === "media") return { label: "Confiança média", color: "var(--aviso)" };
  return { label: "Confiança baixa", color: "var(--critico)" };
}
