"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi, categoryDifficulty as categoryDifficultyApi, type CategoryDifficulty } from "@/lib/api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

const OVERRIDE_STEP = 0.01;
const MIN_OVERRIDE = 0.01;

type SortKey = "categoria_pai" | "categoria_nome" | "n_chamados" | "resolucao_media_h" | "dificuldade_atual";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "categoria_pai", label: "Categoria pai" },
  { key: "categoria_nome", label: "Categoria" },
  { key: "n_chamados", label: "Chamados" },
  { key: "resolucao_media_h", label: "Resolução média" },
  { key: "dificuldade_atual", label: "Complexidade atual" },
];

/** Secao dedicada de admin pra "pontuar" cada categoria manualmente -
 * sugestao automatica (baseline historica, ver analytics/complexity.py)
 * fica visivel como referencia, mas o admin pode sobrescrever com
 * julgamento proprio. A API sobrepoe a configuracao em tempo de leitura,
 * entao snapshots e perfis mudam sem esperar uma nova coleta. */
export function CategoryDifficultyPanel() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    "category-difficulty",
    () => categoryDifficultyApi.list(),
    {
      revalidateOnMount: true,
      dedupingInterval: 0,
    },
  );
  const [search, setSearch] = useState("");
  const [onlyWithTickets, setOnlyWithTickets] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("categoria_nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data;
    const query = search.trim().toLowerCase();
    if (query) rows = rows.filter((r) => r.categoria_completa.toLowerCase().includes(query));
    if (onlyWithTickets) rows = rows.filter((r) => r.n_chamados > 0);

    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let diff: number;
      if (typeof av === "string" || typeof bv === "string") {
        diff = String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
      } else {
        const an = av ?? -Infinity;
        const bn = bv ?? -Infinity;
        diff = an - bn;
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return sorted;
  }, [data, search, onlyWithTickets, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * LIST_PAGE_SIZE, clampedPage * LIST_PAGE_SIZE);
  const categoriesWithTickets = data?.filter((row) => row.n_chamados > 0).length ?? 0;

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "categoria_pai" || key === "categoria_nome" ? "asc" : "desc");
    }
    setPage(1);
  }

  function applyUpdate(itilcategoriesId: number, override: number | null) {
    mutate(
      (prev) =>
        prev?.map((r) =>
          r.itilcategories_id === itilcategoriesId
            ? { ...r, override, dificuldade_atual: override ?? r.sugestao_automatica }
            : r,
        ),
      { revalidate: false },
    );
  }

  return (
    <section className="sumula-cartao admin-panel admin-category-panel">
      <div className="admin-panel-header admin-category-header">
        <div>
          <h2>Complexidade por categoria</h2>
          <p>
            Sugestão automática vem do tempo histórico de resolução de cada categoria. Defina manualmente pra
            sobrescrever com seu julgamento — a alteração é aplicada imediatamente em toda a análise.
          </p>
        </div>
        <div className="admin-category-summary">
          {data && (
            <span>
              <strong>{data.length}</strong> cadastradas · <strong>{categoriesWithTickets}</strong> com chamados
            </span>
          )}
          <Botao variant="secundario" onClick={() => void mutate()} disabled={isValidating}>
            {isValidating ? "Atualizando..." : "Atualizar"}
          </Botao>
        </div>
      </div>

      {error && <p className="admin-panel-result is-error">Não foi possível carregar as categorias: {(error as Error).message}</p>}

      <div className="admin-category-toolbar">
        <input
          type="text"
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar categoria..."
          className="admin-tech-input"
        />
        <label className="admin-category-filter">
          <input
            type="checkbox"
            checked={onlyWithTickets}
            onChange={(e) => {
              setOnlyWithTickets(e.target.checked);
              setPage(1);
            }}
          />
          Só com chamados
        </label>
      </div>

      {isLoading && !data && <p style={{ color: "var(--apagado)" }}>Carregando categorias...</p>}

      {data && (
        <>
          <div className="admin-category-table-wrap">
            <table className="admin-category-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}>
                      <span>
                        {col.label}
                        {sortKey === col.key && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </span>
                    </th>
                  ))}
                  <th>Override</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <CategoryRow key={row.itilcategories_id} row={row} onSaved={applyUpdate} />
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--apagado)", textAlign: "center", padding: "1rem" }}>
                      Nenhuma categoria encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span>
              {filtered.length} categoria{filtered.length === 1 ? "" : "s"} · página {clampedPage} de {totalPages}
            </span>
            <div>
              <Botao variant="secundario" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1}>
                Anterior
              </Botao>
              <Botao
                variant="secundario"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
              >
                Próxima
              </Botao>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function CategoryRow({
  row,
  onSaved,
}: {
  row: CategoryDifficulty;
  onSaved: (itilcategoriesId: number, override: number | null) => void;
}) {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const savedDraft = row.override != null ? String(row.override) : "";
  const [draft, setDraft] = useState(savedDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = draft !== savedDraft;

  function bump(delta: number) {
    const parsed = Number(draft.trim());
    const current = draft.trim() !== "" && Number.isFinite(parsed) ? parsed : row.sugestao_automatica;
    const next = Math.max(MIN_OVERRIDE, Math.round((current + delta) * 100) / 100);
    setDraft(next.toFixed(2));
    setError(null);
  }

  async function save() {
    if (!credentials) return;
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (Number.isNaN(parsed) || parsed <= 0)) {
      setError("Peso deve ser um número maior que zero (ou vazio pra usar a sugestão automática).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminApi.setCategoryDifficulty(row.itilcategories_id, parsed, credentials);
      onSaved(row.itilcategories_id, parsed);
      await mutateGlobal((key) => (
        Array.isArray(key) && (key[0] === "snapshots" || key[0] === "tech-profile")
      ));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td style={{ color: row.categoria_pai ? "var(--apagado)" : "var(--linha-forte)" }}>
        {row.categoria_pai || "—"}
      </td>
      <td>{row.categoria_nome}</td>
      <td>{row.n_chamados}</td>
      <td>{row.resolucao_media_h != null ? `${row.resolucao_media_h.toFixed(1)}h` : "—"}</td>
      <td>{row.dificuldade_atual.toFixed(2)}x</td>
      <td>
        <div className="admin-weight-field-control admin-category-override-control">
          <button
            type="button"
            onClick={() => bump(-OVERRIDE_STEP)}
            disabled={saving}
            aria-label={`Diminuir override de ${row.categoria_nome}`}
          >
            −
          </button>
          <input
            type="number"
            step={OVERRIDE_STEP}
            min={MIN_OVERRIDE}
            value={draft}
            placeholder={`${row.sugestao_automatica.toFixed(2)} (auto)`}
            onChange={(e) => setDraft(e.target.value)}
            className="admin-weight-input admin-category-override-input"
            aria-label={`Override de ${row.categoria_nome}`}
          />
          <button
            type="button"
            onClick={() => bump(OVERRIDE_STEP)}
            disabled={saving}
            aria-label={`Aumentar override de ${row.categoria_nome}`}
          >
            +
          </button>
        </div>
      </td>
      <td>
        <button type="button" className="admin-category-save-btn" onClick={save} disabled={!dirty || saving}>
          {saving ? "..." : "Salvar"}
        </button>
        {error && <p className="admin-panel-result is-error admin-category-row-error">{error}</p>}
      </td>
    </tr>
  );
}
