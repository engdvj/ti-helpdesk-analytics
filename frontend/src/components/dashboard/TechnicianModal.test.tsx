import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TechSnapshot } from "@/lib/api";
import { TechnicianModal } from "./TechnicianModal";

const contextMocks = vi.hoisted(() => ({
  setCumulativo: vi.fn(),
  setGranularidade: vi.fn(),
  setScoreMode: vi.fn(),
  setSnapshotSeq: vi.fn(),
  resetPeriodRange: vi.fn(),
}));

const selectedSnapshot = {
  users_id: 7,
  nome_completo: "João Pedro",
  username: "joao",
  papel: "plantonista",
  chamados_resolvidos: 12.5,
  chamados_atendidos: 13,
  dias_ativos_periodo: 5,
  volume_por_dia: 2.5,
  abrangencia_ratio: 6 / 13,
  urgencia_media: 4,
  n_categorias: 6,
  resposta_media_min: 18,
  resolucao_media_h: 3,
  complexidade_categoria_media: 1.1,
  resposta_qualidade_media: 72,
  score_volume: 60,
  score_complexidade: 62,
  score_velocidade_resposta: 63,
  score_abrangencia: 64,
  score_qualidade: 65,
  score_geral: 42.5,
  confianca: 0.8,
  nivel_evidencia: "alta",
  rank: 2,
  elegivel: true,
  score_mode: "equipe",
  snapshot_seq: 3,
  periodo_ref: "2026-07-17",
  granularidade: "diaria",
  cumulativo: false,
} satisfies TechSnapshot;

const competencyDetail = {
  users_id: 7,
  nome: "João Pedro",
  username: "joao",
  papel: "plantonista",
  unidade_slug: null,
  foto: null,
  pontos: 5,
  pontos_maximos: 9,
  percentual: 55.6,
  situacoes_avaliadas: 2,
  situacoes_total: 3,
  nivel: "em_desenvolvimento",
  atividades: [
    {
      id: 1,
      nome: "Impressoras",
      descricao: "Diagnóstico e configuração de impressão",
      escopo_tipo_campo: "texto_longo",
      escopo_opcoes: [],
      escopo_valor: "Diagnóstico e configuração de impressão",
      pontos: 5,
      pontos_maximos: 6,
      percentual: 83.3,
      situacoes_avaliadas: 2,
      situacoes_total: 2,
      situacoes: [
        {
          id: 11,
          nome: "Impressora sem comunicação",
          contexto: "A estação não encontra a impressora de rede.",
          procedimento_esperado: "Validar IP, conectividade, fila e driver.",
          procedimento_tipo_campo: "texto_longo",
          procedimento_opcoes: [],
          procedimento_valor: "Validar IP, conectividade, fila e driver.",
          pontos_maximos: 4,
          tipo_campo: "escala",
          opcoes: [],
          pontos: 4,
          avaliada: true,
          ultima_avaliacao: {
            id: 101,
            users_id: 7,
            situacao_id: 11,
            pontos: 4,
            resposta: null,
            evidencia: "Executou diagnóstico e correção sem apoio.",
            observacao: "Boa validação final.",
            avaliado_por: "admin",
            avaliado_em: "2026-07-18T15:00:00Z",
          },
        },
        {
          id: 12,
          nome: "Fila de impressão travada",
          contexto: "Documentos permanecem presos na fila.",
          procedimento_esperado: "Diagnosticar a causa, limpar o spooler e testar.",
          procedimento_tipo_campo: "texto_longo",
          procedimento_opcoes: [],
          procedimento_valor: "Diagnosticar a causa, limpar o spooler e testar.",
          pontos_maximos: 2,
          tipo_campo: "escala",
          opcoes: [],
          pontos: 1,
          avaliada: true,
          ultima_avaliacao: {
            id: 102,
            users_id: 7,
            situacao_id: 12,
            pontos: 1,
            resposta: null,
            evidencia: "Concluiu com orientação.",
            observacao: null,
            avaliado_por: "admin",
            avaliado_em: "2026-07-18T16:00:00Z",
          },
        },
      ],
    },
    {
      id: 2,
      nome: "Redes",
      descricao: "Conectividade local",
      escopo_tipo_campo: "texto_longo",
      escopo_opcoes: [],
      escopo_valor: "Conectividade local",
      pontos: 0,
      pontos_maximos: 3,
      percentual: 0,
      situacoes_avaliadas: 0,
      situacoes_total: 1,
      situacoes: [{
        id: 21,
        nome: "Ponto de rede sem conexão",
        contexto: "A estação está sem acesso à rede.",
        procedimento_esperado: "Validar camada física, VLAN, DHCP e conectividade.",
        procedimento_tipo_campo: "texto_longo",
        procedimento_opcoes: [],
        procedimento_valor: "Validar camada física, VLAN, DHCP e conectividade.",
        pontos_maximos: 3,
        tipo_campo: "escala",
        opcoes: [],
        pontos: 0,
        avaliada: false,
        ultima_avaliacao: null,
      }],
    },
  ],
};

