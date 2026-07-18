"use client";

import Link from "next/link";
import useSWR from "swr";

import { units as unitsApi } from "@/lib/api";
import { GERAL_SLUG } from "@/lib/unit-context";

export default function HubPage() {
  const { data, isLoading, error } = useSWR("units", unitsApi.list);

  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ marginBottom: "2rem" }}>
        <span className="sumula-carimbo">Gamificação · TI</span>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-placar)", fontWeight: 600, marginTop: "0.75rem" }}>
          Ranking da equipe de TI
        </h1>
        <p style={{ color: "var(--apagado)", maxWidth: 560 }}>
          Pontuação individual a partir dos chamados do GLPI — volume, complexidade e velocidade de atendimento.
          Escolha uma unidade ou veja o ranking geral combinado.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        <Link href={`/u/${GERAL_SLUG}/dashboard`} className="sumula-cartao" style={cardStyle}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-h)", fontWeight: 600 }}>Todas as unidades</span>
          <span style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)" }}>Ranking geral combinado</span>
        </Link>

        {isLoading && <p style={{ color: "var(--apagado)" }}>Carregando unidades...</p>}
        {error && <p style={{ color: "var(--critico)" }}>Não foi possível carregar as unidades.</p>}
        {data?.map((u) => (
          <Link key={u.slug} href={`/u/${u.slug}/dashboard`} className="sumula-cartao" style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-h)", fontWeight: 600 }}>{u.nome}</span>
            <span style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)" }}>{u.completename}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  padding: "1.25rem",
  textDecoration: "none",
  color: "var(--tinta)",
};
