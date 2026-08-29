"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { cycles as cyclesApi, technicians as techniciansApi, type CycleStatus } from "@/lib/api";

const STATUS_LABEL: Record<CycleStatus, string> = {
  planejamento: "Em planejamento",
  encerrado: "Encerrado",
};

export function CycleList() {
  const router = useRouter();
  const { isAdmin } = useAdmin();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CycleStatus | "todos">("planejamento");
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const { data: techs } = useSWR("technicians", () => techniciansApi.list({ includeInactive: true }));
  const { data, error, isLoading, mutate } = useSWR(
    ["cycles", page, status],
    () => cyclesApi.list({ page, pageSize: 10, status: status === "todos" ? undefined : status }),
  );

  const responsavelNome = (id: number) => techs?.find((t) => t.users_id === id)?.nome_completo ?? `#${id}`;

  async function excluir(id: number, nome: string) {
    if (!window.confirm(`Excluir o ciclo "${nome}" e todos os itens dele? Essa ação não tem volta.`)) return;
    setExcluindo(id);
    try {
      await cyclesApi.remove(id);
      await mutate();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <div>
      <div className="preventiva-inline-form" style={{ marginBottom: "1rem" }}>
        <label>
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as CycleStatus | "todos"); setPage(1); }}>
            <option value="planejamento">Em planejamento</option>
            <option value="encerrado">Encerrados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>

      {isLoading && !data && <p style={{ color: "var(--apagado)" }}>Carregando ciclos...</p>}
      {error && <p style={{ color: "var(--critico)" }}>{(error as Error).message}</p>}
      {data && data.items.length === 0 && <p style={{ color: "var(--apagado)" }}>Nenhum ciclo encontrado.</p>}

      {data && data.items.length > 0 && (
        <>
          <div className="preventiva-table-wrap">
            <table className="preventiva-table is-fixed">
              <colgroup>
                <col style={{ width: "31%" }} />
                <col style={{ width: "23%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "6%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Ciclo</th>
                  <th>Responsável</th>
                  <th className="preventiva-cell-center">Status</th>
                  <th>Início</th>
                  <th>Final previsto</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((cycle) => (
                  <tr
                    key={cycle.id}
                    className="is-clickable"
                    onClick={() => router.push(`/preventiva/${cycle.id}`)}
                  >
                    <td>
                      <Link href={`/preventiva/${cycle.id}`} className="preventiva-row-link" onClick={(e) => e.stopPropagation()}>
                        {cycle.nome}
                      </Link>
                    </td>
                    <td>{responsavelNome(cycle.responsavel_id)}</td>
                    <td className="preventiva-cell-center">
                      <span className={`preventiva-badge is-cycle-${cycle.status}`}>{STATUS_LABEL[cycle.status]}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{cycle.data_inicio ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{cycle.data_prevista_encerramento ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {isAdmin && (
                        <button
                          type="button"
                          className="preventiva-icon-btn is-danger"
                          onClick={(e) => { e.stopPropagation(); void excluir(cycle.id, cycle.nome); }}
                          disabled={excluindo === cycle.id}
                          title="Excluir ciclo"
                          aria-label={`Excluir ciclo ${cycle.nome}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span>{data.total} ciclo{data.total === 1 ? "" : "s"} · página {data.page} de {data.total_pages}</span>
            <div>
              <Botao variant="secundario" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page <= 1}>Anterior</Botao>
              <Botao variant="secundario" onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))} disabled={data.page >= data.total_pages}>Próxima</Botao>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
