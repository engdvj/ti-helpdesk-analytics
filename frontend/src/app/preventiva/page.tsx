"use client";

import Link from "next/link";

import { CycleList } from "@/components/preventiva/CycleList";
import { Botao } from "@/components/ui/Botao";

export default function PreventivaPage() {
  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <span className="sumula-carimbo">Manutenção · TI</span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600, marginTop: "0.5rem" }}>
            Ciclos de manutenção preventiva
          </h1>
          <p style={{ color: "var(--apagado)", maxWidth: 560 }}>
            Planeje, agende e acompanhe a preventiva de computadores por setor.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <Link href="/preventiva/inventario"><Botao variant="secundario">Inventário</Botao></Link>
          <Link href="/preventiva/novo"><Botao variant="primario">Novo ciclo</Botao></Link>
        </div>
      </div>

      <section className="sumula-cartao admin-panel">
        <CycleList />
      </section>
    </main>
  );
}
