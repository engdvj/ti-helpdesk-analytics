"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import {
  adminApi,
  type CollectionRun,
  type CollectionRunSort,
  type CollectionRunStatus,
} from "@/lib/api";

type SortDir = "asc" | "desc";
type StatusFilter = "all" | CollectionRunStatus;

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const STATUS_META: Record<CollectionRunStatus, { label: string; className: string }> = {
  queued: { label: "Na fila", className: "is-queued" },
  running: { label: "Em andamento", className: "is-running" },
  success: { label: "Concluída", className: "is-success" },
  error: { label: "Falhou", className: "is-error" },
};

const COUNT_LABELS: Record<string, string> = {
  unidades_ti: "Unidades de TI",
  tecnicos: "Técnicos",
  fotos_glpi: "Fotos do GLPI",
  chamados_ti: "Chamados de TI",
  chamados_reabertos: "Chamados reabertos",
  atribuicoes: "Atribuições",
};

const SORT_COLUMNS: { key: CollectionRunSort; label: string }[] = [
  { key: "requested_at", label: "Solicitada em" },
  { key: "status", label: "Status" },
  { key: "requested_by", label: "Solicitada por" },
  { key: "duration_seconds", label: "Duração" },
];

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

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  // Versoes anteriores da API, sobretudo com SQLite, serializavam UTC sem
  // `Z`. Sem o sufixo o navegador interpreta 20:00 como hora local e soma
  // tres horas ao horario real. O contrato desta tela e UTC na origem.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? value : DATE_TIME_FORMAT.format(parsed);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min ${String(remainingSeconds).padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}min ${String(remainingSeconds).padStart(2, "0")}s`;
  return `${remainingSeconds}s`;
}

function resultSummary(run: CollectionRun): string {
  if (run.status === "error") return run.error ?? "Falha sem mensagem registrada";
  if (run.status === "queued") return "Aguardando o início";
  if (run.status === "running") return "Pipeline GLPI → raw → silver → gold → scores";
  if (!run.counts) return "Concluída sem contagens";
  const parts = [
    run.counts.chamados_ti != null ? `${run.counts.chamados_ti} chamados` : null,
    run.counts.tecnicos != null ? `${run.counts.tecnicos} técnicos` : null,
    run.counts.unidades_ti != null ? `${run.counts.unidades_ti} unidades` : null,
  ].filter(Boolean);
  return parts.join(" · ") || `${Object.keys(run.counts).length} resultados`;
}

function StatusBadge({ status }: { status: CollectionRunStatus }) {
  const meta = STATUS_META[status];
  return <span className={`admin-collection-status ${meta.className}`}><i />{meta.label}</span>;
}

