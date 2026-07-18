"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { Botao } from "@/components/ui/Botao";
import { formatPeriodRef } from "@/lib/date";
import { useSnapshots } from "@/lib/snapshot-context";
import { useUnitOptional } from "@/lib/unit-context";

const subscribeToHydration = () => () => {};

function useHasMounted(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => true, () => false);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

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
  const mounted = useHasMounted();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        !unit ||
        seqs.length === 0 ||
        !["ArrowLeft", "ArrowRight"].includes(event.key) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      setPlaying(false);
      setSnapshotSeq((current) => {
        const currentIdx = current == null ? (direction > 0 ? -1 : seqs.length) : seqs.indexOf(current);
        const safeIdx = currentIdx === -1 ? (direction > 0 ? -1 : seqs.length) : currentIdx;
        const nextIdx = Math.min(Math.max(safeIdx + direction, 0), seqs.length - 1);
        return seqs[nextIdx];
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seqs, setPlaying, setSnapshotSeq, unit]);

  if (!unit) return null;

  const effectiveSeqs = mounted ? seqs : [];
  const effectiveSnapshotSeq = mounted ? snapshotSeq : null;
  const currentIdx = effectiveSnapshotSeq != null ? effectiveSeqs.indexOf(effectiveSnapshotSeq) : 0;

  return (
    <div className="snapshot-playback" style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 220 }}>
      <Botao
        className="snapshot-playback-toggle"
        variant="secundario"
        aria-label={mounted && playing ? "Pausar" : "Reproduzir"}
        aria-pressed={mounted && playing}
        title={mounted && playing ? "Pausar" : "Reproduzir"}
        onClick={() => setPlaying((p) => !p)}
        disabled={effectiveSeqs.length === 0}
        style={{ width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {mounted && playing ? <Pause size={16} fill="currentColor" aria-hidden /> : <Play size={16} fill="currentColor" aria-hidden />}
      </Botao>
      <input
        className="snapshot-playback-range"
        type="range"
        aria-label="Selecionar período"
        aria-keyshortcuts="ArrowLeft ArrowRight"
        title="Use as setas esquerda e direita para mudar o período"
        min={0}
        max={Math.max(effectiveSeqs.length - 1, 0)}
        value={Math.max(currentIdx, 0)}
        onChange={(e) => {
          setPlaying(false);
          setSnapshotSeq(effectiveSeqs[Number(e.target.value)]);
        }}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%", minWidth: 120, accentColor: "var(--acento)" }}
      />
      <span
        className="snapshot-playback-date"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fonte-label)",
          color: "var(--apagado)",
          whiteSpace: "nowrap",
        }}
      >
        {mounted && periodoAtual ? formatPeriodRef(periodoAtual) : ""}
      </span>
    </div>
  );
}
