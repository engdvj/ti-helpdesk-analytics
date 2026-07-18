"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Bar } from "@/components/ui/Bar";
import { FilterChip } from "@/components/ui/FilterChip";
import { RankBadge } from "@/components/ui/RankBadge";
import { useAdmin } from "@/lib/admin-context";
import type { TechSnapshot } from "@/lib/api";
import { metricValue, useMetric } from "@/lib/metric-context";
import { isRoleVisible, useRoleVisibility } from "@/lib/role-visibility";
import { snapshotHasActivity } from "@/lib/score";
import { useScoreMode } from "@/lib/score-mode-context";
import { useSnapshots } from "@/lib/snapshot-context";
import { resolveTechnicianDisplay, useTechnicians } from "@/lib/technicians";
import { useUnitOptional } from "@/lib/unit-context";
import { unitDisplayName, useUnits } from "@/lib/units";

const ROLE_OPTIONS: { key: TechSnapshot["papel"]; label: string }[] = [
  { key: "plantonista", label: "Plantonistas" },
  { key: "tatico", label: "Táticos" },
  { key: "coordenadora", label: "Coordenadora" },
];

interface Props {
  selectedTechnicians: number[];
  onToggleTechnician: (usersId: number) => void;
}

/** Ranking race: barra CSS-transitioned por snapshot (sem canvas/chart lib),
 * decalcado de RankingRaceScores.tsx da branch multicampeonato do
 * fifa_analytics - so a WIDTH/COR da barra anima a cada re-render, a lista
 * nao reordena com FLIP. Play/slider e granularidade moraram na Header
 * (SnapshotProvider) - aqui so consome o snapshotSeq atual. */
export function RankingRace({ selectedTechnicians, onToggleTechnician }: Props) {
  const { isAdmin } = useAdmin();
  const { metric } = useMetric();
  const { scoreMode } = useScoreMode();
  const { data: roleVisibility } = useRoleVisibility();
  const { data, isLoading, error, snapshotSeq } = useSnapshots();
  const { data: technicians } = useTechnicians();
  const { data: units } = useUnits();
  const unit = useUnitOptional();

  const availableRoleOptions = ROLE_OPTIONS.filter((option) => isRoleVisible(option.key, roleVisibility));
  const availableRoleKeys = new Set(availableRoleOptions.map((option) => option.key));
  const defaultRoles: TechSnapshot["papel"][] = isAdmin
    ? availableRoleOptions.map((option) => option.key)
    : availableRoleKeys.has("plantonista")
      ? ["plantonista"]
      : [];
  const [manualRoles, setManualRoles] = useState<Set<TechSnapshot["papel"]> | null>(null);
  const includeRoles = new Set(
    manualRoles === null
      ? defaultRoles
      : Array.from(manualRoles).filter((role) => availableRoleKeys.has(role)),
  );

  if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando...</p>;
  if (error) return <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>;
  if (!data || data.length === 0) {
    return <p style={{ color: "var(--apagado)" }}>Sem dados ainda — rode a coleta (POST /admin/collect).</p>;
  }

  const rows = data
    .filter((d) => d.snapshot_seq === snapshotSeq)
    .filter((d) => includeRoles.has(d.papel))
    .sort((a, b) => {
      const aEligible = snapshotHasActivity(a);
      const bEligible = snapshotHasActivity(b);
      if (aEligible !== bEligible) return aEligible ? -1 : 1;
      const av = metricValue(a, metric);
      const bv = metricValue(b, metric);
      if (av == null) return 1;
      if (bv == null) return -1;
      return metric.higherIsBetter ? bv - av : av - bv;
    });

  let eligibleRank = 0;
  const rankedRows = rows.map((row) => ({ row, rank: snapshotHasActivity(row) ? ++eligibleRank : null }));

  // Metrica "menor e melhor" (resposta/resolucao) inverte a barra em cima do
  // teto do grupo - mesma logica de "distancia do maximo", so que aplicada
  // ao lado oposto, pra manter "barra maior = melhor" em qualquer metrica.
  const values = rows
    .filter(snapshotHasActivity)
    .map((row) => metricValue(row, metric))
    .filter((value): value is number => value != null);
  const maxVal = Math.max(...values, 1);
  function pctFor(row: TechSnapshot): number {
    const v = metricValue(row, metric);
    if (!snapshotHasActivity(row) || v == null) return 0;
    return metric.higherIsBetter ? (v / maxVal) * 100 : ((maxVal - v) / maxVal) * 100;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {availableRoleOptions.length > 1 && (
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {availableRoleOptions.map((opt) => {
              const active = includeRoles.has(opt.key);
              return (
                <FilterChip
                  key={opt.key}
                  active={active}
                  onClick={() => {
                    const next = new Set(includeRoles);
                    if (active) next.delete(opt.key);
                    else next.add(opt.key);
                    setManualRoles(next);
                  }}
                >
                  {opt.label}
                </FilterChip>
              );
            })}
          </div>
        )}
        <span style={{ marginLeft: "auto", color: "var(--apagado)", fontFamily: "var(--font-mono)", fontSize: "var(--fonte-label)", textTransform: "uppercase" }}>
          Ranking: {metric.key === "score_geral"
            ? (scoreMode === "metas" ? "Score por metas" : "Score relativo à equipe")
            : `${metric.label} · valor bruto`}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {rankedRows.map(({ row, rank }) => {
          const pct = pctFor(row);
          const value = metricValue(row, metric);
          const selected = selectedTechnicians.includes(row.users_id);
          const display = resolveTechnicianDisplay(row.users_id, row.nome_completo || row.username, technicians);
          const unitLabel = unit?.status === "pronta" && unit.unit !== null
            ? unit.unit.nome
            : unitDisplayName(display.unidadeSlug ?? row.unidade_slug, units);
          return (
            <button
              key={row.users_id}
              onClick={() => onToggleTechnician(row.users_id)}
              aria-pressed={selected}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: selected ? "color-mix(in srgb, var(--acento-suave) 55%, transparent)" : "transparent",
                border: "none",
                borderLeft: selected ? "3px solid var(--acento)" : "3px solid transparent",
                cursor: "pointer",
                padding: "0.3rem 0",
                textAlign: "left",
              }}
            >
              <RankBadge rank={rank} />
              <Avatar nome={display.nome} foto={display.foto} size={22} />
              <span
                style={{
                  width: 150,
                  fontSize: "var(--fonte-corpo)",
                  color: "var(--tinta)",
                  flexShrink: 0,
                }}
              >
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {display.nome}
                </span>
                <small style={{ display: "block", color: "var(--apagado)", fontSize: "0.56rem", textTransform: "uppercase" }}>
                  {unitLabel}
                </small>
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
                {value == null ? "—" : metric.format(value)}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <p style={{ color: "var(--apagado)" }}>Nenhum técnico nesse filtro.</p>}
      </div>
    </div>
  );
}