vi.mock("swr", () => ({
  default: (key: [string, ...unknown[]] | null) => key?.[0] === "competency-technician" ? ({
    data: competencyDetail,
    error: undefined,
    isLoading: false,
  }) : ({
    data: {
      atual: { ...selectedSnapshot, score_geral: 99 },
      historico: [],
      chamados_recentes: [],
      habilidades: {
        por_categoria: [
          {
            itilcategories_id: 5, nome: "Hardware", chamados: 6, qualidade_media: 88,
            resolucao_media_h: 2.1, taxa_reabertura: 0, complexidade_media: 4.2,
            habilidade_score: 88, classificacao: "ponto_forte",
          },
          {
            itilcategories_id: 9, nome: "Wi-Fi", chamados: 4, qualidade_media: 40,
            resolucao_media_h: 5.5, taxa_reabertura: 0.25, complexidade_media: 3.5,
            habilidade_score: 34, classificacao: "gap",
          },
        ],
        por_complexidade: [
          { faixa: "baixa", chamados: 3, qualidade_media: 90, resolucao_media_h: 1.2 },
          { faixa: "media", chamados: 4, qualidade_media: 75, resolucao_media_h: 2.5 },
          { faixa: "alta", chamados: 0, qualidade_media: null, resolucao_media_h: null },
        ],
      },
      detalhes_snapshot: {
        categorias: [
          { itilcategories_id: 5, nome: "Hardware", credito: 2, chamados: 2 },
          { itilcategories_id: 9, nome: "Wi-Fi", credito: 1.5, chamados: 1 },
        ],
        chamados: [
          { tickets_id: 101, credito: 1 },
          { tickets_id: 102, credito: 0.5 },
        ],
        tempos_resposta: [
          { tickets_id: 101, minutos: 10 },
          { tickets_id: 102, minutos: 26 },
        ],
      },
    },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("@/lib/technicians", () => ({
  useTechnicians: () => ({ data: [] }),
  resolveTechnicianDisplay: (_usersId: number, fallbackNome: string) => ({ nome: fallbackNome, foto: null, unidadeSlug: null }),
}));

vi.mock("@/lib/units", () => ({
  useUnits: () => ({ data: [] }),
  unitDisplayName: () => "Complexo inteiro",
}));

vi.mock("@/lib/cumulativo-context", () => ({
  useCumulativo: () => ({ cumulativo: false, setCumulativo: contextMocks.setCumulativo }),
}));

vi.mock("@/lib/granularidade-context", () => ({
  GRANULARIDADE_OPTIONS: [
    { key: "diaria", label: "Diário" },
    { key: "semanal", label: "Semanal" },
    { key: "mensal", label: "Mensal" },
  ],
  useGranularidade: () => ({ granularidade: "diaria", setGranularidade: contextMocks.setGranularidade }),
}));

vi.mock("@/lib/score-mode-context", () => ({
  useScoreMode: () => ({ scoreMode: "equipe", setScoreMode: contextMocks.setScoreMode }),
}));

vi.mock("@/lib/snapshot-context", () => ({
  useSnapshots: () => ({
    data: undefined,
    seqs: [3],
    snapshotSeq: 3,
    setSnapshotSeq: contextMocks.setSnapshotSeq,
    resetPeriodRange: contextMocks.resetPeriodRange,
  }),
}));

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

describe("TechnicianModal resumo", () => {
  it("usa exatamente o snapshot selecionado, nao o ultimo retornado pelo perfil", () => {
    render(<TechnicianModal snapshot={selectedSnapshot} onClose={vi.fn()} />);

    expect(screen.getByText("42.5")).toBeInTheDocument();
    expect(screen.queryByText("99.0")).not.toBeInTheDocument();
    expect(screen.getByText("Individual")).toBeInTheDocument();
    expect(screen.getByText("Diário")).toBeInTheDocument();
    expect(screen.getByText("17/07/2026")).toBeInTheDocument();

    const scoreTile = screen.getByRole("button", { name: /42.5 score relativo à equipe/i });
    expect(scoreTile.parentElement).toHaveStyle({ gridTemplateColumns: "repeat(2, 1fr)" });
    expect(scoreTile.parentElement?.children).toHaveLength(4);
  });

  it("remove as medias pedidas e explica os cards", () => {
    render(<TechnicianModal snapshot={selectedSnapshot} onClose={vi.fn()} />);

    expect(screen.queryByText("Urgência média")).not.toBeInTheDocument();
    expect(screen.queryByText("Resolução média (h)")).not.toBeInTheDocument();
    expect(screen.getByText("Chamados creditados")).toBeInTheDocument();

    const categoryTile = screen.getByRole("button", { name: /6 categorias distintas/i });
    fireEvent.click(categoryTile);
    const categoryDetails = screen.getByRole("region", { name: "Detalhes de Categorias distintas" });
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.getByText("2 chamados")).toBeInTheDocument();
    expect(screen.getByText("1 chamado")).toBeInTheDocument();
    expect(Array.from(categoryDetails.querySelectorAll("dt"), (item) => item.textContent)).toEqual(["Hardware", "Wi-Fi"]);

    fireEvent.click(screen.getByRole("button", { name: "Ordenar nomes de Z a A" }));
    expect(Array.from(categoryDetails.querySelectorAll("dt"), (item) => item.textContent)).toEqual(["Wi-Fi", "Hardware"]);

    fireEvent.click(screen.getByRole("button", { name: /18 min resposta média/i }));
    expect(screen.queryByText("Hardware")).not.toBeInTheDocument();
    expect(screen.getByText("10 min")).toBeInTheDocument();
    expect(screen.getByText("26 min")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Ordenar/ })).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: /chamados creditados/i }));
    expect(screen.getByText("#101")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Ordenar/ })).toHaveLength(4);
  });

  it("abre e fecha as notas e explica a diferença para o resultado bruto", () => {
    render(<TechnicianModal snapshot={selectedSnapshot} onClose={vi.fn()} />);

    const scoreTile = screen.getByRole("button", { name: /42.5 score relativo à equipe/i });
    let tileRect = {
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 400,
      bottom: 160,
      width: 300,
      height: 60,
      toJSON: () => ({}),
    };
    vi.spyOn(scoreTile, "getBoundingClientRect").mockImplementation(() => tileRect);
    expect(screen.queryByRole("region", { name: "Detalhes de Score relativo à equipe" })).not.toBeInTheDocument();
    fireEvent.click(scoreTile);

    const details = screen.getByRole("region", { name: "Detalhes de Score relativo à equipe" });
    expect(details).toHaveClass("is-score-breakdown", "is-portaled");
    expect(details).toHaveStyle({ left: "410px", top: "100px" });
    expect(scoreTile).toHaveClass("is-open");
    expect(details).toHaveTextContent("Créditos");
    expect(details).toHaveTextContent("Qualidade da resposta");
    expect(details).toHaveTextContent("Nota relativa");
    expect(details).toHaveTextContent("50 pts = média da equipe");
    expect(details).toHaveTextContent("Resultado: 12,5 créditos (2,5/dia)");
    expect(details).not.toHaveTextContent("Confiança alta");
    expect(screen.getAllByRole("button", { name: /^Ordenar/ })).toHaveLength(4);
    expect(scoreTile).toHaveAttribute("aria-expanded", "true");

    tileRect = { ...tileRect, x: 400, left: 400, right: 700 };
    act(() => window.dispatchEvent(new Event("sumula-modal-move")));
    expect(details).toHaveStyle({ left: "710px" });

    fireEvent.click(scoreTile);
    expect(screen.queryByRole("region", { name: "Detalhes de Score relativo à equipe" })).not.toBeInTheDocument();
    expect(scoreTile).toHaveAttribute("aria-expanded", "false");
    expect(scoreTile).not.toHaveClass("is-open");
  });

  it("permite alterar os quatro recortes dentro do modal", () => {
    render(<TechnicianModal snapshot={selectedSnapshot} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Individual" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Alterar período" }), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Alterar granularidade" }), { target: { value: "semanal" } });
    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));

    expect(contextMocks.setCumulativo).toHaveBeenNthCalledWith(1, true);
    expect(contextMocks.setCumulativo).toHaveBeenLastCalledWith(false);
    expect(contextMocks.setSnapshotSeq).toHaveBeenLastCalledWith(3);
    expect(contextMocks.setGranularidade).toHaveBeenLastCalledWith("semanal");
    expect(contextMocks.resetPeriodRange).toHaveBeenCalledOnce();
    expect(contextMocks.setScoreMode).toHaveBeenLastCalledWith("metas");
  });

  it("monta um retrato individual baseado somente nas competências avaliadas", () => {
    render(<TechnicianModal snapshot={selectedSnapshot} onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "historico" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "indicadores" }));

    expect(screen.getByText("56%")).toBeInTheDocument();
    expect(screen.getByText("Em desenvolvimento")).toBeInTheDocument();
    expect(screen.getByText("1 competência demonstrada")).toBeInTheDocument();
    expect(screen.getByText("Cobertura do mapa")).toBeInTheDocument();
    expect(screen.getByText("Próxima ação")).toBeInTheDocument();
    expect(screen.getByText("Demonstradas")).toBeInTheDocument();
    expect(screen.getAllByText("Em evolução").length).toBeGreaterThan(0);
    expect(screen.getByText("Não avaliadas")).toBeInTheDocument();
    expect(screen.queryByText("Por complexidade")).not.toBeInTheDocument();
    expect(screen.queryByText("Hardware")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Redes.*0%/i }));
    expect(screen.getByText("Situações de Redes")).toBeInTheDocument();
    expect(screen.getAllByText("Ponto de rede sem conexão").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Não avaliada").length).toBeGreaterThan(0);
  });

  it("mostra critério e evidência apenas ao detalhar uma situação", () => {
    render(<TechnicianModal snapshot={selectedSnapshot} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "indicadores" }));

    const summary = screen.getByText("Impressora sem comunicação").closest("summary");
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(screen.getAllByText("Critério esperado").length).toBeGreaterThan(0);
    expect(screen.getByText("Validar IP, conectividade, fila e driver.")).toBeInTheDocument();
    expect(screen.getAllByText("Evidência registrada").length).toBeGreaterThan(0);
    expect(screen.getByText("Executou diagnóstico e correção sem apoio.")).toBeInTheDocument();
    expect(screen.getByText("Boa validação final.")).toBeInTheDocument();
  });
});
