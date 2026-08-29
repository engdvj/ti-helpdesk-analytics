"use client";

import { useState } from "react";
import { Eye, SquarePen, Trash2 } from "lucide-react";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { cycles as cyclesApi, type CycleItem } from "@/lib/api";

import { ExecutionChecklist } from "./ExecutionChecklist";
import { ReconfirmChecklist } from "./ReconfirmChecklist";
import { RescheduleModal } from "./RescheduleModal";
import { ScheduleItemModal } from "./ScheduleItemModal";

const STATUS_LABEL: Record<CycleItem["status"], string> = {
  planejado: "Planejado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  remarcado: "Remarcado",
  pendente: "Pendente",
};

type ActiveModal = "schedule" | "reconfirm" | "execute" | "reschedule" | null;

function reconfirmacaoCompleta(item: CycleItem): boolean {
  return Boolean(item.reconfirmacao_itens) && item.reconfirmacao_itens!.every((i) => i.ok);
}

export function CycleItemRow({
  item,
  patrimonio,
  tecnicoNome,
  onChanged,
}: {
  item: CycleItem;
  patrimonio: string;
  tecnicoNome: string | null;
  onChanged: () => void;
}) {
  const { isAdmin } = useAdmin();
  const [modal, setModal] = useState<ActiveModal>(null);
  const [removendo, setRemovendo] = useState(false);

  function close() { setModal(null); }
  function done() { setModal(null); onChanged(); }

  async function remover() {
    if (!window.confirm(`Tirar o computador ${patrimonio} deste ciclo?`)) return;
    setRemovendo(true);
    try {
      await cyclesApi.removeItem(item.ciclo_id, item.id);
      onChanged();
    } catch (err) {
      window.alert((err as Error).message);
      setRemovendo(false);
    }
  }

  const atrasado = item.status === "confirmado" && item.data_agendada != null && item.data_agendada < new Date().toISOString().slice(0, 10);
  const finalizado = item.status === "concluido" || item.status === "pendente";

  return (
    <>
      <tr>
        <td style={{ whiteSpace: "nowrap" }}>{patrimonio}</td>
        <td><span className={`preventiva-badge is-priority-${item.prioridade}`}>{item.prioridade}</span></td>
        <td>
          <span className={`preventiva-badge is-status-${item.status}`}>{STATUS_LABEL[item.status]}</span>
          {atrasado && <span className="preventiva-badge is-late">atrasado</span>}
        </td>
        <td style={{ whiteSpace: "nowrap" }}>{item.data_agendada ?? "—"}</td>
        <td>{tecnicoNome ?? "—"}</td>
        <td>
          {finalizado ? (
            <button
              type="button"
              className="preventiva-icon-btn"
              onClick={() => setModal("execute")}
              title={isAdmin ? "Editar checklist" : "Ver checklist"}
              aria-label={isAdmin ? "Editar checklist" : "Ver checklist"}
            >
              {isAdmin ? <SquarePen size={16} /> : <Eye size={16} />}
            </button>
          ) : (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              {item.status === "planejado" && (
                <Botao variant="secundario" onClick={() => setModal("schedule")}>Agendar</Botao>
              )}
              {item.status === "remarcado" && (
                <Botao variant="secundario" onClick={() => setModal("schedule")}>Reagendar</Botao>
              )}
              {item.status === "confirmado" && !reconfirmacaoCompleta(item) && (
                <Botao variant="secundario" onClick={() => setModal("reconfirm")}>Reconfirmar véspera</Botao>
              )}
              {item.status === "confirmado" && reconfirmacaoCompleta(item) && (
                <Botao variant="primario" onClick={() => setModal("execute")}>Executar</Botao>
              )}
              {item.status === "confirmado" && (
                <Botao onClick={() => setModal("reschedule")}>Remarcar</Botao>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="preventiva-icon-btn is-danger"
                  onClick={remover}
                  disabled={removendo}
                  title="Tirar do ciclo"
                  aria-label={`Tirar ${patrimonio} do ciclo`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )}
        </td>
      </tr>

      {modal === "schedule" && (
        <ScheduleItemModal cycleId={item.ciclo_id} itemId={item.id} onClose={close} onDone={done} />
      )}
      {modal === "reconfirm" && (
        <ReconfirmChecklist cycleId={item.ciclo_id} itemId={item.id} onClose={close} onDone={done} />
      )}
      {modal === "execute" && (
        <ExecutionChecklist
          cycleId={item.ciclo_id}
          itemId={item.id}
          existingItem={finalizado ? item : undefined}
          readOnly={finalizado && !isAdmin}
          onClose={close}
          onDone={done}
        />
      )}
      {modal === "reschedule" && (
        <RescheduleModal cycleId={item.ciclo_id} itemId={item.id} onClose={close} onDone={done} />
      )}
    </>
  );
}
