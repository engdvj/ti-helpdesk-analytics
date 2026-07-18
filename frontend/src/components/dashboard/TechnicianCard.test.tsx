import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TechSnapshot } from "@/lib/api";
import { TechnicianCard } from "./TechnicianCard";

vi.mock("@/lib/technicians", () => ({
  useTechnicians: () => ({ data: [] }),
  resolveTechnicianDisplay: (_usersId: number, fallbackNome: string) => ({ nome: fallbackNome, foto: null, unidadeSlug: "hgvc" }),
}));

vi.mock("@/lib/units", () => ({
  useUnits: () => ({ data: [{ slug: "hgvc", nome: "HGVC" }] }),
  unitDisplayName: (slug: string | null) => slug === "hgvc" ? "HGVC" : "Complexo inteiro",
}));

vi.mock("@/lib/metric-context", () => ({
  useMetric: () => ({
    metric: {
      key: "score_qualidade",
      label: "Qualidade da resposta",
      higherIsBetter: true,
      modeDependent: true,
      format: (value: number) => value.toFixed(0),
    },
  }),
  metricValue: (snapshot: TechSnapshot) => snapshot.score_qualidade,
}));

const snapshot = {
  users_id: 8,
  nome_completo: "Bruna Bispo",
  username: "bruna",
  papel: "plantonista",
  chamados_resolvidos: 10,
  chamados_atendidos: 10,
  urgencia_media: 4,
  n_categorias: 5,
  resposta_media_min: 20,
  resolucao_media_h: 3,
  complexidade_categoria_media: 1,
  score_volume: 70,
  score_complexidade: 70,
  score_velocidade_resposta: 80,
  score_abrangencia: 75,
  score_qualidade: 100,
  score_geral: 82,
  confianca: 0.7,
  nivel_evidencia: "alta",
  rank: 1,
  snapshot_seq: 1,
  periodo_ref: "2026-07-18",
  granularidade: "diaria",
  cumulativo: false,
} satisfies TechSnapshot;

describe("TechnicianCard", () => {
  it("organiza posicao, identidade e metrica nessa ordem", () => {
    const onClick = vi.fn();
    render(<TechnicianCard snapshot={snapshot} rank={1} onClick={onClick} />);

    const card = screen.getByRole("button", { name: "Abrir perfil de Bruna Bispo" });
    const header = card.querySelector(".technician-profile-card-header");
    const metric = card.querySelector(".technician-profile-card-metric");

    expect(header?.children[0]).toHaveTextContent("1");
    expect(header?.children[2]).toHaveTextContent("Bruna Bispo");
    expect(header?.children[2]).toHaveTextContent("Plantonista");
    expect(header?.children[2]).toHaveTextContent("HGVC");
    expect(metric?.querySelector("span")).toHaveTextContent("Qualidade da resposta");
    expect(metric?.querySelector("strong")).toHaveTextContent("100");
    expect(metric?.querySelector(".technician-profile-card-progress > i")).toHaveStyle({ width: "100%" });

    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
