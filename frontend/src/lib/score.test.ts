import { describe, expect, it } from "vitest";

import { confidenceLabel, scoreColor } from "./score";

describe("scoreColor", () => {
  it("retorna --apagado para valor nulo/indefinido", () => {
    expect(scoreColor(null)).toBe("var(--apagado)");
    expect(scoreColor(undefined)).toBe("var(--apagado)");
  });

  it("retorna --acento para score alto", () => {
    expect(scoreColor(62)).toBe("var(--acento)");
    expect(scoreColor(90)).toBe("var(--acento)");
  });

  it("retorna --aviso para score médio-baixo", () => {
    expect(scoreColor(46)).toBe("var(--aviso)");
  });

  it("retorna --critico para score baixo", () => {
    expect(scoreColor(0)).toBe("var(--critico)");
    expect(scoreColor(45.9)).toBe("var(--critico)");
  });
});

describe("confidenceLabel", () => {
  it("mapeia alta/media/baixa pros tokens corretos", () => {
    expect(confidenceLabel("alta")).toEqual({ label: "Confiança alta", color: "var(--acento)" });
    expect(confidenceLabel("media")).toEqual({ label: "Confiança média", color: "var(--aviso)" });
    expect(confidenceLabel("baixa")).toEqual({ label: "Confiança baixa", color: "var(--critico)" });
  });
});
