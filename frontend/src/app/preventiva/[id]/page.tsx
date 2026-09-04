"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";

import { AddItemsSection } from "@/components/preventiva/AddItemsSection";
import { CloseCycleSummary } from "@/components/preventiva/CloseCycleSummary";
import { CycleItemRow } from "@/components/preventiva/CycleItemRow";
import { PlanningChecklist } from "@/components/preventiva/PlanningChecklist";
import { Tabs } from "@/components/ui/Tabs";
import { useAdmin } from "@/lib/admin-context";
import {
  computers as computersApi,
  cycles as cyclesApi,
  technicians as techniciansApi,
} from "@/lib/api";
import { useSession } from "@/lib/session-context";

type AbaCiclo = "planejamento" | "computadores" | "fechamento";

export default function CycleDetailPage() {
  const params = useParams<{ id: string }>();
  const cycleId = Number(params.id);

  const [abaSelecionada, setAbaSelecionada] = useState<AbaCiclo>("planejamento");
  const { isAdmin } = useAdmin();
  const { usersId } = useSession();

  const { data: cycle, error, isLoading, mutate } = useSWR(["cycle", cycleId], () => cyclesApi.get(cycleId));
  // inclui PCs baixados: um computador desativado depois de entrar no ciclo
  // ainda precisa mostrar o patrimônio na tabela, não "#id".
  const { data: computerPage } = useSWR(
    ["computers-all", "incl-inativos"],
    () => computersApi.list({ pageSize: 200, incluirInativos: true }),
  );
  const { data: techs } = useSWR("technicians", () => techniciansApi.list({ includeInactive: true }));

  const computerById = new Map((computerPage?.items ?? []).map((c) => [c.id, c]));
  const responsavelNome = techs?.find((t) => t.users_id === cycle?.responsavel_id)?.nome_completo;
  const tecnicoNome = (id: number | null) => (id ? techs?.find((t) => t.users_id === id)?.nome_completo ?? null : null);

  if (isLoading && !cycle) return <main className="sumula-container-hub" style={{ flex: 1, padding: "2rem" }}><p style={{ color: "var(--apagado)" }}>Carregando ciclo...</p></main>;
  if (error || !cycle) return <main className="sumula-container-hub" style={{ flex: 1, padding: "2rem" }}><p style={{ color: "var(--critico)" }}>Ciclo não encontrado.</p></main>;

  // "gestor deste ciclo" = admin ou o técnico responsável designado. Só ele
  // planeja, agenda, adiciona/remove PC e fecha; o técnico de um item só age
  // no item dele (ver CycleItemRow). Não-gestor vê tudo em modo leitura.
  const souGestor = isAdmin || (usersId != null && cycle.responsavel_id === usersId);

  // ciclo encerrado não tem mais planejamento nem fechamento pra fazer - só
  // a aba Computadores (histórico) faz sentido. Fechamento só pro gestor.
  const abas = cycle.status === "planejamento"
    ? [
        { key: "planejamento", label: "Planejamento" },
        { key: "computadores", label: `Computadores${cycle.itens.length ? ` (${cycle.itens.length})` : ""}` },
        ...(souGestor ? [{ key: "fechamento", label: "Fechamento" }] : []),
      ]
    : [{ key: "computadores", label: "Computadores" }];
  const aba = abas.some((a) => a.key === abaSelecionada) ? abaSelecionada : abas[0].key;

  return (
    <main className="sumula-container-hub" style={{ flex: 1 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/preventiva" style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)" }}>← Ciclos de preventiva</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600, marginTop: "0.5rem" }}>
              {cycle.nome}
            </h1>
            <p style={{ color: "var(--apagado)" }}>
              Responsável: {responsavelNome ?? `#${cycle.responsavel_id}`} · Status: {cycle.status === "planejamento" ? "Em planejamento" : "Encerrado"}
              {cycle.data_inicio && ` · Início ${cycle.data_inicio}`}
              {cycle.data_prevista_encerramento && ` · Final previsto ${cycle.data_prevista_encerramento}`}
            </p>
          </div>
        </div>
      </div>

      {abas.length > 1 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <Tabs tabs={abas} active={aba} onChange={(key) => setAbaSelecionada(key as AbaCiclo)} />
        </div>
      )}

      {aba === "planejamento" && cycle.status === "planejamento" && (
        <section className="sumula-cartao admin-panel">
          <div className="admin-panel-header"><h2>Checklist de planejamento</h2></div>
          <PlanningChecklist
            cycleId={cycleId}
            itens={cycle.planejamento_itens ?? []}
            readOnly={!souGestor}
            onChanged={() => mutate()}
          />
        </section>
      )}

      {aba === "computadores" && (
        <>
          {cycle.status === "planejamento" && souGestor && (
            <AddItemsSection
              cycleId={cycleId}
              jaNoCiclo={new Set(cycle.itens.map((item) => item.computador_id))}
              onAdded={() => mutate()}
            />
          )}

          <section className="sumula-cartao admin-panel">
            <div className="admin-panel-header"><h2>Computadores do ciclo</h2></div>
            {cycle.itens.length === 0 ? (
              <p style={{ color: "var(--apagado)" }}>Nenhum computador adicionado ainda.</p>
            ) : (
              <div className="preventiva-table-wrap">
                <table className="preventiva-table">
                  <thead>
                    <tr>
                      <th>Patrimônio</th>
                      <th>Prioridade</th>
                      <th>Status</th>
                      <th>Data</th>
                      <th>Técnico</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycle.itens.map((item) => (
                      <CycleItemRow
                        key={item.id}
                        item={item}
                        patrimonio={computerById.get(item.computador_id)?.patrimonio ?? `#${item.computador_id}`}
                        tecnicoNome={tecnicoNome(item.tecnico_id)}
                        souGestor={souGestor}
                        meuUserId={usersId}
                        onChanged={() => mutate()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {aba === "fechamento" && cycle.status === "planejamento" && souGestor && (
        <CloseCycleSummary cycleId={cycleId} itens={cycle.itens} onClosed={() => mutate()} />
      )}
    </main>
  );
}
