import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncHistory } from "./SyncHistory";

const mocks = vi.hoisted(() => ({ useSWR: vi.fn(), data: null as unknown }));

vi.mock("swr", () => ({ default: mocks.useSWR }));
vi.mock("@/lib/admin-context", () => ({
  useAdmin: () => ({ credentials: { username: "admin", password: "secret" } }),
}));
vi.mock("@/lib/api", () => ({ adminApi: { listCollectionRuns: vi.fn() } }));

function run(over: Record<string, unknown> = {}) {
  return {
    id: "sync-1", status: "success", requested_by: "admin",
    requested_at: "2026-08-31T12:00:00Z", started_at: "2026-08-31T12:00:01Z",
    finished_at: "2026-08-31T12:00:05Z", duration_seconds: 4,
    counts: { setores_criados: 3, setores_atualizados: 104, setores_desativados: 1 },
    error: null, error_details: null, ...over,
  };
}

describe("SyncHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = { items: [run()], page: 1, page_size: 10, total: 1, total_pages: 1, active: null };
    mocks.useSWR.mockImplementation(() => ({ data: mocks.data, error: null, isLoading: false }));
  });

  it("resume o resultado de setores e expande as contagens", () => {
    render(
      <SyncHistory tipo="setores" title="Histórico" description="d" noun={{ singular: "sincronização", plural: "sincronizações" }} />,
    );

    expect(screen.getByText("Concluída")).toBeInTheDocument();
    expect(screen.getByText("3 criados · 104 atualizados · 1 desativados")).toBeInTheDocument();
    expect(screen.getByText("1 sincronização · página 1 de 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar detalhes da sincronização" }));
    expect(screen.getByText("Setores criados")).toBeInTheDocument();
    expect(screen.getByText("sync-1")).toBeInTheDocument();
  });

  it("mostra a falha na coluna de resultado e o traceback ao expandir", () => {
    mocks.data = {
      items: [run({ id: "sync-err", status: "error", counts: null, error: "GlpiError: HTTP 400", error_details: "Traceback ..." })],
      page: 1, page_size: 10, total: 1, total_pages: 1, active: null,
    };
    render(
      <SyncHistory tipo="computadores" title="Histórico" description="d" noun={{ singular: "sincronização", plural: "sincronizações" }} />,
    );

    expect(screen.getByText("Falhou")).toBeInTheDocument();
    expect(screen.getByText("GlpiError: HTTP 400")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar detalhes da sincronização" }));
    expect(screen.getByText(/Traceback/)).toBeInTheDocument();
  });

  it("avisa o pai quando há execução ativa", async () => {
    mocks.data = {
      items: [], page: 1, page_size: 10, total: 0, total_pages: 1,
      active: run({ id: "ativa", status: "running", finished_at: null, duration_seconds: null }),
    };
    const onActiveChange = vi.fn();
    render(
      <SyncHistory tipo="setores" title="Histórico" description="d" noun={{ singular: "sincronização", plural: "sincronizações" }} onActiveChange={onActiveChange} />,
    );

    await waitFor(() => expect(onActiveChange).toHaveBeenCalledWith(expect.objectContaining({ id: "ativa" })));
  });
});
