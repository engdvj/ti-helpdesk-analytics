import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminApi } from "@/lib/api";
import { CompetencyModule } from "./CompetencyModule";

const mocks = vi.hoisted(() => ({
  mutateCatalog: vi.fn().mockResolvedValue(undefined),
  mutateMatrix: vi.fn().mockResolvedValue(undefined),
  mutateTechnician: vi.fn().mockResolvedValue(undefined),
}));

const activity = {
  id: 10,
  nome: "Impressoras",
  descricao: "Diagnóstico e configuração",
  tipo: "hardware" as const,
  escopo_tipo_campo: "texto_longo" as const,
  escopo_opcoes: [],
  escopo_valor: "Diagnóstico e configuração",
  ordem: 0,
  ativa: true,
  situacoes: [{
    id: 20,
    atividade_id: 10,
    nome: "Impressora sem comunicação",
    contexto: "A estação não encontra a impressora.",
    procedimento_esperado: "Validar IP, rede, fila e driver; testar e registrar.",
    procedimento_tipo_campo: "texto_longo" as const,
    procedimento_opcoes: [],
    procedimento_valor: "Validar IP, rede, fila e driver; testar e registrar.",
    pontos_maximos: 4,
    tipo_campo: "escala" as const,
    opcoes: [],
    ordem: 0,
    ativa: true,
  }],
};

vi.mock("swr", () => ({
  default: (key: [string, unknown] | null) => {
    if (!key) return { data: undefined, mutate: vi.fn() };
    if (key[0] === "competency-catalog") return { data: [activity], mutate: mocks.mutateCatalog };
    if (key[0] === "competency-activity-types") return {
      data: [{ id: 1, slug: "hardware", nome: "Hardware", descricao: "Equipamentos", cor: "#d5ad64", ordem: 0, ativa: true }],
      mutate: vi.fn().mockResolvedValue(undefined),
    };
    if (key[0] === "competency-matrix") return {
      data: [{
        users_id: 7,
        nome: "Ana Silva",
        username: "ana",
        papel: "plantonista",
        unidade_slug: null,
        foto: null,
        pontos: 2,
        pontos_maximos: 4,
        percentual: 50,
        situacoes_avaliadas: 1,
        situacoes_total: 1,
        nivel: "em_desenvolvimento",
      }],
      mutate: mocks.mutateMatrix,
    };
    if (key[0] === "competency-technician") return {
      data: {
        users_id: 7,
        nome: "Ana Silva",
        username: "ana",
        papel: "plantonista",
        unidade_slug: null,
        foto: null,
        pontos: 2,
        pontos_maximos: 4,
        percentual: 50,
        situacoes_avaliadas: 1,
        situacoes_total: 1,
        nivel: "em_desenvolvimento",
        atividades: [{
          id: 10,
          nome: "Impressoras",
          descricao: "Diagnóstico e configuração",
          escopo_tipo_campo: "texto_longo" as const,
          escopo_opcoes: [],
          escopo_valor: "Diagnóstico e configuração",
          pontos: 2,
          pontos_maximos: 4,
          percentual: 50,
          situacoes_avaliadas: 1,
          situacoes_total: 1,
          situacoes: [{
            id: 20,
            nome: "Impressora sem comunicação",
            contexto: "A estação não encontra a impressora.",
            procedimento_esperado: "Validar IP, rede, fila e driver; testar e registrar.",
            procedimento_tipo_campo: "texto_longo" as const,
            procedimento_opcoes: [],
            procedimento_valor: "Validar IP, rede, fila e driver; testar e registrar.",
            pontos_maximos: 4,
            tipo_campo: "escala" as const,
            opcoes: [],
            pontos: 2,
            avaliada: true,
            ultima_avaliacao: {
              id: 30,
              users_id: 7,
              situacao_id: 20,
              pontos: 2,
              resposta: null,
              evidencia: "Executou com orientação",
              observacao: null,
              avaliado_por: "admin",
              avaliado_em: "2026-07-18T15:00:00Z",
            },
          }],
        }],
      },
      mutate: mocks.mutateTechnician,
    };
    return { data: undefined, mutate: vi.fn() };
  },
}));

vi.mock("@/lib/admin-context", () => ({
  useAdmin: () => ({
    isAdmin: true,
    credentials: { username: "admin", password: "secret" },
  }),
}));

describe("CompetencyModule", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mutateCatalog.mockClear();
    mocks.mutateMatrix.mockClear();
    mocks.mutateTechnician.mockClear();
  });

  it("separa situação, procedimento, evidência e pontos na matriz", async () => {
    const assess = vi.spyOn(adminApi, "assessCompetency").mockResolvedValue({
      id: 31,
      users_id: 7,
      situacao_id: 20,
      pontos: 4,
      resposta: null,
      evidencia: "Executou sozinho",
      observacao: null,
      avaliado_por: "admin",
      avaliado_em: "2026-07-18T16:00:00Z",
    });
    render(<CompetencyModule />);

    expect(screen.getByText("Atividade → situação → procedimento → evidência → pontos")).toBeInTheDocument();
    expect(screen.getAllByText("Ana Silva").length).toBeGreaterThan(0);
    expect(screen.getByText("Impressora sem comunicação")).toBeInTheDocument();
    expect(screen.getByText("Executou com orientação")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reavaliar" }));
    fireEvent.change(screen.getByLabelText("Pontos em Impressora sem comunicação"), { target: { value: "4" } });
    fireEvent.change(screen.getByPlaceholderText(/executou sozinho em chamado/i), { target: { value: "Executou sozinho" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar avaliação" }));

    await waitFor(() => expect(assess).toHaveBeenCalledWith(
      expect.objectContaining({ users_id: 7, situacao_id: 20, pontos: 4, evidencia: "Executou sozinho" }),
      { username: "admin", password: "secret" },
    ));
    expect(mocks.mutateTechnician).toHaveBeenCalled();
    expect(mocks.mutateMatrix).toHaveBeenCalled();
  });

  it("oferece o catálogo editável como uma visão própria", () => {
    render(<CompetencyModule />);
    fireEvent.click(screen.getByRole("button", { name: "Catálogo e critérios" }));

    expect(screen.getByText("Catálogo de atividades e situações")).toBeInTheDocument();
    expect(screen.getByText("Impressoras")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expandir Impressoras" }));
    expect(screen.getByText("Impressora sem comunicação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova atividade" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova situação" })).toBeInTheDocument();
  });

  it("configura tipos, filtros e campos de opções no catálogo", () => {
    render(<CompetencyModule />);
    fireEvent.click(screen.getByRole("button", { name: "Catálogo e critérios" }));

    expect(screen.getByRole("searchbox", { name: "Buscar no catálogo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar atividades por tipo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ordenar atividades" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gerenciar tipos" }));
    expect(screen.getByText("Tipos de atividade")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo tipo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nova atividade" }));
    expect(screen.getByLabelText(/Tipo da atividade/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Formato do campo/)).toHaveValue("texto_longo");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Expandir Impressoras" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova situação" }));
    fireEvent.change(screen.getByLabelText(/Tipo de avaliação/), { target: { value: "radio" } });

    expect(screen.getByText("Opções e pontuação")).toBeInTheDocument();
    expect(screen.getByLabelText("Opção 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Opção 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar opção" })).toBeInTheDocument();
  });
});
