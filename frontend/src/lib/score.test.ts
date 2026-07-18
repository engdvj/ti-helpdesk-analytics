import { describe, expect, it } from "vitest";

import type { TechSnapshot } from "./api";
import { snapshotHasActivity } from "./score";

describe("snapshotHasActivity", () => {
  it("infere atividade pelo volume em snapshots do contrato antigo", () => {
    expect(snapshotHasActivity({ chamados_resolvidos: 94 } as TechSnapshot)).toBe(true);
    expect(snapshotHasActivity({ chamados_resolvidos: 0 } as TechSnapshot)).toBe(false);
  });

  it("respeita o campo explicito do contrato novo", () => {
    expect(snapshotHasActivity({ chamados_resolvidos: 94, elegivel: false } as TechSnapshot)).toBe(false);
  });
});
