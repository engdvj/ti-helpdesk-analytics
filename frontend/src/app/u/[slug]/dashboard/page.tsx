"use client";

import { useState } from "react";

import { CompetencyModule } from "@/components/competencies/CompetencyModule";
import { RankingRace } from "@/components/dashboard/RankingRace";
import { RankingComparison } from "@/components/dashboard/RankingComparison";
import { TechnicianCard } from "@/components/dashboard/TechnicianCard";
import { TechnicianModal } from "@/components/dashboard/TechnicianModal";
import { Tabs } from "@/components/ui/Tabs";
import { useCumulativo } from "@/lib/cumulativo-context";
import { useGranularidade } from "@/lib/granularidade-context";
import { metricValue, useMetric } from "@/lib/metric-context";
import { isRoleVisible, useRoleVisibility } from "@/lib/role-visibility";
import { snapshotHasActivity } from "@/lib/score";
import { useSnapshots } from "@/lib/snapshot-context";
import { useUnit } from "@/lib/unit-context";

type MainTab = "corrida" | "perfis" | "competencias";

export default function DashboardPage() {
  const unitState = useUnit();
  const { granularidade } = useGranularidade();
  const { cumulativo } = useCumulativo();
  const { data: snapshots, snapshotSeq } = useSnapshots();
  const [tab, setTab] = useState<MainTab>("corrida");
  const [openProfileTechs, setOpenProfileTechs] = useState<number[]>([]);
  const [comparisonTechs, setComparisonTechs] = useState<number[]>([]);

  if (unitState.status === "carregando") {
    return <p style={{ padding: "2rem", color: "var(--apagado)" }}>Carregando unidade...</p>;
  }
  if (unitState.status === "erro") {
    return <p style={{ padding: "2rem", color: "var(--critico)" }}>Unidade não encontrada.</p>;
  }

  const entitiesId = unitState.status === "pronta" ? unitState.unit?.entities_id : undefined;
  function openTechnician(usersId: number) {
    setOpenProfileTechs((current) => [...current.filter((id) => id !== usersId), usersId]);
  }

  function closeTechnician(usersId: number) {
    setOpenProfileTechs((current) => current.filter((id) => id !== usersId));
  }

  function toggleComparison(usersId: number) {
    setComparisonTechs((current) => current.includes(usersId)
      ? current.filter((id) => id !== usersId)
      : [...current, usersId]);
  }

  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Tabs
          tabs={[
            { key: "corrida", label: "Ranking" },
            { key: "perfis", label: "Técnicos" },
            { key: "competencias", label: "Competências" },
          ]}
          active={tab}
          onChange={(key) => {
            const nextTab = key as MainTab;
            setTab(nextTab);
            if (nextTab !== "perfis") setOpenProfileTechs([]);
          }}
        />
      </div>

      {tab === "corrida" && (
        <>
          <RankingRace selectedTechnicians={comparisonTechs} onToggleTechnician={toggleComparison} />
          {comparisonTechs.length > 0 && (
            <RankingComparison
              selectedIds={comparisonTechs}
              onRemove={toggleComparison}
              onClear={() => setComparisonTechs([])}
            />
          )}
        </>
      )}
      {tab === "perfis" && <PerfisGrid onSelectTechnician={openTechnician} />}
      {tab === "competencias" && (
        <CompetencyModule unidadeSlug={unitState.status === "pronta" ? unitState.unit?.slug : undefined} />
      )}

      {tab === "perfis" && openProfileTechs.map((usersId, index) => {
        const selectedSnapshot = snapshots?.find(
          (snapshot) => snapshot.users_id === usersId && snapshot.snapshot_seq === snapshotSeq,
        );
        if (!selectedSnapshot) return null;
        return (
          <TechnicianModal
            key={usersId}
            snapshot={selectedSnapshot}
            entitiesId={entitiesId}
            granularidade={granularidade}
            cumulativo={cumulativo}
            stackIndex={index}
            isTopMost={index === openProfileTechs.length - 1}
            onActivate={() => openTechnician(usersId)}
            onClose={() => closeTechnician(usersId)}
          />
        );
      })}
    </main>
  );
}

function PerfisGrid({ onSelectTechnician }: { onSelectTechnician: (id: number) => void }) {
  const { data, isLoading, error, snapshotSeq } = useSnapshots();
  const { metric } = useMetric();
  const { data: roleVisibility } = useRoleVisibility();

  if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando...</p>;
  if (error) return <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>;
  if (!data || data.length === 0) return <p style={{ color: "var(--apagado)" }}>Sem dados ainda.</p>;

  const atual = data
    .filter((d) => d.snapshot_seq === snapshotSeq)
    .filter((d) => isRoleVisible(d.papel, roleVisibility))
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
  const ranked = atual.map((snapshot) => ({
    snapshot,
    rank: snapshotHasActivity(snapshot) ? ++eligibleRank : null,
  }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
      {ranked.map(({ snapshot, rank }) => (
        <TechnicianCard key={snapshot.users_id} snapshot={snapshot} rank={rank} onClick={() => onSelectTechnician(snapshot.users_id)} />
      ))}
      {atual.length === 0 && <p style={{ color: "var(--apagado)" }}>Nenhum técnico nesse snapshot.</p>}
    </div>
  );
}
