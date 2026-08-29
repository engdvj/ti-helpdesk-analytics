"use client";

import { useState } from "react";

import { Botao } from "@/components/ui/Botao";
import { Modal } from "@/components/ui/Modal";
import { cycles as cyclesApi } from "@/lib/api";

export function RescheduleModal({
  cycleId,
  itemId,
  onClose,
  onDone,
}: {
  cycleId: number;
  itemId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!motivo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await cyclesApi.reschedule(cycleId, itemId, motivo.trim(), novaData || null);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Remarcar item" onClose={onClose} maxWidth={480}>
      <div className="preventiva-form">
        <label>
          Motivo <span style={{ color: "var(--critico)" }}>*</span>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} required />
        </label>
        <label>
          Nova data (opcional — deixe em branco se ainda não definida)
          <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
        </label>
        {error && <p className="admin-panel-result is-error">{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Botao variant="primario" onClick={submit} disabled={!motivo.trim() || saving}>
            {saving ? "Salvando..." : "Remarcar"}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
