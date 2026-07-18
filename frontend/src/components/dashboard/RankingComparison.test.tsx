import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { TechSnapshot } from "@/lib/api";

import { RankingComparison } from "./RankingComparison";

const snapshots = [1, 2, 3].map((seq) => ({
  snapshot_seq: seq,
  users_id: 1,
  periodo_ref: `2026-07-0${seq}`,
  nome_completo: "João Pedro",
  username: "joao",
  papel: "plantonista",
  score_geral: 60 + seq,
  chamados_resolvidos: seq,
  n_categorias: 1,
  resposta_media_min: 20,
  elegivel: true,
  score_mode: "equipe",
})) as TechSnapshot[];

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="comparison-chart" data-point-count={data.length} />
  ),
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ title, children }: { title: ReactNode; children: ReactNode }) => <section>{title}{children}</section>,
}));

vi.mock("@/lib/cumulativo-context", () => ({
  useCumulativo: () => ({ cumulativo: false }),
}));

vi.mock("@/lib/metric-context", () => ({
  metricValue: (snapshot: TechSnapshot) => snapshot.score_geral,
  useMetric: () => ({
    metric: {
      key: "score_geral",
      label: "Score geral",
      higherIsBetter: true,
      format: (value: number) => value.toFixed(1),
    },
  }),
}));

vi.mock("@/lib/score-mode-context", () => ({
  useScoreMode: () => ({ scoreMode: "equipe" }),
}));

vi.mock("@/lib/snapshot-context", () => ({
  useSnapshots: () => ({
    data: snapshots,
    seqs: [1, 2, 3],
    snapshotSeq: 3,
    dataInicio: "2026-07-01",
    dataFim: "2026-07-03",
  }),
}));

vi.mock("@/lib/technicians", () => ({
  useTechnicians: () => ({ data: [] }),
  resolveTechnicianDisplay: () => ({ nome: "João Pedro", foto: null, unidadeSlug: null }),
}));

vi.mock("@/lib/units", () => ({
  useUnits: () => ({ data: [] }),
  unitDisplayName: () => "Complexo inteiro",
}));

vi.mock("@/lib/use-popout-window", () => ({
  usePopoutWindow: () => ({ container: null, blocked: true, retry: vi.fn() }),
}));

describe("RankingComparison", () => {
  it("mantem todos os pontos do recorte mesmo no modo individual", () => {
    render(<RankingComparison selectedIds={[1]} onRemove={vi.fn()} onClear={vi.fn()} />);

    expect(screen.getByTestId("comparison-chart")).toHaveAttribute("data-point-count", "3");
    expect(screen.getByText("3 pontos visíveis")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /início do recorte/i })).toHaveAttribute("aria-valuetext", "01/07/2026");

    fireEvent.change(screen.getByRole("slider", { name: /início do recorte/i }), { target: { value: "1" } });

    expect(screen.getByTestId("comparison-chart")).toHaveAttribute("data-point-count", "2");
    expect(screen.getByText("2 pontos visíveis")).toBeInTheDocument();
  });
});
