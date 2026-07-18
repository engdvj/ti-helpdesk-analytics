"use client";

import { useState } from "react";
import useSWR from "swr";

import { Bar } from "@/components/ui/Bar";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { analytics, type TechSnapshot, type TechnicianRecentTicket } from "@/lib/api";
import { SCORE_LABELS, scoreColor } from "@/lib/score";

type Tab = "resumo" | "chamados" | "historico";

interface Props {
  usersId: number;
  entitiesId?: number;
  granularidade?: "diaria_acumulada" | "semanal" | "mensal";
  onClose: () => void;
}

/** Modal de drill-down por tecnico - decalcado de TeamModal.tsx (portal +
 * abas) da branch multicampeonato do fifa_analytics, simplificado pra 3
 * abas: Resumo (stat-tiles + sub-scores), Chamados (recentes), Historico
 * (sparkline do score_geral ao longo dos snapshots, na mesma granularidade
 * selecionada no dashboard). */
export function TechnicianModal({ usersId, entitiesId, granularidade, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumo");
  const { data, error, isLoading } = useSWR(["tech-profile", usersId, entitiesId, granularidade], () =>
    analytics.technicianProfile(usersId, entitiesId, granularidade),
  );

  const title = data?.atual.nome_completo || data?.atual.username || "Técnico";

  return (
    <Modal title={title} onClose={onClose}>
      {isLoading && <p style={{ color: "var(--apagado)" }}>Carregando...</p>}
      {error && <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>}
      {data && (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <Tabs
              tabs={[
                { key: "resumo", label: "resumo" },
                { key: "chamados", label: "chamados" },
                { key: "historico", label: "historico" },
              ]}
              active={tab}
              onChange={(key) => setTab(key as Tab)}
            />
          </div>

          {tab === "resumo" && <ResumoTab atual={data.atual} />}
          {tab === "chamados" && <ChamadosTab chamados={data.chamados_recentes} />}
          {tab === "historico" && <HistoricoTab historico={data.historico} />}
        </>
      )}
    </Modal>
  );
}

function ResumoTab({ atual }: { atual: TechSnapshot }) {
  const tiles: { label: string; value: string; color: string }[] = [
    { label: "Score geral", value: atual.score_geral.toFixed(1), color: scoreColor(atual.score_geral) },
    { label: "Chamados", value: atual.chamados_resolvidos.toFixed(0), color: "var(--tinta)" },
    { label: "Categorias distintas", value: atual.n_categorias.toFixed(0), color: "var(--tinta)" },
    { label: "Urgência média", value: atual.urgencia_media.toFixed(1), color: "var(--tinta)" },
    { label: "Resposta média (min)", value: atual.resposta_media_min.toFixed(0), color: "var(--tinta)" },
    { label: "Resolução média (h)", value: atual.resolucao_media_h.toFixed(1), color: "var(--tinta)" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.6rem", marginBottom: "1.25rem" }}>
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              background: "var(--superficie)",
              border: "1px solid var(--linha)",
              borderLeft: `3px solid ${t.color}`,
              padding: "0.7rem 0.9rem",
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "1.2rem", fontWeight: 800, color: t.color }}>
              {t.value}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--apagado)" }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {SCORE_LABELS.map(({ key, label }) => (
          <SubScoreBar key={key} label={label} value={atual[key] as number} />
        ))}
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <ConfidenceBadge nivel={atual.nivel_evidencia} suffix={`(${Math.round(atual.confianca * 100)}%)`} />
      </div>
    </div>
  );
}

function SubScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 34px", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ fontSize: "var(--fonte-label)", color: "var(--apagado)" }}>{label}</span>
      <Bar pct={value} height={8} color={scoreColor(value)} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fonte-dados)", textAlign: "right" }}>{value.toFixed(0)}</span>
    </div>
  );
}

function ChamadosTab({ chamados }: { chamados: TechnicianRecentTicket[] }) {
  if (chamados.length === 0) return <p style={{ color: "var(--apagado)" }}>Nenhum chamado resolvido ainda.</p>;
  return (
    <table style={{ width: "100%", fontSize: "var(--fonte-dados)", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--apagado)", textAlign: "left", borderBottom: "1px solid var(--linha)" }}>
          <th style={{ padding: "0.35rem 0.5rem" }}>Chamado</th>
          <th>Urgência</th>
          <th>Solução</th>
          <th>Reaberto</th>
        </tr>
      </thead>
      <tbody>
        {chamados.map((c) => (
          <tr key={c.tickets_id} style={{ borderBottom: "1px solid var(--linha)" }}>
            <td style={{ padding: "0.35rem 0.5rem", fontFamily: "var(--font-mono)" }}>#{c.tickets_id}</td>
            <td>{c.urgency}</td>
            <td>{c.solvedate ? new Date(c.solvedate).toLocaleDateString("pt-BR") : "—"}</td>
            <td>{c.foi_reaberto ? "Sim" : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoricoTab({
  historico,
}: {
  historico: Pick<TechSnapshot, "snapshot_seq" | "periodo_ref" | "score_geral" | "confianca">[];
}) {
  if (historico.length === 0) return <p style={{ color: "var(--apagado)" }}>Sem histórico ainda.</p>;
  const max = Math.max(...historico.map((h) => h.score_geral), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
      {historico.map((h) => (
        <div
          key={h.snapshot_seq}
          title={`${h.periodo_ref}: ${h.score_geral.toFixed(1)}`}
          style={{
            flex: 1,
            minWidth: 3,
            height: `${(h.score_geral / max) * 100}%`,
            background: scoreColor(h.score_geral),
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}
