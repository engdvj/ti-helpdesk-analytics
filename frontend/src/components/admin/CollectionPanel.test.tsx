import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionPanel } from "./CollectionPanel";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  mutateLocal: vi.fn(),
  mutateGlobal: vi.fn(),
  useSWR: vi.fn(),
  data: null as unknown,
}));

const completedRun = {
  id: "run-success",
  status: "success",
  requested_by: "admin",
  // Reproduz o formato sem timezone que o SQLite devolvia antes da correcao.
  requested_at: "2026-07-18T20:57:25",
  started_at: "2026-07-18T15:00:02Z",
  finished_at: "2026-07-18T15:01:05Z",
  duration_seconds: 63,
  counts: { chamados_ti: 94, tecnicos: 13, unidades_ti: 3 },
  error: null,
  error_details: null,
};

vi.mock("swr", () => ({
  default: mocks.useSWR,
  useSWRConfig: () => ({ mutate: mocks.mutateGlobal }),
}));

vi.mock("@/lib/admin-context", () => ({
  useAdmin: () => ({ credentials: { username: "admin", password: "secret" } }),
}));

vi.mock("@/lib/api", () => ({
  adminApi: {
    collect: mocks.collect,
    listCollectionRuns: vi.fn(),
    getAutoCollect: vi.fn(),
    setAutoCollect: vi.fn(),
  },
}));

describe("CollectionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = {
      items: [completedRun],
      page: 1,
      page_size: 10,
      total: 11,
      total_pages: 2,
      active: null,
    };
    mocks.useSWR.mockImplementation(() => ({
      data: mocks.data,
      error: null,
      isLoading: false,
      mutate: mocks.mutateLocal,
    }));
    mocks.mutateLocal.mockResolvedValue(undefined);
    mocks.mutateGlobal.mockResolvedValue(undefined);
    mocks.collect.mockResolvedValue({ ...completedRun, id: "new-run", status: "queued" });
  });

  it("mostra historico paginado e expande todas as informacoes da execucao", () => {
    render(<CollectionPanel />);

    expect(screen.getByText("Concluída")).toBeInTheDocument();
    expect(screen.getByText("18/07/2026, 17:57:25")).toBeInTheDocument();
    expect(screen.getByText("94 chamados · 13 técnicos · 3 unidades")).toBeInTheDocument();
    expect(screen.getByText("11 coletas · página 1 de 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar detalhes da coleta" }));

    expect(screen.getByText("run-success")).toBeInTheDocument();
    expect(screen.getByText("Chamados de TI")).toBeInTheDocument();
    expect(screen.getAllByText("1min 03s")).toHaveLength(2);
  });

  it("reencontra uma coleta ativa e impede outra execucao simultanea", () => {
    mocks.data = {
      items: [],
      page: 1,
      page_size: 10,
      total: 0,
      total_pages: 1,
      active: { ...completedRun, id: "active-run", status: "running", finished_at: null, duration_seconds: null },
    };

    render(<CollectionPanel />);

    expect(screen.queryByRole("button", { name: "Coleta em andamento" })).not.toBeInTheDocument();
    expect(screen.getByText("Coleta sendo processada")).toBeInTheDocument();
    expect(screen.getByText("Executando em segundo plano")).toBeInTheDocument();
  });

  it("atualiza periodos e demais dados derivados quando a coleta termina", async () => {
    mocks.data = {
      items: [],
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1,
      active: { ...completedRun, id: "active-run", status: "running", finished_at: null, duration_seconds: null },
    };
    const { rerender } = render(<CollectionPanel />);

    mocks.data = {
      items: [completedRun],
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1,
      active: null,
    };
    rerender(<CollectionPanel />);

    await waitFor(() => expect(mocks.mutateGlobal).toHaveBeenCalled());
    const matcher = mocks.mutateGlobal.mock.calls.at(-1)?.[0] as (key: unknown) => boolean;
    expect(matcher(["snapshot-periods", "diaria"])).toBe(true);
    expect(matcher(["snapshots", "diaria"])).toBe(true);
    expect(matcher(["technicians", false])).toBe(true);
    expect(matcher("units")).toBe(true);
    expect(matcher("unrelated")).toBe(false);
  });

  it("exibe mensagem e diagnostico tecnico de uma falha", () => {
    mocks.data = {
      items: [{
        ...completedRun,
        id: "run-error",
        status: "error",
        counts: null,
        error: "RuntimeError: GLPI indisponível",
        error_details: "Traceback\nRuntimeError: GLPI indisponível",
      }],
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1,
      active: null,
    };

    render(<CollectionPanel />);

    expect(screen.getByText("Falhou")).toBeInTheDocument();
    expect(screen.getByText("RuntimeError: GLPI indisponível")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar detalhes da coleta" }));
    expect(screen.getByText(/Traceback/)).toBeInTheDocument();
  });

  it("inicia uma coleta e permite alterar ordenacao, filtro e pagina", async () => {
    render(<CollectionPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Rodar coleta" }));
    await waitFor(() => expect(mocks.collect).toHaveBeenCalledWith({ username: "admin", password: "secret" }));
    expect(mocks.mutateLocal).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Solicitada em" }));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "error" } });
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() => {
      // CollectionPanel nao e mais o unico consumidor de useSWR na arvore
      // (AutoCollectControl tambem chama, com a chave "auto-collect") -
      // procura a chamada com a chave que interessa em vez de assumir que
      // e a ultima.
      const collectionRunsKey = mocks.useSWR.mock.calls
        .map((call) => call[0])
        .findLast((key) => Array.isArray(key) && key[0] === "collection-runs");
      expect(collectionRunsKey).toEqual(["collection-runs", "admin", 2, 10, "requested_at", "asc", "error"]);
    });
  });
});
