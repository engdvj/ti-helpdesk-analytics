"use client";

import { useEffect, useState } from "react";

import { Botao } from "@/components/ui/Botao";
import { useSnapshots } from "@/lib/snapshot-context";
import { useUnitOptional } from "@/lib/unit-context";

/** So aparece dentro de /u/[slug]/... - o "momento no tempo" nao significa
 * nada no hub. Controla Corrida E Perfis (os dois leem o mesmo snapshotSeq
 * do SnapshotProvider). */
export function SnapshotPlayback() {
  const unit = useUnitOptional();
  const { seqs, snapshotSeq, setSnapshotSeq, playing, setPlaying, periodoAtual } = useSnapshots();

  // Mesmo motivo do gate em AdminLink.tsx: SnapshotProvider fica fora do
  // <Suspense> do Header, entao o fetch+efeito que popula snapshotSeq pode
  // resolver antes do Header (conteudo adiado pelo Suspense) hidratar -
  // sem o gate, o range input as vezes hidrata com value/max ja atualizados
  // enquanto o servidor sempre renderiza vazio (mismatch intermitente).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!unit) return null;

  const effectiveSeqs = mounted ? seqs : [];
  const effectiveSnapshotSeq = mounted ? snapshotSeq : null;
  const currentIdx = effectiveSnapshotSeq != null ? effectiveSeqs.indexOf(effectiveSnapshotSeq) : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 220 }}>
      <Botao variant="secundario" onClick={() => setPlaying((p) => !p)} disabled={effectiveSeqs.length === 0}>
        {mounted && playing ? "Pausar" : "Reproduzir"}
      </Botao>
      <input
        type="range"
        min={0}
        max={Math.max(effectiveSeqs.length - 1, 0)}
        value={Math.max(currentIdx, 0)}
        onChange={(e) => setSnapshotSeq(effectiveSeqs[Number(e.target.value)])}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%", minWidth: 120, accentColor: "var(--acento)" }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fonte-label)",
          color: "var(--apagado)",
          whiteSpace: "nowrap",
        }}
      >
        {mounted ? periodoAtual : ""}
      </span>
    </div>
  );
}
