import { describe, expect, it } from "vitest";

import { formatDatePtBr, formatPeriodRef } from "./date";

describe("formatDatePtBr", () => {
  it("formata data ISO sem sofrer deslocamento de fuso", () => {
    expect(formatDatePtBr("2026-07-17")).toBe("17/07/2026");
    expect(formatDatePtBr("2026-07-17T00:30:00Z")).toBe("17/07/2026");
  });

  it("mantem valores desconhecidos e usa travessao para ausentes", () => {
    expect(formatDatePtBr("17/07/2026")).toBe("17/07/2026");
    expect(formatDatePtBr(null)).toBe("—");
  });
});

describe("formatPeriodRef", () => {
  it("formata dia e intervalo semanal", () => {
    expect(formatPeriodRef("2026-07-17")).toBe("17/07/2026");
    expect(formatPeriodRef("2026-07-13/2026-07-19")).toBe("13/07/2026–19/07/2026");
  });

  it("expande o mes para o intervalo completo", () => {
    expect(formatPeriodRef("2024-02")).toBe("01/02/2024–29/02/2024");
  });
});
