"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import {
  computers as computersApi,
  cycles as cyclesApi,
  sectors as sectorsApi,
  technicians as techniciansApi,
  type Computer,
  type CyclePriority,
} from "@/lib/api";

/** C1 - "Adicionar computador ao ciclo", em lote por setor: escolhe um ou
 * mais setores, depois marca quais dos PCs disponíveis (ativos, não estão
 * em outro ciclo aberto) entram, com um técnico opcional já pré-atribuído
 * por PC. Um POST /items por computador marcado (id distinto por chamada,
 * sem corrida entre elas). */
export function AddItemsSection({
  cycleId,
  jaNoCiclo,
  onAdded,
}: {
  cycleId: number;
  jaNoCiclo: Set<number>;
  onAdded: () => void;
}) {
  const { data: sectors } = useSWR("sectors", () => sectorsApi.list());
  // só PCs ativos podem entrar num ciclo (backend rejeita baixados com 422).
  const { data: computerPage } = useSWR(["computers-all", "ativos"], () => computersApi.list({ pageSize: 200 }));
  const { data: techs } = useSWR("technicians", () => techniciansApi.list());

  const [buscaSetor, setBuscaSetor] = useState("");
  const [setoresSelecionados, setSetoresSelecionados] = useState<Set<number>>(new Set());
  const [computadoresSelecionados, setComputadoresSelecionados] = useState<Set<number>>(new Set());
  const [tecnicoPorComputador, setTecnicoPorComputador] = useState<Record<number, number | "">>({});
  const [prioridade, setPrioridade] = useState<CyclePriority>("normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // só PC com setor atribuído entra por aqui - o fluxo é "escolhe o setor,
  // depois os PCs dele". PC importado do GLPI ainda sem setor precisa ser
  // atribuído no Inventário antes de poder entrar num ciclo por este caminho.
  const disponiveis = useMemo(
    () => (computerPage?.items ?? []).filter(
      (c): c is Computer & { setor_atual_id: number } => !jaNoCiclo.has(c.id) && c.setor_atual_id != null,
    ),
    [computerPage, jaNoCiclo],
  );

  // só setores que têm pelo menos 1 PC disponível pra entrar no ciclo -
  // listar os outros 100 setores vazios aqui só atrapalharia.
  const setoresComDisponivel = useMemo(() => {
    const contagem = new Map<number, number>();
    for (const c of disponiveis) contagem.set(c.setor_atual_id, (contagem.get(c.setor_atual_id) ?? 0) + 1);
    const termo = buscaSetor.trim().toLowerCase();
    return (sectors ?? [])
      .filter((s) => contagem.has(s.id_glpi))
      .filter((s) => !termo || s.nome.toLowerCase().includes(termo))
      .map((s) => ({ ...s, disponiveis: contagem.get(s.id_glpi) ?? 0 }));
  }, [sectors, disponiveis, buscaSetor]);

  const computadoresVisiveis = useMemo(
    () => disponiveis.filter((c) => setoresSelecionados.has(c.setor_atual_id)),
    [disponiveis, setoresSelecionados],
  );

  const sectorNome = (id: number) => sectors?.find((s) => s.id_glpi === id)?.nome ?? `#${id}`;
  const todosMarcados = computadoresVisiveis.length > 0 && computadoresVisiveis.every((c) => computadoresSelecionados.has(c.id));

  function alternarSetor(id: number) {
    setSetoresSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  function alternarComputador(id: number) {
    setComputadoresSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setComputadoresSelecionados((atual) => {
      if (todosMarcados) {
        const novo = new Set(atual);
        for (const c of computadoresVisiveis) novo.delete(c.id);
        return novo;
      }
      return new Set([...atual, ...computadoresVisiveis.map((c) => c.id)]);
    });
  }

  async function adicionar() {
    if (computadoresSelecionados.size === 0) return;
    setSaving(true);
    setError(null);
    const alvo = [...computadoresSelecionados];
    const resultados = await Promise.allSettled(
      alvo.map((id) => cyclesApi.addItem(cycleId, id, prioridade, tecnicoPorComputador[id] || undefined)),
    );
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (falhas.length > 0) {
      setError(`${falhas.length} de ${alvo.length} não foram adicionados: ${(falhas[0].reason as Error).message}`);
    }
    setComputadoresSelecionados(new Set());
    setTecnicoPorComputador({});
    setSaving(false);
    onAdded();
  }

  if (computerPage && disponiveis.length === 0) {
    return (
      <section className="sumula-cartao admin-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-panel-header"><h2>Adicionar computadores ao ciclo</h2></div>
        <p style={{ color: "var(--apagado)" }}>
          Todos os computadores cadastrados já estão neste ciclo. Cadastre mais em{" "}
          <Link href="/preventiva/inventario" style={{ color: "var(--acento)" }}>Inventário</Link>.
        </p>
      </section>
    );
  }

  return (
    <section className="sumula-cartao admin-panel" style={{ marginBottom: "1.5rem" }}>
      <div className="admin-panel-header">
        <h2>Adicionar computadores ao ciclo</h2>
        <p>Escolha um ou mais setores, depois marque quais computadores disponíveis entram no ciclo.</p>
      </div>

      <div className="preventiva-inline-form" style={{ marginBottom: "0.85rem" }}>
        <label>
          Buscar setor
          <input value={buscaSetor} onChange={(e) => setBuscaSetor(e.target.value)} placeholder="nome do setor" />
        </label>
      </div>

      <div className="preventiva-sector-picker">
        {setoresComDisponivel.length === 0 ? (
          <p style={{ color: "var(--apagado)", padding: "0.5rem" }}>Nenhum setor com computador disponível.</p>
        ) : (
          setoresComDisponivel.map((s) => (
            <label key={s.id_glpi} className="preventiva-sector-picker-item">
              <input type="checkbox" checked={setoresSelecionados.has(s.id_glpi)} onChange={() => alternarSetor(s.id_glpi)} />
              <span>{s.nome}</span>
              <span className="preventiva-sector-picker-count">{s.disponiveis}</span>
            </label>
          ))
        )}
      </div>

      {computadoresVisiveis.length > 0 && (
        <>
          <div className="preventiva-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="preventiva-table">
              <thead>
                <tr>
                  <th style={{ width: "2.2rem" }}>
                    <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Selecionar todos" />
                  </th>
                  <th>Patrimônio</th>
                  <th>Setor</th>
                  <th>Técnico (opcional)</th>
                </tr>
              </thead>
              <tbody>
                {computadoresVisiveis.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" checked={computadoresSelecionados.has(c.id)} onChange={() => alternarComputador(c.id)} /></td>
                    <td>{c.patrimonio}{c.hostname ? ` (${c.hostname})` : ""}</td>
                    <td>{sectorNome(c.setor_atual_id)}</td>
                    <td>
                      <select
                        value={tecnicoPorComputador[c.id] ?? ""}
                        disabled={!computadoresSelecionados.has(c.id)}
                        onChange={(e) => setTecnicoPorComputador((atual) => ({ ...atual, [c.id]: e.target.value ? Number(e.target.value) : "" }))}
                      >
                        <option value="">Sem técnico ainda</option>
                        {(techs ?? []).map((t) => (
                          <option key={t.users_id} value={t.users_id}>{t.nome_exibicao || t.nome_completo}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="preventiva-inline-form" style={{ marginTop: "0.85rem" }}>
            <label>
              Prioridade (aplicada a todos os marcados)
              <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as CyclePriority)}>
                <option value="alta">Alta</option>
                <option value="normal">Normal</option>
                <option value="baixa">Baixa</option>
              </select>
            </label>
            <Botao variant="primario" onClick={adicionar} disabled={computadoresSelecionados.size === 0 || saving}>
              {saving ? "Adicionando..." : `Adicionar ${computadoresSelecionados.size || ""} computador${computadoresSelecionados.size === 1 ? "" : "es"}`}
            </Botao>
          </div>
          {error && <p className="admin-panel-result is-error">{error}</p>}
        </>
      )}
    </section>
  );
}
