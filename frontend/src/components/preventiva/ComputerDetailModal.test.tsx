import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ComputerDetail } from "@/lib/api";

import { ComputerDetailModal } from "./ComputerDetailModal";

const mocks = vi.hoisted(() => ({ useSWR: vi.fn() }));

vi.mock("swr", () => ({ default: mocks.useSWR, useSWRConfig: () => ({ mutate: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ computers: { get: vi.fn(), deleteHardware: vi.fn(), saveHardware: vi.fn() } }));

const BASE: ComputerDetail = {
  id: 7,
  patrimonio: "762122",
  hostname: "HGVC-TI-002",
  setor_atual_id: 3,
  setor_alterado_em: null,
  criado_em: "2026-08-29T00:00:00Z",
  ativo: true,
  proxima_preventiva: null,
  hardware_score: 69,
  hardware_nivel: "atencao",
  hardware_detalhes: ["RAM: 16GB (boa)", "Disco: SSD"],
  id_glpi_computer: 1,
  hardware: {
    ram_mb: 16384, disco_tipo: "SSD", disco_total_mb: 500000, disco_livre_mb: 25000,
    so_nome: "Microsoft Windows 10 Pro", so_instalado_em: "2024-03-01",
    cpu_designacao: "Intel Core i3-12100", gpu_designacao: "Intel UHD Graphics", gpu_memoria_mb: null,
    atualizado_em: "2026-08-29T03:22:00Z",
  },
  score_componentes: [
    { dimensao: "RAM", pontos: 22, peso: 25, texto: "RAM: 16GB (boa)" },
    { dimensao: "Espaço livre", pontos: 0, peso: 15, texto: "Espaço livre: 5% (crítico)" },
  ],
};

describe("ComputerDetailModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra score, quebra por dimensão e especificações", () => {
    mocks.useSWR.mockReturnValue({ data: BASE });
    render(<ComputerDetailModal computerId={7} onClose={vi.fn()} onEditar={vi.fn()} podeEditar />);

    expect(screen.getByText("69")).toBeInTheDocument();
    expect(screen.getByText("Atenção")).toBeInTheDocument();
    expect(screen.getByText(/RAM/)).toBeInTheDocument();
    expect(screen.getByText(/22\/25/)).toBeInTheDocument();
    expect(screen.getByText("Intel Core i3-12100")).toBeInTheDocument();
    expect(screen.getByText(/Importado do GLPI \(Computer #1\)/)).toBeInTheDocument();
  });

  it("PC manual sem hardware: estado vazio + botão de informar manualmente (com podeEditar)", () => {
    mocks.useSWR.mockReturnValue({
      data: { ...BASE, hardware: null, hardware_score: null, hardware_nivel: null, score_componentes: null, id_glpi_computer: null },
    });
    render(<ComputerDetailModal computerId={7} onClose={vi.fn()} onEditar={vi.fn()} podeEditar />);

    expect(screen.getByText(/não roda o GLPI Agent/)).toBeInTheDocument();
    expect(screen.getByText(/Cadastro manual/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Informar manualmente" })).toBeInTheDocument();
  });

  it("só-leitura (sem podeEditar): sem 'Informar manualmente' nem 'Editar'", () => {
    mocks.useSWR.mockReturnValue({
      data: { ...BASE, hardware: null, hardware_score: null, hardware_nivel: null, score_componentes: null, id_glpi_computer: null },
    });
    render(<ComputerDetailModal computerId={7} onClose={vi.fn()} />);

    expect(screen.getByText(/não roda o GLPI Agent/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Informar manualmente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("PC do GLPI sem hardware: estado vazio, sem botão manual mesmo com podeEditar", () => {
    mocks.useSWR.mockReturnValue({
      data: { ...BASE, hardware: null, hardware_score: null, hardware_nivel: null, score_componentes: null, id_glpi_computer: 5 },
    });
    render(<ComputerDetailModal computerId={7} onClose={vi.fn()} onEditar={vi.fn()} podeEditar />);

    expect(screen.getByText(/não foi importado do GLPI Agent/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Informar manualmente" })).not.toBeInTheDocument();
  });
});
