"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import useSWR from "swr";

import { analytics, type TechSnapshot } from "./api";
import { useGranularidade } from "./granularidade-context";
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
}

const SnapshotContext = createContext<SnapshotState | null>(null);

/** Busca a timeline de snapshots (mesma chave/cache do SWR pra Corrida e
 * Perfis - so um fetch por combinacao de granularidade+unidade) e possui o
 * "qual momento no tempo estou olhando" - controle global desde que o
 * play/slider virou navbar, junto da granularidade. */
export function SnapshotProvider({ children }: { children: ReactNode }) {
  const unit = useUnitOptional();
  const { granularidade } = useGranularidade();
  const entitiesId = unit?.status === "pronta" ? (unit.unit?.entities_id ?? undefined) : undefined;

  const { data, isLoading, error } = useSWR(["snapshots", granularidade, entitiesId], () =>
    analytics.snapshots({ granularidade, entitiesId }),
  );

  const [snapshotSeq, setSnapshotSeq] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const seqs = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((d) => d.snapshot_seq))).sort((a, b) => a - b);
  }, [data]);

  // Trocar granularidade/unidade muda o intervalo de snapshot_seq (ex.: 33
  // dias vira 6 semanas) - sem isso o slider ficava preso num seq que so
  // existia no intervalo anterior, e a lista aparecia vazia.
  useEffect(() => {
    setSnapshotSeq(null);
    setPlaying(false);
  }, [granularidade, entitiesId]);

  useEffect(() => {
    if (seqs.length && snapshotSeq === null) setSnapshotSeq(seqs[seqs.length - 1]);
  }, [seqs, snapshotSeq]);

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
  }, [playing, seqs]);

  const periodoAtual = data?.find((d) => d.snapshot_seq === snapshotSeq)?.periodo_ref;

  return (
    <SnapshotContext.Provider
      value={{ data, isLoading, error, seqs, snapshotSeq, setSnapshotSeq, playing, setPlaying, periodoAtual }}
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
