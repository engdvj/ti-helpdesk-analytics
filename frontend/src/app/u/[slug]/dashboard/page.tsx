"use client";

import { useState } from "react";
import useSWR from "swr";

import { RankingRace } from "@/components/dashboard/RankingRace";
import { TechnicianCard } from "@/components/dashboard/TechnicianCard";
import { TechnicianModal } from "@/components/dashboard/TechnicianModal";
import { analytics } from "@/lib/api";
import { useUnit } from "@/lib/unit-context";

type MainTab = "corrida" | "perfis";

export default function DashboardPage() {
  const unitState = useUnit();
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
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--linha)" }}>
        {(["corrida", "perfis"] as MainTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0.6rem 1rem",
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--acento)" : "2px solid transparent",
              color: tab === t ? "var(--acento)" : "var(--apagado)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fonte-label)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
          >
            {t === "corrida" ? "Corrida" : "Perfis"}
          </button>
        ))}
      </div>

      {tab === "corrida" && <RankingRace entitiesId={entitiesId} onSelectTechnician={setSelectedTech} />}
      {tab === "perfis" && <PerfisGrid entitiesId={entitiesId} onSelectTechnician={setSelectedTech} />}

      {selectedTech != null && (
        <TechnicianModal usersId={selectedTech} entitiesId={entitiesId} onClose={() => setSelectedTech(null)} />
      )}
    </main>
  );
}

function PerfisGrid({ entitiesId, onSelectTechnician }: { entitiesId?: number; onSelectTechnician: (id: number) => void }) {
  const { data, isLoading, error } = useSWR(["snapshots-geral", entitiesId], () =>
    analytics.snapshots({ granularidade: "diaria_acumulada", entitiesId }),
  );

  if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando...</p>;
  if (error) return <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>;
  if (!data || data.length === 0) return <p style={{ color: "var(--apagado)" }}>Sem dados ainda.</p>;

  const maxSeq = Math.max(...data.map((d) => d.snapshot_seq));
  const atual = data.filter((d) => d.snapshot_seq === maxSeq).sort((a, b) => b.score_geral - a.score_geral);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
      {atual.map((snap, i) => (
        <TechnicianCard key={snap.users_id} snapshot={snap} rank={i + 1} onClick={() => onSelectTechnician(snap.users_id)} />
      ))}
    </div>
  );
}
