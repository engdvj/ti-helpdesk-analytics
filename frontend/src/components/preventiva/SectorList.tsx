"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { sectors as sectorsApi, type Sector } from "@/lib/api";

import { compareBy, ordenarUnidades, SortHeader, type SortDir } from "./SortHeader";

const PAGE_SIZE = 10;
type SortCol = "nome" | "unidade" | "computadores";
type Situacao = "todos" | "ativos" | "inativos";

export function SectorList() {
  const { data, error, isLoading } = useSWR("sectors", () => sectorsApi.list());

  const [busca, setBusca] = useState("");
  const [unidade, setUnidade] = useState("todas");
  const [situacao, setSituacao] = useState<Situacao>("todos");
  const [sortCol, setSortCol] = useState<SortCol>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const unidades = useMemo(
    () => Array.from(new Set((data ?? []).map((s) => s.unidade_slug))).sort(ordenarUnidades),
    [data],
  );

  const processados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const getSort = (s: Sector): string | number =>
      sortCol === "computadores" ? s.qtd_computadores : sortCol === "unidade" ? s.unidade_slug : s.nome;

    return (data ?? [])
      .filter((s) => {
        if (termo && !s.nome.toLowerCase().includes(termo) && !s.unidade_slug.toLowerCase().includes(termo)) return false;
        if (unidade !== "todas" && s.unidade_slug !== unidade) return false;
        if (situacao === "ativos" && !s.ativo) return false;
        if (situacao === "inativos" && s.ativo) return false;
        return true;
      })
      .sort((a, b) => compareBy(a, b, getSort, sortDir));
  }, [data, busca, unidade, situacao, sortCol, sortDir]);

  const total = processados.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageAtual = Math.min(page, totalPages);
  const visiveis = processados.slice((pageAtual - 1) * PAGE_SIZE, pageAtual * PAGE_SIZE);

  function ordenar(col: SortCol) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir(col === "computadores" ? "desc" : "asc"); }
    setPage(1);
  }

  if (isLoading) return <p style={{ color: "var(--apagado)" }}>Carregando setores...</p>;
  if (error) return <p style={{ color: "var(--critico)" }}>{(error as Error).message}</p>;
  if (!data || data.length === 0) {
    return (
      <p style={{ color: "var(--apagado)" }}>
        Nenhum setor sincronizado ainda — use &quot;Sincronizar setores&quot; no painel de admin.
      </p>
    );
  }

  return (
    <>
      <div className="preventiva-inline-form" style={{ marginBottom: "1rem" }}>
        <label>
          Buscar
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} placeholder="nome ou unidade" />
        </label>
        {unidades.length > 1 && (
          <label>
            Unidade
            <select value={unidade} onChange={(e) => { setUnidade(e.target.value); setPage(1); }}>
              <option value="todas">Todas</option>
              {unidades.map((u) => <option key={u} value={u}>{u.toUpperCase()}</option>)}
            </select>
          </label>
        )}
        <label>
          Situação
          <select value={situacao} onChange={(e) => { setSituacao(e.target.value as Situacao); setPage(1); }}>
            <option value="todos">Ativos e inativos</option>
            <option value="ativos">Só ativos</option>
            <option value="inativos">Só inativos</option>
          </select>
        </label>
      </div>

      {total === 0 ? (
        <p style={{ color: "var(--apagado)" }}>Nenhum setor corresponde aos filtros.</p>
      ) : (
        <>
          <div className="preventiva-table-wrap">
            <table className="preventiva-table is-fixed">
              <colgroup>
                <col style={{ width: "58%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "22%" }} />
              </colgroup>
              <thead>
                <tr>
                  <SortHeader col="nome" label="Setor" active={sortCol} dir={sortDir} onSort={ordenar} />
                  <SortHeader col="unidade" label="Unidade" active={sortCol} dir={sortDir} onSort={ordenar} />
                  <SortHeader col="computadores" label="Computadores" active={sortCol} dir={sortDir} onSort={ordenar} />
                </tr>
              </thead>
              <tbody>
                {visiveis.map((sector) => (
                  <tr key={sector.id_glpi} className={sector.ativo ? undefined : "is-inactive"}>
                    <td>
                      <Link href={`/preventiva/inventario/setor/${sector.id_glpi}`} className="preventiva-link">
                        {sector.nome}
                      </Link>
                      {!sector.ativo && <span className="preventiva-badge is-inactive">inativo</span>}
                    </td>
                    <td>{sector.unidade_slug.toUpperCase()}</td>
                    <td>{sector.qtd_computadores}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span>{total} setor{total === 1 ? "" : "es"} · página {pageAtual} de {totalPages}</span>
            <div>
              <Botao variant="secundario" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageAtual <= 1}>Anterior</Botao>
              <Botao variant="secundario" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageAtual >= totalPages}>Próxima</Botao>
            </div>
          </div>
        </>
      )}
    </>
  );
}
