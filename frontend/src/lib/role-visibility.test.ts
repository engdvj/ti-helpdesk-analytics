import { describe, expect, it } from "vitest";

import type { RoleVisibility } from "./api";
import { isRoleVisible } from "./role-visibility";

describe("isRoleVisible", () => {
  it("mantem plantonistas visiveis mesmo sem configuracao carregada", () => {
    expect(isRoleVisible("plantonista")).toBe(true);
  });

  it("oculta papeis extras enquanto a configuracao nao carregou", () => {
    expect(isRoleVisible("tatico")).toBe(false);
    expect(isRoleVisible("coordenadora")).toBe(false);
  });

  it("respeita os controles independentes do admin", () => {
    const visibility: RoleVisibility = {
      mostrar_plantonistas: false,
      mostrar_taticos: true,
      mostrar_coordenacao: false,
    };

    expect(isRoleVisible("plantonista", visibility)).toBe(false);
    expect(isRoleVisible("tatico", visibility)).toBe(true);
    expect(isRoleVisible("coordenadora", visibility)).toBe(false);
  });
});
