"use client";

import Link from "next/link";

import { CycleForm } from "@/components/preventiva/CycleForm";
import { useAdmin } from "@/lib/admin-context";

export default function NovoCicloPage() {
  const { isAdmin } = useAdmin();

  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/preventiva" style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)" }}>← Ciclos de preventiva</Link>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600, marginTop: "0.5rem" }}>
          Novo ciclo de preventiva
        </h1>
      </div>

      <section className="sumula-cartao admin-panel" style={{ maxWidth: "44rem" }}>
        {isAdmin ? (
          <CycleForm />
        ) : (
          <p style={{ color: "var(--apagado)" }}>
            Só o admin cria ciclos e atribui o responsável. Faça login como admin pra continuar.
          </p>
        )}
      </section>
    </main>
  );
}
