"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import useSWR from "swr";

import { analytics, type SnapshotPeriod, type TechSnapshot } from "./api";
import { useCumulativo } from "./cumulativo-context";
import { useGranularidade } from "./granularidade-context";
import { useScoreMode } from "./score-mode-context";
import { useUnitOptional } from "./unit-context";

interface SnapshotState {
  data: TechSnapshot[] | undefined;
  isLoading: boolean;
  error: unknown;
  seqs: number[];
  snapshotSeq: number | null;
  setSnapshotSeq: Dispatch<SetStateAction<number | null>>;
  playing: boolean;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  periodoAtual: string | undefined;
  periods: SnapshotPeriod[];
  periodStartRef: string | null;
  periodEndRef: string | null;
  dataInicio: string | undefined;
  dataFim: string | undefined;
  isCustomRange: boolean;
  periodsLoading: boolean;
  setPeriodRange: (startRef: string, endRef: string) => void;
  resetPeriodRange: () => void;
}

const SnapshotContext = createContext<SnapshotState | null>(null);

/** Busca a timeline de snapshots (mesma chave/cache do SWR pra Corrida e
 * Perfis - so um fetch por combinacao de granularidade+unidade) e possui o
 * "qual momento no tempo estou olhando" - controle global desde que o
 * play/slider virou navbar, junto da granularidade. */
