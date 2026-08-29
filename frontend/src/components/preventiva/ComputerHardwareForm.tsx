"use client";

import { useState } from "react";

import { Botao } from "@/components/ui/Botao";
import { computers as computersApi, type ComputerDetail, type ComputerHardware } from "@/lib/api";

const mbToGb = (mb: number | null) => (mb == null ? "" : String(Math.round((mb / 1024) * 10) / 10));
const gbToMb = (gb: string) => {
  const n = Number(gb.replace(",", "."));
  return gb.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 1024);
};
const clean = (s: string) => s.trim() || null;

export function ComputerHardwareForm({
  computerId,
  initial,
  onSaved,
  onCancel,
}: {
  computerId: number;
  initial: ComputerHardware | null;
  onSaved: (detalhe: ComputerDetail) => void;
  onCancel: () => void;
}) {
  const [ram, setRam] = useState(mbToGb(initial?.ram_mb ?? null));
  const [discoTipo, setDiscoTipo] = useState(initial?.disco_tipo ?? "");
  const [discoTotal, setDiscoTotal] = useState(mbToGb(initial?.disco_total_mb ?? null));
  const [discoLivre, setDiscoLivre] = useState(mbToGb(initial?.disco_livre_mb ?? null));
  const [so, setSo] = useState(initial?.so_nome ?? "");
  const [soData, setSoData] = useState(initial?.so_instalado_em ?? "");
  const [cpu, setCpu] = useState(initial?.cpu_designacao ?? "");
  const [gpu, setGpu] = useState(initial?.gpu_designacao ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar() {
    setSaving(true);
    setError(null);
    try {
      const detalhe = await computersApi.saveHardware(computerId, {
        ram_mb: gbToMb(ram),
        disco_tipo: clean(discoTipo),
        disco_total_mb: gbToMb(discoTotal),
        disco_livre_mb: gbToMb(discoLivre),
        so_nome: clean(so),
        so_instalado_em: soData || null,
        cpu_designacao: clean(cpu),
        gpu_designacao: clean(gpu),
        gpu_memoria_mb: initial?.gpu_memoria_mb ?? null,
      });
      onSaved(detalhe);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="preventiva-form">
      <p style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)", margin: 0 }}>
        Preencha o que souber — o score usa o que tiver e trata o resto como desconhecido.
      </p>
      <label>
        CPU
        <input value={cpu} onChange={(e) => setCpu(e.target.value)} placeholder="ex.: Intel Core i5-8400" />
      </label>
      <label>
        Memória (GB)
        <input value={ram} onChange={(e) => setRam(e.target.value)} inputMode="decimal" placeholder="ex.: 8" />
      </label>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 7rem" }}>
          Disco — tipo
          <select value={discoTipo} onChange={(e) => setDiscoTipo(e.target.value)}>
            <option value="">—</option>
            <option value="SSD">SSD</option>
            <option value="HDD">HDD</option>
          </select>
        </label>
        <label style={{ flex: "1 1 7rem" }}>
          Total (GB)
          <input value={discoTotal} onChange={(e) => setDiscoTotal(e.target.value)} inputMode="decimal" placeholder="ex.: 240" />
        </label>
        <label style={{ flex: "1 1 7rem" }}>
          Livre (GB)
          <input value={discoLivre} onChange={(e) => setDiscoLivre(e.target.value)} inputMode="decimal" placeholder="ex.: 90" />
        </label>
      </div>
      <label>
        Sistema operacional
        <input value={so} onChange={(e) => setSo(e.target.value)} placeholder="ex.: Windows 10 Pro" />
      </label>
      <label>
        Sistema instalado em
        <input type="date" value={soData} onChange={(e) => setSoData(e.target.value)} />
      </label>
      <label>
        Vídeo
        <input value={gpu} onChange={(e) => setGpu(e.target.value)} placeholder="ex.: Intel UHD Graphics" />
      </label>

      {error && <p className="admin-panel-result is-error">{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
        <Botao variant="secundario" onClick={onCancel}>Cancelar</Botao>
        <Botao variant="primario" onClick={salvar} disabled={saving}>
          {saving ? "Salvando..." : "Salvar hardware"}
        </Botao>
      </div>
    </div>
  );
}
