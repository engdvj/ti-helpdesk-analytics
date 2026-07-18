import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GranularidadeSwitcher } from "./GranularidadeSwitcher";

const contextMocks = vi.hoisted(() => ({
  setGranularidade: vi.fn(),
  setCumulativo: vi.fn(),
  resetPeriodRange: vi.fn(),
}));

vi.mock("@/lib/unit-context", () => ({
  useUnitOptional: () => ({ status: "pronta", unit: null }),
}));

vi.mock("@/lib/granularidade-context", () => ({
  GRANULARIDADE_OPTIONS: [
    { key: "diaria", label: "Diário" },
    { key: "semanal", label: "Semanal" },
    { key: "mensal", label: "Mensal" },
  ],
  useGranularidade: () => ({ granularidade: "diaria", setGranularidade: contextMocks.setGranularidade }),
}));

vi.mock("@/lib/cumulativo-context", () => ({
  useCumulativo: () => ({ cumulativo: true, setCumulativo: contextMocks.setCumulativo }),
}));

vi.mock("@/lib/snapshot-context", () => ({
  useSnapshots: () => ({ resetPeriodRange: contextMocks.resetPeriodRange }),
}));

describe("GranularidadeSwitcher", () => {
  it("troca o intervalo por um periodo individual", () => {
    render(<GranularidadeSwitcher />);

    expect(screen.getByRole("button", { name: "Diário" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Semanal" }));

    expect(contextMocks.setGranularidade).toHaveBeenCalledWith("semanal");
    expect(contextMocks.setCumulativo).toHaveBeenCalledWith(false);
    expect(contextMocks.resetPeriodRange).toHaveBeenCalledOnce();
  });
});