export function CollectionPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<CollectionRunSort>("requested_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const previousActiveId = useRef<string | null>(null);

  const swrKey = credentials
    ? ["collection-runs", credentials.username, page, pageSize, sortBy, sortDir, statusFilter]
    : null;
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    () => adminApi.listCollectionRuns({
      page,
      pageSize,
      sortBy,
      sortDir,
      status: statusFilter === "all" ? undefined : statusFilter,
    }, credentials!),
    {
      keepPreviousData: true,
      refreshInterval: (latest) => latest?.active ? 2_000 : 0,
      revalidateOnFocus: true,
    },
  );

  useEffect(() => {
    const activeId = data?.active?.id ?? null;
    if (previousActiveId.current && !activeId) {
      void mutateGlobal(isCollectionDerivedKey);
    }
    previousActiveId.current = activeId;
  }, [data?.active?.id, mutateGlobal]);

  async function run() {
    if (!credentials) return;
    setStarting(true);
    setActionError(null);
    try {
      await adminApi.collect(credentials);
      setPage(1);
      setSortBy("requested_at");
      setSortDir("desc");
      setStatusFilter("all");
      await mutate();
    } catch (runError) {
      setActionError((runError as Error).message);
      await mutate();
    } finally {
      setStarting(false);
    }
  }

  function toggleSort(key: CollectionRunSort) {
    setPage(1);
    if (sortBy === key) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortBy(key);
      setSortDir(key === "requested_at" ? "desc" : "asc");
    }
  }

  const active = data?.active ?? null;

  return (
    <div className="admin-dashboard-stack">
      <section className="sumula-cartao admin-panel">
        <div className="admin-panel-header admin-collect-header">
          <div>
            <h2>Coleta</h2>
            <p>Atualiza os dados do GLPI e recalcula todos os scores.</p>
          </div>
          {!active && (
            <Botao variant="primario" onClick={run} disabled={starting || isLoading}>
              {starting ? "Iniciando..." : isLoading ? "Verificando..." : "Rodar coleta"}
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

      <section className="sumula-cartao admin-panel admin-collection-history">
        <div className="admin-panel-header admin-collection-history-header">
          <div>
            <h2>Histórico de coletas</h2>
            <p>Execuções persistidas com resultado completo e diagnóstico de falhas.</p>
          </div>
          <div className="admin-collection-filters">
            <label>
              Status
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1); }}>
                <option value="all">Todos</option>
                <option value="success">Concluídas</option>
                <option value="error">Falhas</option>
                <option value="running">Em andamento</option>
                <option value="queued">Na fila</option>
              </select>
            </label>
            <label>
              Por página
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        </div>

        {error && <p className="admin-panel-result is-error">Não foi possível carregar o histórico: {(error as Error).message}</p>}
        {isLoading && !data && <p className="admin-collection-empty">Carregando histórico...</p>}

        {data && (
          <>
            <div className="admin-collection-table-wrap">
              <table className="admin-collection-table">
                <thead>
                  <tr>
                    <th aria-label="Detalhes" />
                    {SORT_COLUMNS.map((column) => (
                      <th key={column.key} aria-sort={sortBy === column.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                        <button type="button" onClick={() => toggleSort(column.key)}>
                          {column.label}
                          {sortBy === column.key && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                        </button>
                      </th>
                    ))}
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((runItem) => <CollectionRunRow key={runItem.id} run={runItem} />)}
                  {data.items.length === 0 && (
                    <tr><td colSpan={6} className="admin-collection-empty">Nenhuma coleta encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="admin-pagination">
              <span>{data.total} coleta{data.total === 1 ? "" : "s"} · página {data.page} de {data.total_pages}</span>
              <div>
                <Botao variant="secundario" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={data.page <= 1}>Anterior</Botao>
                <Botao variant="secundario" onClick={() => setPage((current) => Math.min(data.total_pages, current + 1))} disabled={data.page >= data.total_pages}>Próxima</Botao>
              </div>
            </div>
          </>
        )}
      </section>
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
                ? `Ligada — roda sozinha a cada ${data.minutes} min.`
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

function CollectionRunRow({ run }: { run: CollectionRun }) {
  const [expanded, setExpanded] = useState(false);
  const counts = Object.entries(run.counts ?? {});

  return (
    <>
      <tr className={expanded ? "is-expanded" : undefined}>
        <td>
          <button
            type="button"
            className="admin-collection-expand"
            aria-label={expanded ? "Ocultar detalhes da coleta" : "Mostrar detalhes da coleta"}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td><time dateTime={run.requested_at}>{formatDateTime(run.requested_at)}</time></td>
        <td><StatusBadge status={run.status} /></td>
        <td>{run.requested_by}</td>
        <td>{formatDuration(run.duration_seconds)}</td>
        <td className={run.status === "error" ? "admin-collection-result is-error" : "admin-collection-result"}>{resultSummary(run)}</td>
      </tr>
      {expanded && (
        <tr className="admin-collection-details-row">
          <td colSpan={6}>
            <div className="admin-collection-details">
              <dl>
                <div><dt>ID</dt><dd>{run.id}</dd></div>
                <div><dt>Solicitada</dt><dd>{formatDateTime(run.requested_at)}</dd></div>
                <div><dt>Iniciada</dt><dd>{formatDateTime(run.started_at)}</dd></div>
                <div><dt>Finalizada</dt><dd>{formatDateTime(run.finished_at)}</dd></div>
                <div><dt>Duração</dt><dd>{formatDuration(run.duration_seconds)}</dd></div>
              </dl>

              {counts.length > 0 && (
                <div className="admin-collection-counts">
                  {counts.map(([key, value]) => (
                    <div key={key}><span>{COUNT_LABELS[key] ?? key.replaceAll("_", " ")}</span><strong>{value}</strong></div>
                  ))}
                </div>
              )}

              {run.error && (
                <div className="admin-collection-error-details">
                  <strong>Erro</strong>
                  <p>{run.error}</p>
                  {run.error_details && <pre>{run.error_details}</pre>}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
