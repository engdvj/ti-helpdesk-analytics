import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigPreset } from "@/lib/api";

import { ConfigPresetsPanel } from "./ConfigPresetsPanel";

const mocks = vi.hoisted(() => ({
  mutateLocal: vi.fn(),
  mutateGlobal: vi.fn(),
  create: vi.fn(),
  apply: vi.fn(),
}));

const preset: ConfigPreset = {
  id: "a".repeat(32),
  nome: "Operação normal",
  criado_em: "2026-07-18T12:00:00Z",
  atualizado_em: "2026-07-18T12:00:00Z",
  parametros: {
    score_weights: {
      score_volume: 0.31,
      score_complexidade: 0.21,
      score_velocidade_resposta: 0.16,
      score_abrangencia: 0.13,
      score_qualidade: 0.19,
    },
    score_targets: {
      volume_por_dia: 3,
      complexidade_categoria: 1,
      resposta_min: 60,
      abrangencia_ratio: 0.35,
      qualidade: 70,
    },
    category_overrides: { "41": 4 },
    role_visibility: {
      mostrar_plantonistas: true,
      mostrar_taticos: false,
      mostrar_coordenacao: false,
    },
  },
};

vi.mock("swr", () => ({
  default: () => ({ data: [preset], error: null, mutate: mocks.mutateLocal }),
  useSWRConfig: () => ({ mutate: mocks.mutateGlobal }),
}));

vi.mock("@/lib/admin-context", () => ({
  useAdmin: () => ({ credentials: { username: "admin", password: "secret" } }),
}));

vi.mock("@/lib/api", () => ({
  adminApi: {
    listConfigPresets: vi.fn(),
    createConfigPreset: mocks.create,
    applyConfigPreset: mocks.apply,
    updateConfigPreset: vi.fn(),
    deleteConfigPreset: vi.fn(),
    exportConfigPreset: vi.fn(),
    exportConfigPresets: vi.fn(),
    importConfigPresets: vi.fn(),
  },
}));

describe("ConfigPresetsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateLocal.mockResolvedValue(undefined);
    mocks.mutateGlobal.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ ...preset, id: "b".repeat(32), nome: "Plantão crítico" });
    mocks.apply.mockResolvedValue(preset);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("salva a configuracao atual como preset nomeado", async () => {
    render(<ConfigPresetsPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /nome do novo preset/i }), {
      target: { value: "Plantão crítico" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar configuração atual/i }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(
      "Plantão crítico",
      { username: "admin", password: "secret" },
    ));
    expect(await screen.findByText(/preset “plantão crítico” salvo/i)).toBeInTheDocument();
  });

  it("aplica preset e invalida configuracoes e snapshots", async () => {
    render(<ConfigPresetsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(
      preset.id,
      { username: "admin", password: "secret" },
    ));
    expect(mocks.mutateGlobal).toHaveBeenCalledOnce();
    expect(await screen.findByText(/aplicado em toda a análise/i)).toBeInTheDocument();
  });
});
