import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncAllPanel } from "./SyncAllPanel";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  syncSectors: vi.fn(),
  syncComputers: vi.fn(),
  mutateGlobal: vi.fn(),
}));

vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: mocks.mutateGlobal }) }));
vi.mock("@/lib/admin-context", () => ({
  useAdmin: () => ({ credentials: { username: "admin", password: "secret" } }),
}));
vi.mock("@/lib/api", () => ({
  adminApi: { collect: mocks.collect, syncSectors: mocks.syncSectors, syncComputers: mocks.syncComputers },
}));

describe("SyncAllPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collect.mockResolvedValue({});
    mocks.syncSectors.mockResolvedValue({});
    mocks.syncComputers.mockResolvedValue({});
    mocks.mutateGlobal.mockResolvedValue(undefined);
  });

  it("dispara os 3 syncs e revalida os históricos", async () => {
    render(<SyncAllPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar tudo" }));

    await waitFor(() => {
      expect(mocks.collect).toHaveBeenCalledWith({ username: "admin", password: "secret" });
      expect(mocks.syncSectors).toHaveBeenCalled();
      expect(mocks.syncComputers).toHaveBeenCalled();
    });
    expect(screen.getByText(/Os 3 syncs foram disparados/)).toBeInTheDocument();

    const matcher = mocks.mutateGlobal.mock.calls.at(-1)?.[0] as (key: unknown) => boolean;
    expect(matcher(["collection-runs", "setores"])).toBe(true);
    expect(matcher("outra-coisa")).toBe(false);
  });

  it("segue disparando os demais quando um falha (já rodando)", async () => {
    mocks.syncSectors.mockRejectedValue(new Error("Já existe uma sincronização de setores em andamento."));
    render(<SyncAllPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar tudo" }));

    await waitFor(() => expect(screen.getByText(/Não iniciou: setores/)).toBeInTheDocument());
    expect(mocks.collect).toHaveBeenCalled();
    expect(mocks.syncComputers).toHaveBeenCalled();
  });
});
