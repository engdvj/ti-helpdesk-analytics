"use client";

import { useState } from "react";

import { Botao } from "@/components/ui/Botao";
import { Modal } from "@/components/ui/Modal";
import { computers as computersApi, type Computer, type Sector } from "@/lib/api";

import { ordenarUnidades } from "./SortHeader";

export function EditComputerModal({
  computer,
  sectors,
  onClose,
  onDone,
}: {
  computer: Computer;
  sectors: Sector[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [patrimonio, setPatrimonio] = useState(computer.patrimonio ?? "");
  const [hostname, setHostname] = useState(computer.hostname ?? "");
  const [setorId, setSetorId] = useState<number | "">(computer.setor_atual_id ?? "");
  const [ativo, setAtivo] = useState(computer.ativo);
  const [saving, setSaving] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // escolhe a unidade primeiro (HGVC/UPA) e o <select> de setor mostra só os
  // dessa unidade - senão são 100+ setores numa lista só.
  const unidades = Array.from(new Set(sectors.map((s) => s.unidade_slug))).sort(ordenarUnidades);
  const unidadeDoSetorAtual = sectors.find((s) => s.id_glpi === computer.setor_atual_id)?.unidade_slug ?? null;
  const [unidadeSel, setUnidadeSel] = useState<string | null>(unidadeDoSetorAtual);
  const unidade = unidadeSel ?? unidadeDoSetorAtual ?? unidades[0] ?? "";

  // setores ativos da unidade escolhida + o setor atual (mesmo inativo / de
  // outra unidade, enquanto for o setor deste PC).
  const opcoesSetor = sectors.filter(
    (s) => s.id_glpi === computer.setor_atual_id || (s.ativo && s.unidade_slug === unidade),
  );

  function trocarUnidade(nova: string) {
    setUnidadeSel(nova);
    const atual = sectors.find((s) => s.id_glpi === setorId);
    if (atual && atual.unidade_slug !== nova) setSetorId("");
  }

  const patrimonioLimpo = patrimonio.trim();
  const hostnameLimpo = hostname.trim();
  const semMudanca =
    (patrimonioLimpo || null) === computer.patrimonio &&
    hostnameLimpo === (computer.hostname ?? "") &&
    (setorId === "" ? null : setorId) === computer.setor_atual_id &&
    ativo === computer.ativo;

  async function excluir() {
    const nome = computer.patrimonio ?? computer.hostname ?? `#${computer.id}`;
    if (!window.confirm(`Excluir o computador ${nome} permanentemente? Isso não pode ser desfeito.`)) return;
    setExcluindo(true);
    setError(null);
    try {
      await computersApi.remove(computer.id);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExcluindo(false);
    }
  }

  async function submit() {
    if (semMudanca) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Parameters<typeof computersApi.update>[1] = {};
      if ((patrimonioLimpo || null) !== computer.patrimonio) payload.patrimonio = patrimonioLimpo || null;
      if (hostnameLimpo !== (computer.hostname ?? "")) payload.hostname = hostnameLimpo || null;
      const novoSetor = setorId === "" ? null : setorId;
      if (novoSetor !== computer.setor_atual_id) payload.setor_atual_id = novoSetor;
      if (ativo !== computer.ativo) payload.ativo = ativo;
      await computersApi.update(computer.id, payload);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar computador" onClose={onClose} maxWidth={480}>
      <div className="preventiva-form">
        <label>
          Patrimônio
          <input value={patrimonio} onChange={(e) => setPatrimonio(e.target.value)} placeholder="opcional (etiqueta do hospital)" />
        </label>
        <label>
          Hostname
          <input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="opcional" />
        </label>
        {unidades.length > 1 && (
          <label>
            Unidade
            <select value={unidade} onChange={(e) => trocarUnidade(e.target.value)}>
              {unidades.map((u) => (
                <option key={u} value={u}>{u.toUpperCase()}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Setor
          <select value={setorId} onChange={(e) => setSetorId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Sem setor atribuído</option>
            {opcoesSetor.map((s) => (
              <option key={s.id_glpi} value={s.id_glpi}>
                {s.nome}{s.unidade_slug !== unidade ? ` (${s.unidade_slug.toUpperCase()})` : ""}{!s.ativo ? " — inativo" : ""}
              </option>
            ))}
          </select>
        </label>

        <div style={{ borderTop: "1px solid var(--linha)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div>
            <Botao variant="secundario" onClick={() => setAtivo((a) => !a)}>
              {ativo ? "Desativar computador" : "Reativar computador"}
            </Botao>
            <p style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)", marginTop: "0.4rem" }}>
              {ativo
                ? "Baixa: some das listas por padrão, mas o histórico de preventiva é preservado. Confirme em Salvar."
                : "Reativar traz o PC de volta às listas. Confirme em Salvar."}
            </p>
          </div>
          <div>
            <button type="button" className="preventiva-linkish is-danger" onClick={excluir} disabled={excluindo}>
              {excluindo ? "Excluindo..." : "Excluir permanentemente"}
            </button>
            <p style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)", marginTop: "0.3rem" }}>
              Apaga o PC da plataforma de vez. Bloqueado se ele estiver em algum ciclo — aí use a baixa.
            </p>
          </div>
        </div>

        {error && <p className="admin-panel-result is-error">{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Botao variant="primario" onClick={submit} disabled={saving || semMudanca}>
            {saving ? "Salvando..." : "Salvar"}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
