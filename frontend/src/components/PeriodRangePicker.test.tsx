import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PeriodRangePicker } from "./PeriodRangePicker";

const contextMocks = vi.hoisted(() => ({
  setPeriodRange: vi.fn(),
  resetPeriodRange: vi.fn(),
  setCumulativo: vi.fn(),
}));

vi.mock("@/lib/unit-context", () => ({
  useUnitOptional: () => ({ status: "pronta", unit: null }),
}));

vi.mock("@/lib/granularidade-context", () => ({
  useGranularidade: () => ({ granularidade: "diaria" }),
}));

vi.mock("@/lib/cumulativo-context", () => ({
  useCumulativo: () => ({ cumulativo: false, setCumulativo: contextMocks.setCumulativo }),
}));

vi.mock("@/lib/snapshot-context", () => ({
  useSnapshots: () => ({
    periods: [
      { ref: "2026-07-01", inicio: "2026-07-01", fim: "2026-07-01" },
      { ref: "2026-07-02", inicio: "2026-07-02", fim: "2026-07-02" },
      { ref: "2026-07-03", inicio: "2026-07-03", fim: "2026-07-03" },
    ],
    periodStartRef: "2026-07-01",
    periodEndRef: "2026-07-03",
    dataInicio: "2026-07-01",
    dataFim: "2026-07-03",
    isCustomRange: true,
    periodsLoading: false,
    setPeriodRange: contextMocks.setPeriodRange,
    resetPeriodRange: contextMocks.resetPeriodRange,
  }),
}));

describe("PeriodRangePicker", () => {
  it("aplica o inicio e o fim escolhidos ao filtro global", () => {
    render(<PeriodRangePicker />);

    const trigger = screen.getByRole("button", { name: /intervalo/i });
    expect(trigger).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("combobox", { name: "dia inicial" }), {
      target: { value: "2026-07-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: /aplicar/i }));

    expect(contextMocks.setPeriodRange).toHaveBeenCalledWith("2026-07-02", "2026-07-03");
    expect(contextMocks.setCumulativo).toHaveBeenCalledWith(true);
  });

  it("restaura todo o periodo disponivel", () => {
    render(<PeriodRangePicker />);

    fireEvent.click(screen.getByRole("button", { name: /intervalo/i }));
    fireEvent.click(screen.getByRole("button", { name: /período completo/i }));

    expect(contextMocks.resetPeriodRange).toHaveBeenCalledOnce();
  });
});
