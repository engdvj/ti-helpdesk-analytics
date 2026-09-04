"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import {
  adminApi,
  type CollectionRun,
  type CollectionRunSort,
  type CollectionRunStatus,
} from "@/lib/api";

/** Histórico de execuções de um job de `collection_runs` (chamados / setores /
 * computadores). Tabela ordenável + filtro de status + paginação + linha
 * expansível com contagens e traceback — mesma UI pros três tipos. Cada tipo
 * traz seu vocabulário em SYNC_PRESETS. */

export type SyncTipo = "chamados" | "setores" | "computadores";
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

const SORT_COLUMNS: { key: CollectionRunSort; label: string }[] = [
  { key: "requested_at", label: "Solicitada em" },
  { key: "status", label: "Status" },
  { key: "requested_by", label: "Solicitada por" },
  { key: "duration_seconds", label: "Duração" },
];

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  // Versoes anteriores da API, sobretudo com SQLite, serializavam UTC sem
  // `Z`. Sem o sufixo o navegador interpreta 20:00 como hora local e soma
  // tres horas ao horario real. O contrato desta tela e UTC na origem.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? value : DATE_TIME_FORMAT.format(parsed);
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min ${String(remainingSeconds).padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}min ${String(remainingSeconds).padStart(2, "0")}s`;
  return `${remainingSeconds}s`;
}

export function StatusBadge({ status }: { status: CollectionRunStatus }) {
  const meta = STATUS_META[status];
  return <span className={`admin-collection-status ${meta.className}`}><i />{meta.label}</span>;
}

interface SyncPreset {
  countLabels: Record<string, string>;
  summarize: (run: CollectionRun) => string;
}

function errorOrPending(run: CollectionRun): string | null {
  if (run.status === "error") return run.error ?? "Falha sem mensagem registrada";
  if (run.status === "queued") return "Aguardando o início";
  return null;
}

export const SYNC_PRESETS: Record<SyncTipo, SyncPreset> = {
  chamados: {
    countLabels: {
      unidades_ti: "Unidades de TI",
      tecnicos: "Técnicos",
      fotos_glpi: "Fotos do GLPI",
      chamados_ti: "Chamados de TI",
      chamados_reabertos: "Chamados reabertos",
      atribuicoes: "Atribuições",
    },
    summarize: (run) => {
      const pending = errorOrPending(run);
      if (pending) return pending;
      if (run.status === "running") return "Pipeline GLPI → raw → silver → gold → scores";
      if (!run.counts) return "Concluída sem contagens";
      const parts = [
        run.counts.chamados_ti != null ? `${run.counts.chamados_ti} chamados` : null,
        run.counts.tecnicos != null ? `${run.counts.tecnicos} técnicos` : null,
        run.counts.unidades_ti != null ? `${run.counts.unidades_ti} unidades` : null,
      ].filter(Boolean);
      return parts.join(" · ") || `${Object.keys(run.counts).length} resultados`;
    },
  },
  setores: {
    countLabels: {
      setores_criados: "Setores criados",
      setores_atualizados: "Setores atualizados",
      setores_desativados: "Setores desativados",
    },
    summarize: (run) => {
      const pending = errorOrPending(run);
      if (pending) return pending;
      if (run.status === "running") return "Consultando o grupo \"Setores\" no GLPI";
      const c = run.counts ?? {};
      return `${c.setores_criados ?? 0} criados · ${c.setores_atualizados ?? 0} atualizados · ${c.setores_desativados ?? 0} desativados`;
    },
  },
  computadores: {
    countLabels: {
      computadores_criados: "Computadores novos",
      computadores_atualizados: "Computadores atualizados",
      sem_setor_resolvido: "Sem setor resolvido",
      sem_patrimonio: "Sem patrimônio",
      hardware_atualizado: "Hardware atualizado",
    },
    summarize: (run) => {
      const pending = errorOrPending(run);
      if (pending) return pending;
      if (run.status === "running") return "Importando Computer + hardware do GLPI";
      const c = run.counts ?? {};
      const parts = [
        `${c.computadores_criados ?? 0} novos`,
        `${c.computadores_atualizados ?? 0} atualizados`,
        c.sem_setor_resolvido ? `${c.sem_setor_resolvido} sem setor` : null,
        c.sem_patrimonio ? `${c.sem_patrimonio} sem patrimônio` : null,
      ].filter(Boolean);
      return parts.join(" · ");
    },
  },
};

export function SyncHistory({
  tipo,
  title,
  description,
  noun,
  onActiveChange,
}: {
  tipo: SyncTipo;
  title: string;
  description: string;
  /** Vocabulário pro contador de paginação, estado vazio e aria-label. */
  noun: { singular: string; plural: string };
  /** Disparado sempre que a execução ativa muda (inclusive pra `null` ao
   * terminar) - o painel usa pra esconder o botão e revalidar dados. */
  onActiveChange?: (active: CollectionRun | null) => void;
}) {
  const { credentials } = useAdmin();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<CollectionRunSort>("requested_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const preset = SYNC_PRESETS[tipo];

  const swrKey = credentials
    ? ["collection-runs", tipo, credentials.username, page, pageSize, sortBy, sortDir, statusFilter]
    : null;
  const { data, error, isLoading } = useSWR(
    swrKey,
    () => adminApi.listCollectionRuns(
      { page, pageSize, sortBy, sortDir, status: statusFilter === "all" ? undefined : statusFilter },
      credentials!,
      tipo,
    ),
    {
      keepPreviousData: true,
      refreshInterval: (latest) => (latest?.active ? 2_000 : 0),
      revalidateOnFocus: true,
    },
  );

  // `active` fica `null` estável quando não há execução em curso (só muda de
  // identidade enquanto uma roda, a cada poll) - o pai usa pra esconder o
  // botão e revalidar dados quando volta a `null`.
  const activeRun = data?.active ?? null;
  useEffect(() => {
    onActiveChange?.(activeRun);
  }, [activeRun, onActiveChange]);

  function toggleSort(key: CollectionRunSort) {
    setPage(1);
    if (sortBy === key) setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "requested_at" ? "desc" : "asc");
    }
  }

  return (
    <section className="sumula-cartao admin-panel admin-collection-history">
      <div className="admin-panel-header admin-collection-history-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
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
                {data.items.map((run) => (
                  <SyncHistoryRow
                    key={run.id}
                    run={run}
                    noun={noun.singular}
                    countLabels={preset.countLabels}
                    summarize={preset.summarize}
                  />
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={6} className="admin-collection-empty">Nenhuma {noun.singular} encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span>{data.total} {data.total === 1 ? noun.singular : noun.plural} · página {data.page} de {data.total_pages}</span>
            <div>
              <Botao variant="secundario" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={data.page <= 1}>Anterior</Botao>
              <Botao variant="secundario" onClick={() => setPage((current) => Math.min(data.total_pages, current + 1))} disabled={data.page >= data.total_pages}>Próxima</Botao>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function SyncHistoryRow({
  run,
  noun,
  countLabels,
  summarize,
}: {
  run: CollectionRun;
  noun: string;
  countLabels: Record<string, string>;
  summarize: (run: CollectionRun) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const counts = Object.entries(run.counts ?? {});

  return (
    <>
      <tr className={expanded ? "is-expanded" : undefined}>
        <td>
          <button
            type="button"
            className="admin-collection-expand"
            aria-label={expanded ? `Ocultar detalhes da ${noun}` : `Mostrar detalhes da ${noun}`}
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
        <td className={run.status === "error" ? "admin-collection-result is-error" : "admin-collection-result"}>{summarize(run)}</td>
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
                    <div key={key}><span>{countLabels[key] ?? key.replaceAll("_", " ")}</span><strong>{value}</strong></div>
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
