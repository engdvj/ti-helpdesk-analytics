"use client";

import { useEffect, useState } from "react";
import { SquarePen } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { computers as computersApi, sectors as sectorsApi, type Computer, type ComputerSort } from "@/lib/api";

import { ComputerDetailModal } from "./ComputerDetailModal";
import { EditComputerModal } from "./EditComputerModal";
import { SortHeader, type SortDir } from "./SortHeader";

export function ComputerList({
  refreshKey = 0,
  setorId: lockedSetorId,
  onChanged,
  podeEditar = false,
}: {
  refreshKey?: number;
  /** Quando definido, a lista fica travada nesse setor e o filtro/coluna de
   * setor somem (usado na página de um setor específico). */
  setorId?: number;
  /** Chamado depois de editar/transferir/baixar um PC — o pai revalida o que
   * depende disso (contagem no cabeçalho do setor). */
  onChanged?: () => void;
  /** Sem isto (default): lista só-leitura — some a coluna Ações e o modal de
   * edição. Só o admin recebe `true` (inventário é só do admin). */
  podeEditar?: boolean;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const [page, setPage] = useState(1);
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState<number | "">("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [sortCol, setSortCol] = useState<ComputerSort>("patrimonio");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editando, setEditando] = useState<Computer | null>(null);
  const [detalhe, setDetalhe] = useState<number | null>(null);

  const setorAtualId = lockedSetorId ?? (setorFiltro === "" ? undefined : setorFiltro);
  const showSetor = lockedSetorId == null;

  // debounce da busca por patrimônio (evita um fetch por tecla)
  useEffect(() => {
    const t = setTimeout(() => { setBusca(buscaInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [buscaInput]);

  const { data: sectors } = useSWR("sectors", () => sectorsApi.list());
  const { data, error, isLoading, mutate } = useSWR(
    ["computers", page, refreshKey, busca, setorAtualId ?? "", mostrarInativos, sortCol, sortDir],
    () => computersApi.list({
      page,
      pageSize: 10,
      patrimonio: busca || undefined,
      setorAtualId,
      incluirInativos: mostrarInativos || undefined,
      sort: sortCol,
      sortDir,
    }),
  );

  const sectorName = (id: number | null) =>
    id == null ? "—" : (sectors?.find((s) => s.id_glpi === id)?.nome ?? `#${id}`);
  const ativos = (sectors ?? []).filter((s) => s.ativo);
  const temFiltro = busca !== "" || setorFiltro !== "" || mostrarInativos;

  function ordenar(col: ComputerSort) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  }

  return (
    <div>
      <div className="preventiva-inline-form" style={{ marginBottom: "1rem" }}>
        <label>
          Buscar patrimônio
          <input value={buscaInput} onChange={(e) => setBuscaInput(e.target.value)} placeholder="ex.: HGVC-001" />
        </label>
        {showSetor && (
          <label>
            Setor
            <select value={setorFiltro} onChange={(e) => { setSetorFiltro(e.target.value ? Number(e.target.value) : ""); setPage(1); }}>
              <option value="">Todos</option>
              {ativos.map((s) => <option key={s.id_glpi} value={s.id_glpi}>{s.nome}</option>)}
            </select>
          </label>
        )}
        <label className="preventiva-checkbox-label">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => { setMostrarInativos(e.target.checked); setPage(1); }}
          />
          Mostrar desativados
        </label>
      </div>

      {isLoading && !data ? (
        <p style={{ color: "var(--apagado)" }}>Carregando computadores...</p>
      ) : error ? (
        <p style={{ color: "var(--critico)" }}>{(error as Error).message}</p>
      ) : !data || data.items.length === 0 ? (
        <p style={{ color: "var(--apagado)" }}>
          {temFiltro ? "Nenhum computador corresponde aos filtros." : "Nenhum computador cadastrado ainda."}
        </p>
      ) : (
        <div className="preventiva-table-wrap">
          <table className="preventiva-table is-fixed">
            <colgroup>
              <col style={{ width: showSetor ? "17%" : "23%" }} />
              <col style={{ width: showSetor ? "14%" : "19%" }} />
              {showSetor && <col style={{ width: "19%" }} />}
              <col style={{ width: showSetor ? "17%" : "21%" }} />
              <col style={{ width: showSetor ? "13%" : "16%" }} />
              {podeEditar && <col style={{ width: showSetor ? "14%" : "16%" }} />}
            </colgroup>
            <thead>
              <tr>
                <SortHeader col="patrimonio" label="Patrimônio" active={sortCol} dir={sortDir} onSort={ordenar} />
                <SortHeader col="hostname" label="Hostname" active={sortCol} dir={sortDir} onSort={ordenar} />
                {showSetor && <SortHeader col="setor" label="Setor" active={sortCol} dir={sortDir} onSort={ordenar} />}
                <th>Próxima manutenção</th>
                <th className="preventiva-cell-center">Saúde</th>
                {podeEditar && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((computer) => (
                <tr
                  key={computer.id}
                  className={`is-clickable${computer.ativo ? "" : " is-inactive"}`}
                  onClick={() => setDetalhe(computer.id)}
                  title="Ver detalhes"
                >
                  <td style={{ whiteSpace: "nowrap" }}>
                    {computer.patrimonio ?? <span style={{ color: "var(--apagado)" }}>sem patrimônio</span>}
                    {!computer.ativo && <span className="preventiva-badge is-inactive">baixado</span>}
                  </td>
                  <td>{computer.hostname ?? "—"}</td>
                  {showSetor && <td>{sectorName(computer.setor_atual_id)}</td>}
                  <td style={{ whiteSpace: "nowrap" }}>{computer.proxima_preventiva ?? "—"}</td>
                  <td className="preventiva-cell-center">
                    {computer.hardware_score == null ? (
                      <span style={{ color: "var(--apagado)" }}>—</span>
                    ) : (
                      <span
                        className={`preventiva-badge is-nivel-${computer.hardware_nivel}`}
                        title={computer.hardware_detalhes?.join(" · ")}
                      >
                        {computer.hardware_score}
                      </span>
                    )}
                  </td>
                  {podeEditar && (
                    <td>
                      <button
                        type="button"
                        className="preventiva-icon-btn"
                        onClick={(e) => { e.stopPropagation(); setEditando(computer); }}
                        title="Editar computador"
                        aria-label="Editar computador"
                      >
                        <SquarePen size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="admin-pagination">
          <span>{data.total} computador{data.total === 1 ? "" : "es"} · página {data.page} de {data.total_pages}</span>
          <div>
            <Botao variant="secundario" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page <= 1}>Anterior</Botao>
            <Botao variant="secundario" onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))} disabled={data.page >= data.total_pages}>Próxima</Botao>
          </div>
        </div>
      )}

      {detalhe != null && (
        <ComputerDetailModal
          computerId={detalhe}
          podeEditar={podeEditar}
          onClose={() => setDetalhe(null)}
          onEditar={
            podeEditar
              ? () => {
                  const alvo = data?.items.find((c) => c.id === detalhe) ?? null;
                  setDetalhe(null);
                  setEditando(alvo);
                }
              : undefined
          }
        />
      )}

      {editando && podeEditar && (
        <EditComputerModal
          computer={editando}
          sectors={sectors ?? []}
          onClose={() => setEditando(null)}
          onDone={() => {
            setEditando(null);
            void mutate();
            void globalMutate("sectors");
            void globalMutate((key) => Array.isArray(key) && key[0] === "computer");
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
