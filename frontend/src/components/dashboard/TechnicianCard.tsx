"use client";

import type { TechSnapshot } from "@/lib/api";

const ROLE_LABEL: Record<TechSnapshot["papel"], string> = {
  plantonista: "Plantonista",
  tatico: "Tático",
  coordenadora: "Coordenadora",
};

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

interface Props {
  snapshot: TechSnapshot;
  rank?: number;
  onClick: () => void;
}

/** Card de grid (aba "Perfis") - versao simplificada do PlayerCard.tsx da
 * branch multicampeonato do fifa_analytics: aqui e um card clicavel de grid
 * (nao flutuante/arrastavel) que abre o TechnicianModal com o detalhe. */
export function TechnicianCard({ snapshot, rank, onClick }: Props) {
  const conf = confidenceLabel(snapshot.nivel_evidencia);
  const initial = (snapshot.nome_completo || snapshot.username || "?").trim().charAt(0).toUpperCase();

  return (
    <button
      onClick={onClick}
      className="sumula-cartao"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        padding: "1rem",
        textAlign: "left",
        cursor: "pointer",
        borderLeft: `3px solid ${scoreColor(snapshot.score_geral)}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--acento)",
            color: "var(--superficie)",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {initial}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--fonte-corpo)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {snapshot.nome_completo || snapshot.username}
            {rank != null && (
              <span style={{ color: "var(--apagado)", fontWeight: 400 }}> · #{rank}</span>
            )}
          </div>
          <div style={{ fontSize: "var(--fonte-label)", color: "var(--apagado)", textTransform: "uppercase" }}>
            {ROLE_LABEL[snapshot.papel]}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              fontSize: "1.25rem",
              fontWeight: 800,
              color: scoreColor(snapshot.score_geral),
            }}
          >
            {snapshot.score_geral.toFixed(1)}
          </div>
          <div style={{ fontSize: "0.56rem", color: "var(--apagado)", textTransform: "uppercase" }}>Score</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "1.25rem", fontWeight: 800 }}>
            {snapshot.chamados_resolvidos.toFixed(0)}
          </div>
          <div style={{ fontSize: "0.56rem", color: "var(--apagado)", textTransform: "uppercase" }}>Chamados</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: conf.color }} />
        <span style={{ fontSize: "0.66rem", color: "var(--apagado)" }}>{conf.label}</span>
      </div>
    </button>
  );
}
