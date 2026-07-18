"use client";

import { useState } from "react";

import { RankingRace } from "@/components/dashboard/RankingRace";
import { TechnicianCard } from "@/components/dashboard/TechnicianCard";
import { TechnicianModal } from "@/components/dashboard/TechnicianModal";
import { Tabs } from "@/components/ui/Tabs";
import { useGranularidade } from "@/lib/granularidade-context";
import { metricValue, useMetric } from "@/lib/metric-context";
import { useSnapshots } from "@/lib/snapshot-context";
import { useUnit } from "@/lib/unit-context";

type MainTab = "corrida" | "perfis";

export default function DashboardPage() {
  const unitState = useUnit();
  const { granularidade } = useGranularidade();
  const [tab, setTab] = useState<MainTab>("corrida");
  const [selectedTech, setSelectedTech] = useState<number | null>(null);

  if (unitState.status === "carregando") {
    return <p style={{ padding: "2rem", color: "var(--apagado)" }}>Carregando unidade...</p>;
  }
  if (unitState.status === "erro") {
    return <p style={{ padding: "2rem", color: "var(--critico)" }}>Unidade não encontrada.</p>;
  }

  const entitiesId = unitState.status === "pronta" ? unitState.unit?.entities_id : undefined;

  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Tabs
          tabs={[
            { key: "corrida", label: "Corrida" },
            { key: "perfis", label: "Perfis" },
          ]}
          active={tab}
          onChange={(key) => setTab(key as MainTab)}
        />
      </div>

      {tab === "corrida" && <RankingRace onSelectTechnician={setSelectedTech} />}
      {tab === "perfis" && <PerfisGrid onSelectTechnician={setSelectedTech} />}

      {selectedTech != null && (
        <TechnicianModal
          usersId={selectedTech}
          entitiesId={entitiesId}
          granularidade={granularidade}
          onClose={() => setSelectedTech(null)}
        />
      )}
    </main>
  );
}

function PerfisGrid({ onSelectTechnician }: { onSelectTechnician: (id: number) => void }) {
  const { data, isLoading, error, snapshotSeq } = useSnapshots();
  const { metric } = useMetric();

  if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando...</p>;
  if (error) return <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>;
  if (!data || data.length === 0) return <p style={{ color: "var(--apagado)" }}>Sem dados ainda.</p>;

  const atual = data
    .filter((d) => d.snapshot_seq === snapshotSeq)
    .sort((a, b) => {
      const av = metricValue(a, metric);
      const bv = metricValue(b, metric);
      return metric.higherIsBetter ? bv - av : av - bv;
    });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
      {atual.map((snap, i) => (
        <TechnicianCard key={snap.users_id} snapshot={snap} rank={i + 1} onClick={() => onSelectTechnician(snap.users_id)} />
      ))}
      {atual.length === 0 && <p style={{ color: "var(--apagado)" }}>Nenhum técnico nesse snapshot.</p>}
    </div>
  );
}
