"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi, type CollectionRun } from "@/lib/api";

import { formatDateTime, StatusBadge, SyncHistory } from "./SyncHistory";

/** Importa os Computer do GLPI (agent/glpiinventory) pro inventário local +
 * hardware pro score de saúde. Só leitura: nunca escreve no GLPI (ver
 * services/computer_sync.py). Mesma UI de controle + histórico da Coleta. */
export function ComputerSyncPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [active, setActive] = useState<CollectionRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eraAtiva = useRef(false);

  useEffect(() => {
    if (eraAtiva.current && !active) {
      void mutateGlobal((key) => Array.isArray(key) && (key[0] === "computers" || key[0] === "computer"));
    }
    eraAtiva.current = active != null;
  }, [active, mutateGlobal]);

  async function run() {
    if (!credentials) return;
    setStarting(true);
    setError(null);
    try {
      await adminApi.syncComputers(credentials);
      await mutateGlobal((key) => Array.isArray(key) && key[0] === "collection-runs" && key[1] === "computadores");
    } catch (runError) {
      setError((runError as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="admin-dashboard-stack">
      <section className="sumula-cartao admin-panel">
        <div className="admin-panel-header admin-collect-header">
          <div>
            <h2>Computadores</h2>
            <p>Importa os computadores do GLPI (GLPI Agent). Só leitura — o setor é atribuído aqui na plataforma.</p>
          </div>
          {!active && (
            <Botao variant="primario" onClick={run} disabled={starting}>
              {starting ? "Iniciando..." : "Sincronizar computadores"}
            </Botao>
          )}
        </div>

        {active && (
          <div className="admin-collection-active" role="status">
            <StatusBadge status={active.status} />
            <div className="admin-collection-active-copy">
              <strong>{active.status === "queued" ? "Sincronização aguardando execução" : "Sincronização em andamento"}</strong>
              <span>Solicitada em {formatDateTime(active.requested_at)} por {active.requested_by}</span>
            </div>
            <span className="admin-collection-background-note">Executando em segundo plano</span>
          </div>
        )}
        {error && <p className="admin-panel-result is-error">{error}</p>}
      </section>

      <SyncHistory
        tipo="computadores"
        title="Histórico de sincronizações"
        description="Cada importação de computadores do GLPI, com contagens (novos, sem setor, sem patrimônio) e falhas."
        noun={{ singular: "sincronização", plural: "sincronizações" }}
        onActiveChange={setActive}
      />
    </div>
  );
}
