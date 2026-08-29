import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Computer, ComputerPage, Sector } from "@/lib/api";

import { ComputerList } from "./ComputerList";

const mocks = vi.hoisted(() => ({ useSWR: vi.fn() }));

vi.mock("swr", () => ({
  default: mocks.useSWR,
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  computers: { list: vi.fn() },
  sectors: { list: vi.fn() },
}));

const SECTORS: Sector[] = [
  { id_glpi: 1, nome: "Nutrição", entities_id: 2, unidade_slug: "hgvc", ativo: true, qtd_computadores: 2 },
];

function computer(over: Partial<Computer>): Computer {
  return {
    id: 1, patrimonio: "HGVC-001", hostname: "pc-01", setor_atual_id: 1,
    setor_alterado_em: null, criado_em: "2026-08-01T00:00:00Z", ativo: true,
    proxima_preventiva: null, hardware_score: null, hardware_nivel: null, hardware_detalhes: null,
    id_glpi_computer: null,
    ...over,
  };
}

function page(items: Computer[]): ComputerPage {
  return { items, page: 1, page_size: 10, total: items.length, total_pages: 1 };
}

function mockData(computers: ComputerPage) {
  mocks.useSWR.mockImplementation((key: unknown) => {
    if (key === "sectors") return { data: SECTORS };
    return { data: computers, mutate: vi.fn() };
  });
}

describe("ComputerList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra a próxima manutenção e '—' quando não tem", () => {
    mockData(page([
      computer({ id: 1, patrimonio: "PC-A", proxima_preventiva: "2027-03-01" }),
      computer({ id: 2, patrimonio: "PC-B", proxima_preventiva: null }),
    ]));
    render(<ComputerList />);

    expect(screen.getByText("2027-03-01")).toBeInTheDocument();
    const linhaB = screen.getByText("PC-B").closest("tr")!;
    expect(linhaB).toHaveTextContent("—");
  });

  it("mostra o score de saúde quando o PC foi sincronizado com o GLPI, e '—' quando não", () => {
    mockData(page([
      computer({ id: 1, patrimonio: "PC-A", hardware_score: 82, hardware_nivel: "bom", hardware_detalhes: ["RAM: 16GB (ótima)"] }),
      computer({ id: 2, patrimonio: "PC-B", hardware_score: null, hardware_nivel: null, hardware_detalhes: null }),
    ]));
    render(<ComputerList />);

    expect(screen.getByText("82")).toBeInTheDocument();
    const linhaB = screen.getByText("PC-B").closest("tr")!;
    expect(linhaB).toHaveTextContent("—");
  });

  it("esconde a coluna/filtro de Setor quando travado num setor", () => {
    mockData(page([computer({})]));
    const { rerender } = render(<ComputerList />);
    expect(screen.getByRole("columnheader", { name: /Setor/ })).toBeInTheDocument();

    rerender(<ComputerList setorId={1} />);
    expect(screen.queryByRole("columnheader", { name: /Setor/ })).not.toBeInTheDocument();
  });
});
