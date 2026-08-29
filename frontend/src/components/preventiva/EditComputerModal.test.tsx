import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Computer, Sector } from "@/lib/api";

import { EditComputerModal } from "./EditComputerModal";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/lib/api", () => ({
  computers: { update: mocks.update },
}));

const COMPUTER: Computer = {
  id: 7,
  patrimonio: "HGVC-001",
  hostname: "pc-01",
  setor_atual_id: 1,
  setor_alterado_em: null,
  criado_em: "2026-08-01T00:00:00Z",
  ativo: true,
  proxima_preventiva: null,
  hardware_score: null,
  hardware_nivel: null,
  hardware_detalhes: null,
  id_glpi_computer: null,
};

const SECTORS: Sector[] = [
  { id_glpi: 1, nome: "Nutrição", entities_id: 2, unidade_slug: "hgvc", ativo: true, qtd_computadores: 1 },
  { id_glpi: 2, nome: "Recepção", entities_id: 12, unidade_slug: "upa", ativo: true, qtd_computadores: 0 },
];

describe("EditComputerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
  });

  it("mantém Salvar desabilitado até haver mudança e envia só o campo alterado", async () => {
    const onDone = vi.fn();
    render(<EditComputerModal computer={COMPUTER} sectors={SECTORS} onClose={vi.fn()} onDone={onDone} />);

    const salvar = screen.getByRole("button", { name: "Salvar" });
    expect(salvar).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Hostname/), { target: { value: "pc-99" } });
    expect(salvar).toBeEnabled();

    fireEvent.click(salvar);
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledWith(7, { hostname: "pc-99" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("transfere de setor: escolhe a unidade primeiro, depois o setor dela", async () => {
    render(<EditComputerModal computer={COMPUTER} sectors={SECTORS} onClose={vi.fn()} onDone={vi.fn()} />);

    // setor atual (Nutrição) é da HGVC - só ele aparece antes de trocar a unidade
    expect(screen.queryByRole("option", { name: /Recepção/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Unidade"), { target: { value: "upa" } });
    fireEvent.change(screen.getByLabelText("Setor"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledWith(7, { setor_atual_id: 2 }));
  });

  it("desativa o computador enviando ativo=false", async () => {
    render(<EditComputerModal computer={COMPUTER} sectors={SECTORS} onClose={vi.fn()} onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Desativar computador" }));
    expect(screen.getByRole("button", { name: "Reativar computador" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledWith(7, { ativo: false }));
  });
});