export function SnapshotProvider({ children }: { children: ReactNode }) {
  const unit = useUnitOptional();
  const { granularidade } = useGranularidade();
  const { cumulativo } = useCumulativo();
  const { scoreMode } = useScoreMode();
  const entitiesId = unit?.status === "pronta" ? (unit.unit?.entities_id ?? undefined) : undefined;
  const unitKey = entitiesId ?? "geral";
  const canLoad = unit == null || unit.status === "pronta";

  const {
    data: periodsData,
    isLoading: periodsLoading,
    error: periodsError,
  } = useSWR(
    canLoad ? ["snapshot-periods", granularidade, entitiesId] : null,
    () => analytics.periods({ granularidade, entitiesId }),
  );

  const periods = useMemo(() => periodsData ?? [], [periodsData]);
  const [requestedRange, setRequestedRange] = useState<{
    granularidade: TechSnapshot["granularidade"];
    unitKey: number | "geral";
    startRef: string;
    endRef: string;
  } | null>(null);

  const effectiveRange = useMemo(() => {
    if (periods.length === 0) return null;
    const applies = requestedRange?.granularidade === granularidade && requestedRange.unitKey === unitKey;
    const requestedStart = applies ? periods.findIndex((period) => period.ref === requestedRange.startRef) : -1;
    const requestedEnd = applies ? periods.findIndex((period) => period.ref === requestedRange.endRef) : -1;
    const startIndex = requestedStart >= 0 ? requestedStart : 0;
    const endIndex = requestedEnd >= startIndex ? requestedEnd : periods.length - 1;
    return {
      startIndex,
      endIndex,
      start: periods[startIndex],
      end: periods[endIndex],
    };
  }, [granularidade, periods, requestedRange, unitKey]);

  const dataInicio = effectiveRange?.start.inicio;
  const dataFim = effectiveRange?.end.fim;

  const { data, isLoading, error } = useSWR(
    canLoad && periodsData !== undefined
      ? ["snapshots", granularidade, cumulativo, scoreMode, entitiesId, dataInicio, dataFim]
      : null,
    () => analytics.snapshots({ granularidade, cumulativo, scoreMode, entitiesId, dataInicio, dataFim }),
  );

  const selectionKey = `${granularidade}:${cumulativo}:${scoreMode}:${unitKey}:${dataInicio ?? ""}:${dataFim ?? ""}`;
  const [requestedMoment, setRequestedMoment] = useState<{ key: string; seq: number | null } | null>(null);
  const [playback, setPlayback] = useState<{ key: string; playing: boolean } | null>(null);
  const requestedSnapshotSeq = requestedMoment?.key === selectionKey ? requestedMoment.seq : null;
  const playing = playback?.key === selectionKey ? playback.playing : false;

  const seqs = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((d) => d.snapshot_seq))).sort((a, b) => a - b);
  }, [data]);

  const snapshotSeq = useMemo(() => {
    if (seqs.length === 0) return null;
    return requestedSnapshotSeq != null && seqs.includes(requestedSnapshotSeq)
      ? requestedSnapshotSeq
      : seqs[seqs.length - 1];
  }, [requestedSnapshotSeq, seqs]);

  const setSnapshotSeq = useCallback<Dispatch<SetStateAction<number | null>>>((next) => {
    setRequestedMoment((previous) => {
      const requested = previous?.key === selectionKey ? previous.seq : null;
      const current = requested != null && seqs.includes(requested)
        ? requested
        : (seqs[seqs.length - 1] ?? null);
      return { key: selectionKey, seq: typeof next === "function" ? next(current) : next };
    });
  }, [selectionKey, seqs]);

  const setPlaying = useCallback<Dispatch<SetStateAction<boolean>>>((next) => {
    setPlayback((previous) => {
      const current = previous?.key === selectionKey ? previous.playing : false;
      return { key: selectionKey, playing: typeof next === "function" ? next(current) : next };
    });
  }, [selectionKey]);

  const setPeriodRange = useCallback((startRef: string, endRef: string) => {
    const startIndex = periods.findIndex((period) => period.ref === startRef);
    const endIndex = periods.findIndex((period) => period.ref === endRef);
    if (startIndex < 0 || endIndex < 0) return;
    const [safeStart, safeEnd] = startIndex <= endIndex
      ? [periods[startIndex].ref, periods[endIndex].ref]
      : [periods[endIndex].ref, periods[startIndex].ref];
    setRequestedRange({ granularidade, unitKey, startRef: safeStart, endRef: safeEnd });
  }, [granularidade, periods, unitKey]);

  const resetPeriodRange = useCallback(() => {
    setRequestedRange(null);
  }, []);

  // Momento e reproducao carregam a chave completa do recorte. Ao trocar
  // granularidade, modo, unidade ou intervalo, os estados anteriores deixam
  // de se aplicar imediatamente, sem precisar sincronizar estado num efeito.

  useEffect(() => {
    if (!playing || seqs.length === 0) return;
    const id = setInterval(() => {
      setSnapshotSeq((cur) => {
        if (cur === null) return seqs[0];
        const idx = seqs.indexOf(cur);
        if (idx === -1 || idx === seqs.length - 1) {
          setPlaying(false);
          return cur;
        }
        return seqs[idx + 1];
      });
    }, 700);
    return () => clearInterval(id);
  }, [playing, seqs, setPlaying, setSnapshotSeq]);

  const periodoAtual = data?.find((d) => d.snapshot_seq === snapshotSeq)?.periodo_ref;

  return (
    <SnapshotContext.Provider
      value={{
        data,
        isLoading: periodsLoading || isLoading,
        error: periodsError ?? error,
        seqs,
        snapshotSeq,
        setSnapshotSeq,
        playing,
        setPlaying,
        periodoAtual,
        periods,
        periodStartRef: effectiveRange?.start.ref ?? null,
        periodEndRef: effectiveRange?.end.ref ?? null,
        dataInicio,
        dataFim,
        isCustomRange: effectiveRange != null
          && (effectiveRange.startIndex > 0 || effectiveRange.endIndex < periods.length - 1),
        periodsLoading,
        setPeriodRange,
        resetPeriodRange,
      }}
    >
      {children}
    </SnapshotContext.Provider>
  );
}

export function useSnapshots(): SnapshotState {
  const ctx = useContext(SnapshotContext);
  if (!ctx) throw new Error("useSnapshots() precisa estar dentro de <SnapshotProvider>");
  return ctx;
}
