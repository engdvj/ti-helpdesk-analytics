"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";

import { ComputerForm } from "@/components/preventiva/ComputerForm";
import { ComputerList } from "@/components/preventiva/ComputerList";
import { sectors as sectorsApi } from "@/lib/api";

export default function SetorInventarioPage() {
  const params = useParams<{ id: string }>();
  const setorId = Number(params.id);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: setor, error, isLoading, mutate } = useSWR(
    ["sector", setorId],
    () => sectorsApi.get(setorId),
  );

  function refresh() {
    setRefreshKey((k) => k + 1);
    void mutate();
  }

  if (isLoading && !setor) {
    return (
      <main className="sumula-container-hub" style={{ flex: 1, padding: "2rem" }}>
        <p style={{ color: "var(--apagado)" }}>Carregando setor...</p>
      </main>
    );
  }
  if (error || !setor) {
    return (
      <main className="sumula-container-hub" style={{ flex: 1, padding: "2rem" }}>
        <Link href="/preventiva/inventario" style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)" }}>← Inventário</Link>
        <p style={{ color: "var(--critico)", marginTop: "1rem" }}>Setor não encontrado.</p>
      </main>
    );
  }

  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/preventiva/inventario" style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)" }}>← Inventário</Link>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600, marginTop: "0.5rem" }}>
          {setor.nome}
          {!setor.ativo && <span className="preventiva-badge is-inactive">inativo</span>}
        </h1>
        <p style={{ color: "var(--apagado)" }}>
          {setor.unidade_slug.toUpperCase()} · {setor.qtd_computadores} computador{setor.qtd_computadores === 1 ? "" : "es"} ativo{setor.qtd_computadores === 1 ? "" : "s"}
        </p>
      </div>

      <section className="sumula-cartao admin-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-panel-header">
          <h2>Cadastrar computador neste setor</h2>
        </div>
        <ComputerForm lockedSetorId={setorId} onCreated={refresh} />
      </section>

      <section className="sumula-cartao admin-panel">
        <div className="admin-panel-header">
          <h2>Computadores do setor</h2>
        </div>
        <ComputerList setorId={setorId} refreshKey={refreshKey} onChanged={() => void mutate()} />
      </section>
    </main>
  );
}
