"use client";

import { useEffect, useState } from "react";

import { Bar } from "@/components/ui/Bar";
import { FilterChip } from "@/components/ui/FilterChip";
import { RankBadge } from "@/components/ui/RankBadge";
import { useAdmin } from "@/lib/admin-context";
import type { TechSnapshot } from "@/lib/api";
import { metricValue, useMetric } from "@/lib/metric-context";
import { useSnapshots } from "@/lib/snapshot-context";

const ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: "plantonista", label: "Plantonistas" },
  { key: "tatico", label: "Táticos" },
  { key: "coordenadora", label: "Coordenadora" },
];

const ALL_ROLE_KEYS = ROLE_OPTIONS.map((o) => o.key);

interface Props {
  onSelectTechnician: (usersId: number) => void;
}

/** Ranking race: barra CSS-transitioned por snapshot (sem canvas/chart lib),
 * decalcado de RankingRaceScores.tsx da branch multicampeonato do
 * fifa_analytics - so a WIDTH/COR da barra anima a cada re-render, a lista
 * nao reordena com FLIP. Play/slider e granularidade moraram na Header
 * (SnapshotProvider) - aqui so consome o snapshotSeq atual. */
export function RankingRace({ onSelectTechnician }: Props) {
  const { isAdmin } = useAdmin();
  const { metric } = useMetric();
  const { data, isLoading, error, snapshotSeq } = useSnapshots();

  // Por padrao so plantonistas competem no ranking principal - coordenadora e
  // taticos aparecem se o usuario ligar o filtro manualmente, OU sempre que o
  // modo admin esta ligado (pedido explicito: admin ve todo mundo por
  // padrao em toda pagina, sem precisar reabrir o filtro).
  const [includeRoles, setIncludeRoles] = useState<Set<string>>(new Set(["plantonista"]));

  useEffect(() => {
    setIncludeRoles(new Set(isAdmin ? ALL_ROLE_KEYS : ["plantonista"]));
  }, [isAdmin]);

  if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando...</p>;
  if (error) return <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>;
  if (!data || data.length === 0) {
    return <p style={{ color: "var(--apagado)" }}>Sem dados ainda — rode a coleta (POST /admin/collect).</p>;
  }

  const rows = data
    .filter((d) => d.snapshot_seq === snapshotSeq)
    .filter((d) => includeRoles.has(d.papel))
    .sort((a, b) => {
      const av = metricValue(a, metric);
      const bv = metricValue(b, metric);
      return metric.higherIsBetter ? bv - av : av - bv;
    });

  // Metrica "menor e melhor" (resposta/resolucao) inverte a barra em cima do
  // teto do grupo - mesma logica de "distancia do maximo", so que aplicada
  // ao lado oposto, pra manter "barra maior = melhor" em qualquer metrica.
  const maxVal = Math.max(...rows.map((r) => metricValue(r, metric)), 1);
  function pctFor(row: TechSnapshot): number {
    const v = metricValue(row, metric);
    return metric.higherIsBetter ? (v / maxVal) * 100 : ((maxVal - v) / maxVal) * 100;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
        {ROLE_OPTIONS.map((opt) => {
          const active = includeRoles.has(opt.key);
          return (
            <FilterChip
              key={opt.key}
              active={active}
              onClick={() => {
                const next = new Set(includeRoles);
                if (active) next.delete(opt.key);
                else next.add(opt.key);
                setIncludeRoles(next);
              }}
            >
              {opt.label}
            </FilterChip>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {rows.map((row, i) => {
          const rank = i + 1;
          const pct = pctFor(row);
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
                {metric.format(metricValue(row, metric))}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <p style={{ color: "var(--apagado)" }}>Nenhum técnico nesse filtro.</p>}
      </div>
    </div>
  );
}
