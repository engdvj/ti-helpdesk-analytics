"use client";

import { useState } from "react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { Modal } from "@/components/ui/Modal";
import { checklistItems as checklistItemsApi, cycles as cyclesApi } from "@/lib/api";
import { agruparPorSecao } from "@/lib/preventiva-checklists";

/** C2b - Checklist 2 do PDF (véspera). Itens vêm do catálogo editável pelo
 * admin (GET /preventiva/checklist-items?tipo=reconfirmacao), não fixos no
 * código. Todos precisam estar marcados OK antes de liberar o botão -
 * reflete a regra de que a reconfirmação é pré-requisito bloqueante da
 * execução (C3), não um registro informativo. */
export function ReconfirmChecklist({
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
  const { data: defs } = useSWR(
    ["checklist-items", "reconfirmacao"],
    () => checklistItemsApi.list("reconfirmacao", true),
  );
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itens = defs ?? [];
  const completo = itens.length > 0 && itens.every((def) => marcas[def.texto]);
  const grupos = agruparPorSecao(itens);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await cyclesApi.reconfirm(cycleId, itemId, marcas);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Reconfirmação da véspera (Checklist 2)" onClose={onClose} maxWidth={560}>
      {itens.length === 0 ? (
        <p style={{ color: "var(--apagado)" }}>
          Nenhum item de reconfirmação configurado. Um admin precisa cadastrar em Admin → Checklists.
        </p>
      ) : (
        <div className="preventiva-exec-checklist">
          {grupos.map((grupo, indiceGrupo) => (
            <div key={indiceGrupo} className="preventiva-exec-secao">
              {grupo.secao && <h3>{grupo.secao}</h3>}
              <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {grupo.itens.map((def) => (
                  <li key={def.id} className="preventiva-exec-item">
                    <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(marcas[def.texto])}
                        onChange={(e) => setMarcas((current) => ({ ...current, [def.texto]: e.target.checked }))}
                        style={{ marginTop: "0.2rem", width: 18, height: 18, accentColor: "var(--acento)" }}
                      />
                      <span>{def.texto}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {itens.length > 0 && !completo && <p style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)", marginTop: "0.75rem" }}>
        Todos os itens precisam estar marcados para liberar a execução.
      </p>}
      {error && <p className="admin-panel-result is-error">{error}</p>}

      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
        <Botao variant="primario" onClick={submit} disabled={!completo || saving}>
          {saving ? "Salvando..." : "Confirmar reconfirmação"}
        </Botao>
      </div>
    </Modal>
  );
}
