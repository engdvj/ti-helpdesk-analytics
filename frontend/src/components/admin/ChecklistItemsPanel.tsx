"use client";

import { useState } from "react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { Tabs } from "@/components/ui/Tabs";
import { checklistItems as checklistItemsApi, type ChecklistItemDef, type ChecklistTipo } from "@/lib/api";
import { agruparPorSecao } from "@/lib/preventiva-checklists";

const TIPO_TABS: { key: ChecklistTipo; label: string }[] = [
  { key: "planejamento", label: "Planejamento (Checklist 1)" },
  { key: "reconfirmacao", label: "Reconfirmação (Checklist 2)" },
  { key: "execucao", label: "Execução (Checklist 3)" },
];

/** Catálogo editável dos itens de verificação (docs/requisitos.md Épico C) -
 * o texto congela como snapshot em cada ciclo/item que já usou o checklist,
 * então editar ou apagar aqui nunca reescreve histórico. `secao` agrupa os
 * itens visualmente nos formulários de reconfirmação/execução - puramente
 * organizacional, não afeta a validação. */
export function ChecklistItemsPanel() {
  const [tipo, setTipo] = useState<ChecklistTipo>("execucao");
  const { data, mutate } = useSWR(["checklist-items-admin", tipo], () => checklistItemsApi.list(tipo));
  const [novoTexto, setNovoTexto] = useState("");
  const [novaSecao, setNovaSecao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itens = [...(data ?? [])].sort((a, b) => a.ordem - b.ordem);
  const grupos = agruparPorSecao(itens);

  async function adicionar() {
    if (!novoTexto.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const proximaOrdem = itens.length > 0 ? Math.max(...itens.map((i) => i.ordem)) + 1 : 0;
      await checklistItemsApi.create(tipo, novoTexto.trim(), proximaOrdem, novaSecao.trim() || null);
      setNovoTexto("");
      setNovaSecao("");
      await mutate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function mover(item: ChecklistItemDef, direcao: -1 | 1) {
    const indice = itens.findIndex((i) => i.id === item.id);
    const vizinho = itens[indice + direcao];
    if (!vizinho) return;
    await Promise.all([
      checklistItemsApi.update(item.id, { ordem: vizinho.ordem }),
      checklistItemsApi.update(vizinho.id, { ordem: item.ordem }),
    ]);
    await mutate();
  }

  return (
    <section className="sumula-cartao admin-panel">
      <div className="admin-panel-header">
        <h2>Checklists</h2>
        <p>Itens de verificação dos 3 checklists do processo de manutenção preventiva. A seção é só
          organização visual — agrupa as perguntas no formulário do técnico.</p>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <Tabs tabs={TIPO_TABS} active={tipo} onChange={(key) => setTipo(key as ChecklistTipo)} />
      </div>

      {!data && <p style={{ color: "var(--apagado)" }}>Carregando itens...</p>}

      {data && itens.length === 0 && <p style={{ color: "var(--apagado)" }}>Nenhum item cadastrado ainda.</p>}

      {data && itens.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {grupos.map((grupo, indiceGrupo) => (
            <div key={indiceGrupo}>
              <p className="preventiva-admin-checklist-secao">{grupo.secao ?? "Sem seção"}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {grupo.itens.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    isFirst={itens[0]?.id === item.id}
                    isLast={itens.at(-1)?.id === item.id}
                    onMoveUp={() => mover(item, -1)}
                    onMoveDown={() => mover(item, 1)}
                    onChanged={() => mutate()}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="preventiva-inline-form" style={{ marginTop: "1.25rem" }}>
        <label style={{ flex: 2, minWidth: 260 }}>
          Novo item
          <input value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} placeholder="Texto do item de verificação" />
        </label>
        <label style={{ flex: 1, minWidth: 160 }}>
          Seção (opcional)
          <input value={novaSecao} onChange={(e) => setNovaSecao(e.target.value)} placeholder="ex.: Inspeção física" />
        </label>
        <Botao variant="primario" onClick={adicionar} disabled={!novoTexto.trim() || saving}>
          {saving ? "Adicionando..." : "Adicionar item"}
        </Botao>
      </div>
      {error && <p className="admin-panel-result is-error">{error}</p>}
    </section>
  );
}

function ChecklistItemRow({
  item,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onChanged,
}: {
  item: ChecklistItemDef;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChanged: () => void;
}) {
  const [texto, setTexto] = useState(item.texto);
  const [secao, setSecao] = useState(item.secao ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = texto !== item.texto || secao !== (item.secao ?? "");

  async function salvar() {
    if (!dirty || !texto.trim()) return;
    setSaving(true);
    try {
      await checklistItemsApi.update(item.id, { texto: texto.trim(), secao: secao.trim() || null });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo() {
    await checklistItemsApi.update(item.id, { ativo: !item.ativo });
    onChanged();
  }

  async function remover() {
    if (!confirm(`Remover "${item.texto}" do catálogo?`)) return;
    await checklistItemsApi.remove(item.id);
    onChanged();
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", opacity: item.ativo ? 1 : 0.5 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <button type="button" onClick={onMoveUp} disabled={isFirst} aria-label="Mover para cima" style={{ background: "none", border: "none", cursor: isFirst ? "default" : "pointer", color: "var(--apagado)" }}>▲</button>
        <button type="button" onClick={onMoveDown} disabled={isLast} aria-label="Mover para baixo" style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", color: "var(--apagado)" }}>▼</button>
      </div>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        style={{ flex: 2, padding: "0.4rem 0.55rem", border: "1px solid var(--linha)", background: "var(--superficie)", color: "var(--tinta)" }}
      />
      <input
        value={secao}
        onChange={(e) => setSecao(e.target.value)}
        placeholder="Seção"
        style={{ flex: 1, padding: "0.4rem 0.55rem", border: "1px solid var(--linha)", background: "var(--superficie)", color: "var(--tinta)" }}
      />
      {dirty && (
        <Botao variant="primario" onClick={salvar} disabled={saving}>Salvar</Botao>
      )}
      <Botao onClick={toggleAtivo}>{item.ativo ? "Desativar" : "Ativar"}</Botao>
      <Botao variant="destrutivo" onClick={remover}>Remover</Botao>
    </div>
  );
}
