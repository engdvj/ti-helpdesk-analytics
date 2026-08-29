"use client";

import { useState } from "react";
import Link from "next/link";

import { ComputerList } from "@/components/preventiva/ComputerList";
import { SectorList } from "@/components/preventiva/SectorList";
import { Tabs } from "@/components/ui/Tabs";

type InventarioTab = "setores" | "computadores";

const TABS = [
  { key: "setores", label: "Setores" },
  { key: "computadores", label: "Computadores" },
];

export default function InventarioPage() {
  const [tab, setTab] = useState<InventarioTab>("setores");

  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/preventiva" style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)" }}>← Ciclos de preventiva</Link>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600, marginTop: "0.5rem" }}>
          Inventário de computadores
        </h1>
        <p style={{ color: "var(--apagado)" }}>Setores sincronizados do GLPI e os computadores cadastrados em cada um.</p>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Tabs tabs={TABS} active={tab} onChange={(key) => setTab(key as InventarioTab)} />
      </div>

      {tab === "setores" && (
        <section className="sumula-cartao admin-panel">
          <div className="admin-panel-header">
            <h2>Setores</h2>
            <p>Clique num setor para ver, cadastrar e gerenciar os computadores dele.</p>
          </div>
          <SectorList />
        </section>
      )}

      {tab === "computadores" && (
        <section className="sumula-cartao admin-panel">
          <div className="admin-panel-header">
            <h2>Computadores</h2>
            <p>Para cadastrar um computador novo, abra o setor dele na aba Setores.</p>
          </div>
          <ComputerList />
        </section>
      )}
    </main>
  );
}
