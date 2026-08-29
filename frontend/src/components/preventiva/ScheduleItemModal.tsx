"use client";

import { useState } from "react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { Modal } from "@/components/ui/Modal";
import { cycles as cyclesApi, technicians as techniciansApi } from "@/lib/api";

export function ScheduleItemModal({
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
  const { data: techs } = useSWR("technicians", () => techniciansApi.list());
  const [data, setData] = useState("");
  const [tecnicoId, setTecnicoId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!data || tecnicoId === "") return;
    setSaving(true);
    setError(null);
    try {
      await cyclesApi.schedule(cycleId, itemId, data, Number(tecnicoId));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Agendar item" onClose={onClose} maxWidth={480}>
      <div className="preventiva-form">
        <label>
          Data/janela
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label>
          Técnico
          <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value ? Number(e.target.value) : "")} required>
            <option value="">Selecione...</option>
            {(techs ?? []).map((t) => (
              <option key={t.users_id} value={t.users_id}>{t.nome_exibicao || t.nome_completo}</option>
            ))}
          </select>
        </label>
        {error && <p className="admin-panel-result is-error">{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Botao variant="primario" onClick={submit} disabled={!data || tecnicoId === "" || saving}>
            {saving ? "Salvando..." : "Confirmar agendamento"}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
