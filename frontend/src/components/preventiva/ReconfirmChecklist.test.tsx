import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReconfirmChecklist } from "./ReconfirmChecklist";

const ITEMS = [
  { id: 1, tipo: "reconfirmacao" as const, texto: "Item A", secao: null, ordem: 0, ativo: true },
  { id: 2, tipo: "reconfirmacao" as const, texto: "Item B", secao: null, ordem: 1, ativo: true },
];

const mocks = vi.hoisted(() => ({ reconfirm: vi.fn(), useSWR: vi.fn() }));

vi.mock("swr", () => ({ default: mocks.useSWR }));

vi.mock("@/lib/api", () => ({
  cycles: { reconfirm: mocks.reconfirm },
  checklistItems: { list: vi.fn() },
}));

describe("ReconfirmChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconfirm.mockResolvedValue({});
    mocks.useSWR.mockImplementation(() => ({ data: ITEMS }));
  });

  it("mantém o botão desabilitado até todos os itens serem marcados", () => {
    render(<ReconfirmChecklist cycleId={1} itemId={2} onClose={vi.fn()} onDone={vi.fn()} />);

    const submit = screen.getByRole("button", { name: "Confirmar reconfirmação" });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Item A" }));
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Todos os itens precisam estar marcados/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Item B" }));
    expect(submit).toBeEnabled();
  });

  it("envia todas as marcas como true e chama onDone", async () => {
    const onDone = vi.fn();
    render(<ReconfirmChecklist cycleId={1} itemId={2} onClose={vi.fn()} onDone={onDone} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Item A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Item B" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reconfirmação" }));

    await vi.waitFor(() => expect(mocks.reconfirm).toHaveBeenCalled());
    const marcas = mocks.reconfirm.mock.calls[0][2];
    expect(marcas).toEqual({ "Item A": true, "Item B": true });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("mostra estado vazio quando o catálogo não tem item ativo", () => {
    mocks.useSWR.mockImplementation(() => ({ data: [] }));
    render(<ReconfirmChecklist cycleId={1} itemId={2} onClose={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByText(/Nenhum item de reconfirmação configurado/)).toBeInTheDocument();
  });
});
