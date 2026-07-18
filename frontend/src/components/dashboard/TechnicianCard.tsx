"use client";

import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import type { TechSnapshot } from "@/lib/api";
import { scoreColor } from "@/lib/score";

const ROLE_LABEL: Record<TechSnapshot["papel"], string> = {
  plantonista: "Plantonista",
  tatico: "Tático",
  coordenadora: "Coordenadora",
};

interface Props {
  snapshot: TechSnapshot;
  rank?: number;
  onClick: () => void;
}

/** Card de grid (aba "Perfis") - versao simplificada do PlayerCard.tsx da
 * branch multicampeonato do fifa_analytics: aqui e um card clicavel de grid
 * (nao flutuante/arrastavel) que abre o TechnicianModal com o detalhe. */
export function TechnicianCard({ snapshot, rank, onClick }: Props) {
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

      <ConfidenceBadge nivel={snapshot.nivel_evidencia} />
    </button>
  );
}
