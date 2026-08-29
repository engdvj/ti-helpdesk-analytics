"use client";

import { useState } from "react";

import { Botao } from "@/components/ui/Botao";
import { cycles as cyclesApi, type CycleItem } from "@/lib/api";

/** C5 - Checklist 4 do PDF (fechamento). Contagem sempre calculada do que
 * já está carregado (nunca digitada) - requisito explícito. */
export function CloseCycleSummary({
  cycleId,
  itens,
  onClosed,
}: {
  cycleId: number;
  itens: CycleItem[];
  onClosed: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = {
    planejado: itens.filter((i) => i.status === "planejado").length,
    confirmado: itens.filter((i) => i.status === "confirmado").length,
    concluido: itens.filter((i) => i.status === "concluido").length,
    remarcado: itens.filter((i) => i.status === "remarcado").length,
    pendente: itens.filter((i) => i.status === "pendente").length,
  };

  const bloqueando = itens.filter((item) => {
    if (item.status === "concluido") return false;
    if (item.status === "remarcado") return !item.data_agendada;
    if (item.status === "pendente") return !item.pendencia_responsavel || !item.pendencia_prazo;
    return true; // planejado/confirmado nunca contam como resolvidos
  });

  async function fechar() {
    setClosing(true);
    setError(null);
    try {
      await cyclesApi.close(cycleId);
      onClosed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="sumula-cartao admin-panel">
      <div className="admin-panel-header">
        <h2>Fechamento do ciclo</h2>
      </div>

      <div className="preventiva-summary-grid">
        <div><span>Planejados</span><strong>{counts.planejado}</strong></div>
        <div><span>Confirmados</span><strong>{counts.confirmado}</strong></div>
        <div><span>Concluídos</span><strong>{counts.concluido}</strong></div>
        <div><span>Remarcados</span><strong>{counts.remarcado}</strong></div>
        <div><span>Pendentes</span><strong>{counts.pendente}</strong></div>
      </div>

      {bloqueando.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ color: "var(--critico)" }}>
            {bloqueando.length} item{bloqueando.length === 1 ? "" : "s"} precisa{bloqueando.length === 1 ? "" : "m"} ser resolvido antes de encerrar:
          </p>
          <ul>
            {bloqueando.map((item) => (
              <li key={item.id} style={{ color: "var(--apagado)" }}>
                Computador #{item.computador_id} — status &quot;{item.status}&quot;
                {item.status === "pendente" && " (falta responsável e/ou prazo da pendência)"}
                {item.status === "remarcado" && " (falta nova data)"}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ color: "var(--apagado)", marginTop: "1rem" }}>Todos os itens resolvidos — pronto para encerrar.</p>
      )}

      {error && <p className="admin-panel-result is-error">{error}</p>}

      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
        <Botao variant="primario" onClick={fechar} disabled={bloqueando.length > 0 || closing || itens.length === 0}>
          {closing ? "Encerrando..." : "Encerrar ciclo"}
        </Botao>
      </div>
    </section>
  );
}
