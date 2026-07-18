import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryDifficultyPanel } from "./CategoryDifficultyPanel";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateGlobal: vi.fn(),
  useSWR: vi.fn(),
}));

const rows = [
  {
    itilcategories_id: 38,
    categoria_pai: "Tecnologia da Informação > Impressoras",
    categoria_nome: "Impressora comum",
    categoria_completa: "Tecnologia da Informação > Impressoras > Impressora comum",
    n_chamados: 34,
    resolucao_media_h: 2.5,
    sugestao_automatica: 0.8,
    override: null,
    dificuldade_atual: 0.8,
  },
  {
    itilcategories_id: 130,
    categoria_pai: "Tecnologia da Informação",
    categoria_nome: "Impressoras",
    categoria_completa: "Tecnologia da Informação > Impressoras",
    n_chamados: 0,
    resolucao_media_h: null,
    sugestao_automatica: 1,
    override: null,
    dificuldade_atual: 1,
  },
];

vi.mock("swr", () => ({
  default: mocks.useSWR,
  useSWRConfig: () => ({ mutate: mocks.mutateGlobal }),
}));

vi.mock("@/lib/admin-context", () => ({
  useAdmin: () => ({ credentials: { username: "admin", password: "secret" } }),
}));

vi.mock("@/lib/api", () => ({
  adminApi: { setCategoryDifficulty: vi.fn() },
  categoryDifficulty: { list: vi.fn() },
}));

describe("CategoryDifficultyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutate.mockResolvedValue(undefined);
    mocks.useSWR.mockReturnValue({
      data: rows,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: mocks.mutate,
    });
  });

  it("revalida ao abrir e informa quantas categorias existem", () => {
    render(<CategoryDifficultyPanel />);

    expect(screen.getByText(/cadastradas/i)).toHaveTextContent("2 cadastradas · 1 com chamados");
    expect(screen.getByText("Impressora comum")).toBeInTheDocument();
    expect(mocks.useSWR.mock.calls[0][2]).toMatchObject({ revalidateOnMount: true, dedupingInterval: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(mocks.mutate).toHaveBeenCalledOnce();
  });
});
