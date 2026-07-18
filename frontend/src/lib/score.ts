import type { TechSnapshot } from "@/lib/api";

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
