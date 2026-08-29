import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExecutionChecklist } from "./ExecutionChecklist";

const ITEMS = [
  { id: 1, tipo: "execucao" as const, texto: "Item A", secao: null, ordem: 0, ativo: true },
  { id: 2, tipo: "execucao" as const, texto: "Item B", secao: null, ordem: 1, ativo: true },
];

const mocks = vi.hoisted(() => ({ execute: vi.fn(), useSWR: vi.fn() }));

vi.mock("swr", () => ({ default: mocks.useSWR }));

vi.mock("@/lib/api", () => ({
  cycles: { execute: mocks.execute },
  checklistItems: { list: vi.fn() },
}));

function markAllItemsOk() {
  ITEMS.forEach(({ texto }) => {
    const group = screen.getByRole("radiogroup", { name: texto });
    fireEvent.click(within(group).getByRole("radio", { name: "OK" }));
  });
}

function goToTab(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("ExecutionChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({});
    mocks.useSWR.mockImplementation(() => ({ data: ITEMS }));
  });

  it("bloqueia finalizar sem todos os itens marcados e sem resultado", () => {
    render(<ExecutionChecklist cycleId={1} itemId={2} onClose={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Finalizar atendimento" })).toBeDisabled();
  });

  it("libera finalizar com resultado 'sem_achado' sem exigir chamado/pendência", () => {
    render(<ExecutionChecklist cycleId={1} itemId={2} onClose={vi.fn()} onDone={vi.fn()} />);
    markAllItemsOk();

    goToTab("Resultado");
    fireEvent.change(screen.getByLabelText("Resultado do atendimento"), { target: { value: "sem_achado" } });

    expect(screen.queryByLabelText(/Chamado GLPI/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar atendimento" })).toBeEnabled();
  });

  it("exige chamado GLPI + pendência com responsável e prazo para 'corretiva_aberta'", () => {
    render(<ExecutionChecklist cycleId={1} itemId={2} onClose={vi.fn()} onDone={vi.fn()} />);
    markAllItemsOk();

    goToTab("Resultado");
    fireEvent.change(screen.getByLabelText("Resultado do atendimento"), { target: { value: "corretiva_aberta" } });

    const finalizar = screen.getByRole("button", { name: "Finalizar atendimento" });
    expect(finalizar).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Chamado GLPI/), { target: { value: "12345" } });
    expect(finalizar).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Pendência — responsável/), { target: { value: "João" } });
    expect(finalizar).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Pendência — prazo/), { target: { value: "2026-09-10" } });
    expect(finalizar).toBeEnabled();
  });

  it("salvar rascunho não exige nada preenchido", async () => {
    const onDone = vi.fn();
    render(<ExecutionChecklist cycleId={1} itemId={2} onClose={vi.fn()} onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));

    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledWith(1, 2, expect.objectContaining({ rascunho: true })));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("modo somente leitura desabilita os campos e não mostra botões de salvar", () => {
    const existingItem = {
      id: 2, ciclo_id: 1, computador_id: 1, tecnico_id: 2, prioridade: "normal" as const,
      status: "concluido" as const, data_agendada: "2026-09-01",
      reconfirmacao_itens: [], execucao_itens: [{ item: "Item A", status: "ok" as const, observacao: "" }],
      execucao_status: "finalizado" as const, resultado: "sem_achado" as const, resumo: null,
      chamado_glpi: null, pendencia_responsavel: null, pendencia_prazo: null,
      ponto_focal_nome: null, ponto_focal_data: null, proxima_preventiva: null,
      motivo_remarcacao: null, criado_em: "2026-08-28T00:00:00Z",
    };
    render(<ExecutionChecklist cycleId={1} itemId={2} existingItem={existingItem} readOnly onClose={vi.fn()} onDone={vi.fn()} />);

    const group = screen.getByRole("radiogroup", { name: "Item A" });
    expect(within(group).getByRole("radio", { name: "OK" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Finalizar atendimento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar rascunho" })).not.toBeInTheDocument();
  });
});
