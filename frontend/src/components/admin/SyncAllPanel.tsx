"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi } from "@/lib/api";

/** Atalho pra disparar os 3 syncs de uma vez (coleta de chamados + setores +
 * computadores). Cada um continua sendo um job de fundo independente com seu
 * próprio painel/histórico logo abaixo - este botão só evita 3 cliques. O que
 * já estiver rodando é ignorado (o backend rejeita concorrência por tipo). */
export function SyncAllPanel() {
  const { credentials } = useAdmin();
  const { mutate } = useSWRConfig();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro: boolean } | null>(null);

  async function run() {
    if (!credentials) return;
    setRunning(true);
    setMsg(null);

    const jobs: [string, () => Promise<unknown>][] = [
      ["chamados", () => adminApi.collect(credentials)],
      ["setores", () => adminApi.syncSectors(credentials)],
      ["computadores", () => adminApi.syncComputers(credentials)],
    ];
    const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));
    const falhas = results
      .map((r, i) => (r.status === "rejected" ? jobs[i][0] : null))
      .filter((nome): nome is string => nome !== null);

    // revalida os históricos (SyncHistory) dos 3 tipos
    void mutate((key) => Array.isArray(key) && key[0] === "collection-runs");

    setRunning(false);
    setMsg(
      falhas.length === 0
        ? { texto: "Os 3 syncs foram disparados — acompanhe o andamento nos painéis abaixo.", erro: false }
        : { texto: `Não iniciou: ${falhas.join(", ")} (provavelmente já estava rodando). Os demais foram disparados.`, erro: true },
    );
  }

  return (
    <section className="sumula-cartao admin-panel">
      <div className="admin-panel-header admin-collect-header">
        <div>
          <h2>Sincronizar tudo</h2>
          <p>Dispara chamados, setores e computadores de uma vez. Cada um roda no seu ritmo e aparece no painel correspondente.</p>
        </div>
        <Botao variant="primario" onClick={run} disabled={running}>
          {running ? "Disparando..." : "Sincronizar tudo"}
        </Botao>
      </div>
      {msg && <p className={`admin-panel-result${msg.erro ? " is-error" : ""}`}>{msg.texto}</p>}
    </section>
  );
}
