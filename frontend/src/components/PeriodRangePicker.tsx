"use client";

import { CalendarRange, Check, ChevronDown, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatDatePtBr, formatPeriodRef } from "@/lib/date";
import { useCumulativo } from "@/lib/cumulativo-context";
import { useGranularidade } from "@/lib/granularidade-context";
import { useSnapshots } from "@/lib/snapshot-context";
import { useUnitOptional } from "@/lib/unit-context";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function periodOptionLabel(ref: string, granularidade: "diaria" | "semanal" | "mensal"): string {
  if (granularidade === "mensal") {
    const match = ref.match(/^(\d{4})-(\d{2})$/);
    if (match) return `${MONTHS[Number(match[2]) - 1]}/${match[1]}`;
  }
  return formatPeriodRef(ref);
}

export function PeriodRangePicker() {
  const unit = useUnitOptional();
  const { granularidade } = useGranularidade();
  const { cumulativo, setCumulativo } = useCumulativo();
  const {
    periods,
    periodStartRef,
    periodEndRef,
    dataInicio,
    dataFim,
    isCustomRange,
    periodsLoading,
    setPeriodRange,
    resetPeriodRange,
  } = useSnapshots();
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!unit || unit.status !== "pronta") return null;

  const startIndex = periods.findIndex((period) => period.ref === draftStart);
  const endIndex = periods.findIndex((period) => period.ref === draftEnd);
  const rangeSummary = dataInicio && dataFim
    ? dataInicio === dataFim
      ? formatDatePtBr(dataInicio)
      : `${formatDatePtBr(dataInicio)} – ${formatDatePtBr(dataFim)}`
    : "Sem períodos";
  const unitLabel = granularidade === "diaria" ? "dia" : granularidade === "semanal" ? "semana" : "mês";
  const intervalLabel = granularidade === "diaria" ? "diário" : granularidade;

  function openPicker() {
    setDraftStart(periodStartRef ?? "");
    setDraftEnd(periodEndRef ?? "");
    setOpen((current) => !current);
  }

  function changeStart(value: string) {
    const nextIndex = periods.findIndex((period) => period.ref === value);
    setDraftStart(value);
    if (endIndex >= 0 && nextIndex > endIndex) setDraftEnd(value);
  }

  function changeEnd(value: string) {
    const nextIndex = periods.findIndex((period) => period.ref === value);
    setDraftEnd(value);
    if (startIndex >= 0 && nextIndex < startIndex) setDraftStart(value);
  }

  return (
    <div className="period-range" ref={rootRef}>
      <button
        type="button"
        className={`period-range-trigger ${cumulativo ? "is-active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={cumulativo}
        onClick={openPicker}
        disabled={periodsLoading || periods.length === 0}
      >
        <CalendarRange size={15} aria-hidden />
        <span>
          <small>{cumulativo ? `Intervalo ${intervalLabel}` : "Intervalo"}</small>
          <strong>{periodsLoading ? "Carregando…" : cumulativo ? rangeSummary : "Selecionar intervalo"}</strong>
        </span>
        <ChevronDown size={13} aria-hidden />
      </button>

      {open && (
        <section className="period-range-popover" role="dialog" aria-label="Definir intervalo de tempo">
          <header>
            <div>
              <strong>Intervalo da análise</strong>
              <span>Escolha o primeiro e o último {unitLabel}.</span>
            </div>
            {cumulativo && <em>Modo ativo</em>}
          </header>

          <div className="period-range-fields">
            <label>
              <span>De</span>
              <select aria-label={`${unitLabel} inicial`} value={draftStart} onChange={(event) => changeStart(event.target.value)}>
                {periods.map((period) => (
                  <option key={period.ref} value={period.ref}>{periodOptionLabel(period.ref, granularidade)}</option>
                ))}
              </select>
            </label>
            <span aria-hidden>→</span>
            <label>
              <span>Até</span>
              <select aria-label={`${unitLabel} final`} value={draftEnd} onChange={(event) => changeEnd(event.target.value)}>
                {periods.map((period) => (
                  <option key={period.ref} value={period.ref}>{periodOptionLabel(period.ref, granularidade)}</option>
                ))}
              </select>
            </label>
          </div>

          <p>O mesmo recorte será usado no ranking, técnicos, cards e gráficos.</p>

          <footer>
            <button
              type="button"
              className="period-range-reset"
              onClick={() => {
                resetPeriodRange();
                setOpen(false);
              }}
              disabled={!isCustomRange}
            >
              <RotateCcw size={13} /> Período completo
            </button>
            <button
              type="button"
              className="period-range-apply"
              onClick={() => {
                setPeriodRange(draftStart, draftEnd);
                setCumulativo(true);
                setOpen(false);
              }}
              disabled={!draftStart || !draftEnd}
            >
              <Check size={14} /> Aplicar
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
