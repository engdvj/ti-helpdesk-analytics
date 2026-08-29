"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi } from "@/lib/api";

/** Gêmeo do SectorSyncPanel - puxa os Computer do GLPI (agent/glpiinventory)
 * pro inventário local. Só leitura: nunca escreve no GLPI (ver
 * services/computer_sync.py). PC sem "Número de inventário" e sem "Usuário"
 * resolvido no GLPI entra sem patrimônio / sem setor pra triar aqui. */
export function ComputerSyncPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: latest, mutate } = useSWR(
    credentials ? ["computer-sync-runs", credentials.username] : null,
    () => adminApi.listCollectionRuns(
      { page: 1, pageSize: 1, sortBy: "requested_at", sortDir: "desc" },
      credentials!,
      "computadores",
    ),
  );

  const active = latest?.active ?? null;
  const last = latest?.items?.[0] ?? null;

  async function run() {
    if (!credentials) return;
    setStarting(true);
    setError(null);
    try {
      await adminApi.syncComputers(credentials);
      await mutate();
      setTimeout(() => {
        void mutate();
        void mutateGlobal((key) => Array.isArray(key) && key[0] === "computers");
      }, 3_000);
    } catch (runError) {
      setError((runError as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="sumula-cartao admin-panel">
      <div className="admin-panel-header admin-collect-header">
        <div>
          <h2>Computadores</h2>
          <p>Importa os computadores do GLPI (GLPI Agent). Só leitura — o setor é atribuído aqui na plataforma.</p>
        </div>
        <Botao variant="primario" onClick={run} disabled={starting || Boolean(active)}>
          {starting ? "Iniciando..." : active ? "Sincronizando..." : "Sincronizar computadores"}
        </Botao>
      </div>

      {last && (
        <p className="admin-panel-result" style={{ color: last.status === "error" ? "var(--critico)" : "var(--apagado)" }}>
          {last.status === "success" && last.counts
            ? `Última sincronização: ${last.counts.computadores_criados ?? 0} novos, ${last.counts.computadores_atualizados ?? 0} atualizados` +
              `${last.counts.sem_setor_resolvido ? ` · ${last.counts.sem_setor_resolvido} sem setor` : ""}` +
              `${last.counts.sem_patrimonio ? ` · ${last.counts.sem_patrimonio} sem patrimônio` : ""}.`
            : last.status === "error"
              ? `Última sincronização falhou: ${last.error ?? "erro sem mensagem"}`
              : "Sincronização em andamento..."}
        </p>
      )}
      {error && <p className="admin-panel-result is-error">{error}</p>}
    </section>
  );
}
