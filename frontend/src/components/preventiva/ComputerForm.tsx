"use client";

import { useState } from "react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { computers as computersApi, sectors as sectorsApi } from "@/lib/api";

import { ordenarUnidades } from "./SortHeader";

export function ComputerForm({
  onCreated,
  lockedSetorId,
}: {
  onCreated: () => void;
  /** Quando definido, o PC é sempre cadastrado neste setor e o <select> some
   * (usado na página de um setor específico). */
  lockedSetorId?: number;
}) {
  const { data: sectors } = useSWR("sectors", () => sectorsApi.list());
  const [patrimonio, setPatrimonio] = useState("");
  const [hostname, setHostname] = useState("");
  const [setorId, setSetorId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ativos = (sectors ?? []).filter((s) => s.ativo);
  // escolhe a unidade primeiro e o <select> de setor mostra só os dessa unidade.
  const unidades = Array.from(new Set(ativos.map((s) => s.unidade_slug))).sort(ordenarUnidades);
  const [unidadeSel, setUnidadeSel] = useState<string | null>(null);
  const unidade = unidadeSel ?? unidades[0] ?? "";
  const setoresDaUnidade = ativos.filter((s) => s.unidade_slug === unidade);

  const setorEfetivo = lockedSetorId ?? (setorId === "" ? null : Number(setorId));

  async function submit() {
    if (setorEfetivo == null) return;
    setSaving(true);
    setError(null);
    try {
      await computersApi.create({
        patrimonio: patrimonio.trim() || null,
        hostname: hostname.trim() || null,
        setor_atual_id: setorEfetivo,
      });
      setPatrimonio("");
      setHostname("");
      setSetorId("");
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="preventiva-inline-form"
      style={{ marginBottom: "1.25rem" }}
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
    >
      <label>
        Patrimônio
        <input value={patrimonio} onChange={(e) => setPatrimonio(e.target.value)} placeholder="opcional (etiqueta do hospital)" />
      </label>
      <label>
        Hostname
        <input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="opcional" />
      </label>
      {lockedSetorId == null && unidades.length > 1 && (
        <label>
          Unidade
          <select value={unidade} onChange={(e) => { setUnidadeSel(e.target.value); setSetorId(""); }}>
            {unidades.map((u) => <option key={u} value={u}>{u.toUpperCase()}</option>)}
          </select>
        </label>
      )}
      {lockedSetorId == null && (
        <label>
          Setor
          <select value={setorId} onChange={(e) => setSetorId(e.target.value ? Number(e.target.value) : "")} required>
            <option value="">Selecione...</option>
            {setoresDaUnidade.map((s) => (
              <option key={s.id_glpi} value={s.id_glpi}>{s.nome}</option>
            ))}
          </select>
        </label>
      )}
      <Botao type="submit" variant="primario" disabled={saving || setorEfetivo == null}>
        {saving ? "Cadastrando..." : "Cadastrar computador"}
      </Botao>
      {error && <p className="admin-panel-result is-error">{error}</p>}
    </form>
  );
}
