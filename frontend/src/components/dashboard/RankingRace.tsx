"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { Bar } from "@/components/ui/Bar";
import { RankBadge } from "@/components/ui/RankBadge";
import { analytics } from "@/lib/api";

const ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: "plantonista", label: "Plantonistas" },
  { key: "tatico", label: "Táticos" },
  { key: "coordenadora", label: "Coordenadora" },
];

interface Props {
  entitiesId?: number;
  granularidade?: "diaria_acumulada" | "semanal" | "mensal";
  onSelectTechnician: (usersId: number) => void;
}

/** Ranking race: barra CSS-transitioned por snapshot (sem canvas/chart lib),
 * decalcado de RankingRaceScores.tsx da branch multicampeonato do
 * fifa_analytics - so a WIDTH/COR da barra anima a cada re-render, a lista
 * nao reordena com FLIP. */
export function RankingRace({ entitiesId, granularidade = "diaria_acumulada", onSelectTechnician }: Props) {
  const { data, isLoading, error } = useSWR(["snapshots", granularidade, entitiesId], () =>
    analytics.snapshots({ granularidade, entitiesId }),
  );

  const [snapshotSeq, setSnapshotSeq] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // Por padrao so plantonistas competem no ranking principal - coordenadora e
  // taticos aparecem se o usuario ligar o filtro (pedido explicito: contar o
  // dado deles, mas nao misturar na comparacao por padrao).
  const [includeRoles, setIncludeRoles] = useState<Set<string>>(new Set(["plantonista"]));

  const seqs = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((d) => d.snapshot_seq))).sort((a, b) => a - b);
  }, [data]);

  useEffect(() => {
    if (seqs.length && snapshotSeq === null) setSnapshotSeq(seqs[seqs.length - 1]);
  }, [seqs, snapshotSeq]);

  useEffect(() => {
    if (!playing || seqs.length === 0) return;
    const id = setInterval(() => {
      setSnapshotSeq((cur) => {
        if (cur === null) return seqs[0];
        const idx = seqs.indexOf(cur);
        if (idx === -1 || idx === seqs.length - 1) {
          setPlaying(false);
          return cur;
        }
        return seqs[idx + 1];
      });
    }, 700);
    return () => clearInterval(id);
  }, [playing, seqs]);

  if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando...</p>;
  if (error) return <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>;
  if (!data || data.length === 0) {
    return <p style={{ color: "var(--apagado)" }}>Sem dados ainda — rode a coleta (POST /admin/collect).</p>;
  }

  const rows = data
    .filter((d) => d.snapshot_seq === snapshotSeq)
    .filter((d) => includeRoles.has(d.papel))
    .sort((a, b) => b.score_geral - a.score_geral);

  const maxScore = Math.max(...rows.map((r) => r.score_geral), 1);
  const periodoAtual = data.find((d) => d.snapshot_seq === snapshotSeq)?.periodo_ref;
  const currentIdx = snapshotSeq != null ? seqs.indexOf(snapshotSeq) : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setPlaying((p) => !p)} style={controlButtonStyle}>
          {playing ? "Pausar" : "Reproduzir"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(seqs.length - 1, 0)}
          value={Math.max(currentIdx, 0)}
          onChange={(e) => setSnapshotSeq(seqs[Number(e.target.value)])}
          style={{ flex: 1, minWidth: 160, accentColor: "var(--acento)" }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fonte-label)", color: "var(--apagado)", whiteSpace: "nowrap" }}>
          {periodoAtual}
        </span>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
        {ROLE_OPTIONS.map((opt) => {
          const active = includeRoles.has(opt.key);
          return (
            <button
              key={opt.key}
              onClick={() => {
                const next = new Set(includeRoles);
                if (active) next.delete(opt.key);
                else next.add(opt.key);
                setIncludeRoles(next);
              }}
              style={{
                fontSize: "var(--fonte-label)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                padding: "0.3rem 0.6rem",
                border: "1px solid var(--linha)",
                background: active ? "var(--acento-suave)" : "transparent",
                color: active ? "var(--acento)" : "var(--apagado)",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {rows.map((row, i) => {
          const rank = i + 1;
          const pct = (row.score_geral / maxScore) * 100;
          return (
            <button
              key={row.users_id}
              onClick={() => onSelectTechnician(row.users_id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.3rem 0",
                textAlign: "left",
              }}
            >
              <RankBadge rank={rank} />
              <span
                style={{
                  width: 150,
                  fontSize: "var(--fonte-corpo)",
                  color: "var(--tinta)",
                  flexShrink: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.nome_completo || row.username}
              </span>
              <Bar pct={pct} transition="width 0.55s cubic-bezier(0.4,0,0.2,1), background 0.45s ease" />
              <span
                style={{
                  width: 44,
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: "var(--fonte-dados)",
                  color: "var(--tinta)",
                  flexShrink: 0,
                }}
              >
                {row.score_geral.toFixed(1)}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <p style={{ color: "var(--apagado)" }}>Nenhum técnico nesse filtro.</p>}
      </div>
    </div>
  );
}

const controlButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fonte-label)",
  textTransform: "uppercase",
  padding: "0.4rem 0.8rem",
  border: "1px solid var(--linha)",
  background: "var(--superficie)",
  color: "var(--tinta)",
  cursor: "pointer",
};
