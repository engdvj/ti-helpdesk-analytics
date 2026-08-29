"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi } from "@/lib/api";

/** Mesmo padrao do CollectionPanel, mas sem historico paginado/ordenavel -
 * sync de setor e uma acao simples (so precisa saber "ultima rodou quando,
 * quantos criados/atualizados/desativados"), nao justifica uma tabela. */
export function SectorSyncPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: latest, mutate } = useSWR(
    credentials ? ["sector-sync-runs", credentials.username] : null,
    () => adminApi.listCollectionRuns(
      { page: 1, pageSize: 1, sortBy: "requested_at", sortDir: "desc" },
      credentials!,
      "setores",
    ),
  );

  const active = latest?.active ?? null;
  const last = latest?.items?.[0] ?? null;

  async function run() {
    if (!credentials) return;
    setStarting(true);
    setError(null);
    try {
      await adminApi.syncSectors(credentials);
      await mutate();
      // polling simples: sync de setor e rapida (segundos), uma nova
      // consulta em 3s ja costuma pegar o resultado final.
      setTimeout(() => {
        void mutate();
        void mutateGlobal((key) => Array.isArray(key) && key[0] === "sectors");
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
          <h2>Setores</h2>
          <p>Sincroniza os setores do hospital a partir do grupo &quot;Setores&quot; no GLPI.</p>
        </div>
        <Botao variant="primario" onClick={run} disabled={starting || Boolean(active)}>
          {starting ? "Iniciando..." : active ? "Sincronizando..." : "Sincronizar setores"}
        </Botao>
      </div>

      {last && (
        <p className="admin-panel-result" style={{ color: last.status === "error" ? "var(--critico)" : "var(--apagado)" }}>
          {last.status === "success" && last.counts
            ? `Última sincronização: ${last.counts.setores_criados ?? 0} criados, ${last.counts.setores_atualizados ?? 0} atualizados, ${last.counts.setores_desativados ?? 0} desativados.`
            : last.status === "error"
              ? `Última sincronização falhou: ${last.error ?? "erro sem mensagem"}`
              : "Sincronização em andamento..."}
        </p>
      )}
      {error && <p className="admin-panel-result is-error">{error}</p>}
    </section>
  );
}
