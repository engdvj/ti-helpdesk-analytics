"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi, type CollectionRun } from "@/lib/api";

import { formatDateTime, StatusBadge, SyncHistory } from "./SyncHistory";

const COLLECTION_DERIVED_ARRAY_KEYS = new Set([
  "snapshot-periods",
  "snapshots",
  "tech-profile",
  "technicians",
]);

function isCollectionDerivedKey(key: unknown): boolean {
  if (key === "units" || key === "category-difficulty") return true;
  return Array.isArray(key) && COLLECTION_DERIVED_ARRAY_KEYS.has(String(key[0]));
}

export function CollectionPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [active, setActive] = useState<CollectionRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const previousActiveId = useRef<string | null>(null);

  useEffect(() => {
    const activeId = active?.id ?? null;
    if (previousActiveId.current && !activeId) {
      void mutateGlobal(isCollectionDerivedKey);
    }
    previousActiveId.current = activeId;
  }, [active, mutateGlobal]);

  async function run() {
    if (!credentials) return;
    setStarting(true);
    setActionError(null);
    try {
      await adminApi.collect(credentials);
      // força o histórico a recarregar já (senão só apareceria no próximo poll)
      await mutateGlobal((key) => Array.isArray(key) && key[0] === "collection-runs" && key[1] === "chamados");
    } catch (runError) {
      setActionError((runError as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="admin-dashboard-stack">
      <section className="sumula-cartao admin-panel">
        <div className="admin-panel-header admin-collect-header">
          <div>
            <h2>Coleta</h2>
            <p>Atualiza os dados do GLPI e recalcula todos os scores.</p>
          </div>
          {!active && (
            <Botao variant="primario" onClick={run} disabled={starting}>
              {starting ? "Iniciando..." : "Rodar coleta"}
            </Botao>
          )}
        </div>

        {active && (
          <div className="admin-collection-active" role="status">
            <StatusBadge status={active.status} />
            <div className="admin-collection-active-copy">
              <strong>{active.status === "queued" ? "Coleta aguardando execução" : "Coleta sendo processada"}</strong>
              <span>Solicitada em {formatDateTime(active.requested_at)} por {active.requested_by}</span>
            </div>
            <span className="admin-collection-background-note">
              {active.status === "queued" ? "Aguardando processamento" : "Executando em segundo plano"}
            </span>
          </div>
        )}
        {actionError && <p className="admin-panel-result is-error">{actionError}</p>}
      </section>

      <AutoCollectControl />

      <SyncHistory
        tipo="chamados"
        title="Histórico de coletas"
        description="Execuções persistidas com resultado completo e diagnóstico de falhas."
        noun={{ singular: "coleta", plural: "coletas" }}
        onActiveChange={setActive}
      />
    </div>
  );
}

function AutoCollectControl() {
  const { credentials } = useAdmin();
  const { data, mutate } = useSWR("auto-collect", () => adminApi.getAutoCollect());
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = draft ?? (data ? String(data.minutes) : "");

  async function save() {
    if (!credentials) return;
    const minutes = Number(current);
    if (!Number.isFinite(minutes) || minutes < 0) {
      setError("Informe um número de minutos válido (0 desliga).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await adminApi.setAutoCollect(minutes, credentials);
      await mutate(saved, { revalidate: false });
      setDraft(null);
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sumula-cartao admin-panel admin-auto-collect">
      <div className="admin-panel-header">
        <div>
          <h2>Coleta automática</h2>
          <p>
            {data == null
              ? "Carregando..."
              : data.minutes > 0
                ? `Ligada — roda a coleta de chamados sozinha a cada ${data.minutes} min.`
                : "Desligada — só roda manualmente ou pelo botão acima."}
          </p>
        </div>
      </div>
      <div className="admin-auto-collect-controls">
        <label>
          Intervalo (minutos, 0 desliga)
          <input
            type="number"
            min={0}
            max={1440}
            step={5}
            value={current}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <Botao variant="primario" onClick={save} disabled={saving || draft === null}>
          {saving ? "Salvando..." : "Salvar"}
        </Botao>
      </div>
      {error && <p className="admin-panel-result is-error">{error}</p>}
    </section>
  );
}
