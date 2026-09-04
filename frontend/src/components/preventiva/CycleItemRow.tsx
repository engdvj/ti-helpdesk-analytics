"use client";

import { useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  Eye,
  SquarePen,
  Trash2,
  Wrench,
} from "lucide-react";

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
  souGestor,
  meuUserId,
  onChanged,
}: {
  item: CycleItem;
  patrimonio: string;
  tecnicoNome: string | null;
  /** admin ou o técnico responsável do ciclo — agenda, remove do ciclo e
   * reabre checklist finalizado. */
  souGestor: boolean;
  /** users_id da sessão atual — pra saber se este item é dele. */
  meuUserId: number | null;
  onChanged: () => void;
}) {
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

  // técnico atribuído a ESTE item: reconfirma véspera, executa e remarca o
  // item dele (tudo em "confirmado") — nada além disso. O gestor faz tudo.
  const meuItem = meuUserId != null && item.tecnico_id === meuUserId;
  const podeAgir = souGestor || meuItem;
  const temAcao = finalizado || souGestor || (meuItem && item.status === "confirmado");

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
          {!temAcao ? (
            <span style={{ color: "var(--apagado)" }}>—</span>
          ) : (
            <div className="preventiva-row-actions">
              {finalizado ? (
                <button
                  type="button"
                  className="preventiva-icon-btn"
                  onClick={() => setModal("execute")}
                  title={souGestor ? "Editar checklist" : "Ver checklist"}
                  aria-label={souGestor ? "Editar checklist" : "Ver checklist"}
                >
                  {souGestor ? <SquarePen size={16} /> : <Eye size={16} />}
                </button>
              ) : (
                <>
                  {item.status === "planejado" && souGestor && (
                    <button
                      type="button"
                      className="preventiva-icon-btn"
                      onClick={() => setModal("schedule")}
                      title="Agendar"
                      aria-label={`Agendar ${patrimonio}`}
                    >
                      <CalendarPlus size={16} />
                    </button>
                  )}
                  {item.status === "remarcado" && souGestor && (
                    <button
                      type="button"
                      className="preventiva-icon-btn"
                      onClick={() => setModal("schedule")}
                      title="Reagendar"
                      aria-label={`Reagendar ${patrimonio}`}
                    >
                      <CalendarPlus size={16} />
                    </button>
                  )}
                  {item.status === "confirmado" && !reconfirmacaoCompleta(item) && podeAgir && (
                    <button
                      type="button"
                      className="preventiva-icon-btn"
                      onClick={() => setModal("reconfirm")}
                      title="Reconfirmar véspera"
                      aria-label={`Reconfirmar véspera de ${patrimonio}`}
                    >
                      <ClipboardCheck size={16} />
                    </button>
                  )}
                  {item.status === "confirmado" && reconfirmacaoCompleta(item) && podeAgir && (
                    <button
                      type="button"
                      className="preventiva-icon-btn is-primary"
                      onClick={() => setModal("execute")}
                      title="Executar preventiva"
                      aria-label={`Executar preventiva de ${patrimonio}`}
                    >
                      <Wrench size={16} />
                    </button>
                  )}
                  {item.status === "confirmado" && podeAgir && (
                    <button
                      type="button"
                      className="preventiva-icon-btn"
                      onClick={() => setModal("reschedule")}
                      title="Remarcar"
                      aria-label={`Remarcar ${patrimonio}`}
                    >
                      <CalendarClock size={16} />
                    </button>
                  )}
                  {souGestor && (
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
                </>
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
          readOnly={finalizado && !souGestor}
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
