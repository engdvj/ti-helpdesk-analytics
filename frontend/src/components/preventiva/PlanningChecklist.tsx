"use client";

import { useState } from "react";

import { cycles as cyclesApi, type PlanningChecklistItem } from "@/lib/api";

/** Checklist 1 do PDF (planejamento do ciclo). Só tem estado booleano por
 * item (não há OK/NA nem observação como na execução), mas segue a mesma
 * linguagem visual do checklist de execução — pílula segmentada
 * "Feito / Pendente" em vez de checkbox nativo. */
export function PlanningChecklist({
  cycleId,
  itens,
  onChanged,
  readOnly = false,
}: {
  cycleId: number;
  itens: PlanningChecklistItem[];
  onChanged: () => unknown;
  /** Técnico que não é o responsável do ciclo vê o progresso mas não marca. */
  readOnly?: boolean;
}) {
  const [salvando, setSalvando] = useState<number | null>(null);
  const feitos = itens.filter((i) => i.ok).length;

  async function marcar(indice: number, ok: boolean) {
    if (readOnly) return;
    setSalvando(indice);
    try {
      await cyclesApi.markPlanningChecklist(cycleId, indice, ok);
      await onChanged();
    } finally {
      setSalvando(null);
    }
  }

  if (itens.length === 0) {
    return <p style={{ color: "var(--apagado)" }}>Nenhum item de planejamento configurado.</p>;
  }

  return (
    <>
      <p className="preventiva-exec-progress">{feitos}/{itens.length} concluídos</p>
      <div className="preventiva-exec-checklist">
        <div className="preventiva-exec-secao">
          <ul>
            {itens.map((check, indice) => (
              <li key={check.item} className="preventiva-exec-item">
                <div className="preventiva-exec-item-main">
                  <span>{check.item}</span>
                  <div role="radiogroup" aria-label={check.item} className="preventiva-exec-okna">
                    {([
                      { valor: true, rotulo: "Feito", cls: "is-ok" },
                      { valor: false, rotulo: "Pendente", cls: "is-na" },
                    ] as const).map(({ valor, rotulo, cls }) => (
                      <label
                        key={rotulo}
                        className={`preventiva-exec-okna-option ${cls} ${check.ok === valor ? "is-checked" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`plan-${indice}`}
                          checked={check.ok === valor}
                          disabled={salvando === indice || readOnly}
                          onChange={() => marcar(indice, valor)}
                        />
                        {rotulo}
                      </label>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
