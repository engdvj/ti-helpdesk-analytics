import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SnapshotPlayback } from "./SnapshotPlayback";

const setSnapshotSeq = vi.fn();
const setPlaying = vi.fn();

vi.mock("@/lib/unit-context", () => ({
  useUnitOptional: () => ({ status: "pronta", unit: { entities_id: 1 } }),
}));

vi.mock("@/lib/snapshot-context", () => ({
  useSnapshots: () => ({
    seqs: [10, 20, 30],
    snapshotSeq: 20,
    setSnapshotSeq,
    playing: false,
    setPlaying,
    periodoAtual: "2026-07-17",
  }),
}));

describe("SnapshotPlayback", () => {
  beforeEach(() => {
    setSnapshotSeq.mockClear();
    setPlaying.mockClear();
  });

  it("exibe o controle de reproducao como botao com icone acessivel", () => {
    render(<SnapshotPlayback />);

    expect(screen.getByRole("button", { name: "Reproduzir" })).toBeInTheDocument();
    expect(screen.getByText("17/07/2026")).toBeInTheDocument();
  });

  it("avanca e retrocede snapshots com as setas globais", () => {
    render(<SnapshotPlayback />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    const advance = setSnapshotSeq.mock.calls[0][0] as (current: number) => number;
    expect(advance(20)).toBe(30);
    expect(setPlaying).toHaveBeenCalledWith(false);

    setSnapshotSeq.mockClear();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    const rewind = setSnapshotSeq.mock.calls[0][0] as (current: number) => number;
    expect(rewind(20)).toBe(10);
  });

  it("deixa o input range tratar as setas quando esta focado", () => {
    render(<SnapshotPlayback />);

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });

    expect(setSnapshotSeq).not.toHaveBeenCalled();
  });
});
