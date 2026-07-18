import { confidenceLabel } from "@/lib/score";
import type { TechSnapshot } from "@/lib/api";

interface Props {
  nivel: TechSnapshot["nivel_evidencia"];
  suffix?: string;
}

/** Dot colorido + label de nivel de evidencia - usado no card de grid e no
 * resumo do modal de detalhe. */
export function ConfidenceBadge({ nivel, suffix }: Props) {
  const conf = confidenceLabel(nivel);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: conf.color, flexShrink: 0 }} />
      <span style={{ fontSize: "0.7rem", color: "var(--apagado)" }}>
        {conf.label}
        {suffix ? ` ${suffix}` : ""}
      </span>
    </div>
  );
}
