import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CycleItem } from "@/lib/api";

import { CycleItemRow } from "./CycleItemRow";

vi.mock("@/lib/api", () => ({ cycles: { removeItem: vi.fn() } }));
vi.mock("./ExecutionChecklist", () => ({ ExecutionChecklist: () => null }));
vi.mock("./ReconfirmChecklist", () => ({ ReconfirmChecklist: () => null }));
vi.mock("./RescheduleModal", () => ({ RescheduleModal: () => null }));
vi.mock("./ScheduleItemModal", () => ({ ScheduleItemModal: () => null }));

function item(over: Partial<CycleItem>): CycleItem {
  return {
    id: 1, ciclo_id: 1, computador_id: 1, tecnico_id: 9, prioridade: "normal",
    status: "confirmado", data_agendada: "2026-09-10",
    reconfirmacao_itens: [{ item: "x", ok: true }],
    execucao_itens: null, execucao_status: null, resultado: null, resumo: null,
    chamado_glpi: null, pendencia_responsavel: null, pendencia_prazo: null,
    ponto_focal_nome: null, ponto_focal_data: null, proxima_preventiva: null,
    motivo_remarcacao: null, criado_em: "2026-09-01T00:00:00Z",
    ...over,
  };
}

function renderRow(props: Partial<Parameters<typeof CycleItemRow>[0]>) {
  return render(
    <table><tbody>
      <CycleItemRow
        item={item({})}
        patrimonio="PC-1"
        tecnicoNome="Fulano"
        souGestor={false}
        meuUserId={null}
        onChanged={vi.fn()}
        {...props}
      />
    </tbody></table>,
  );
}

describe("CycleItemRow — autorização", () => {
  it("gestor vê Executar, Remarcar e Tirar do ciclo", () => {
    renderRow({ souGestor: true });
    expect(screen.getByRole("button", { name: /Executar preventiva/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remarcar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tirar PC-1 do ciclo/ })).toBeInTheDocument();
  });

  it("técnico do item executa/remarca o item dele, mas não tira do ciclo", () => {
    renderRow({ souGestor: false, meuUserId: 9 });
    expect(screen.getByRole("button", { name: /Executar preventiva/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remarcar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tirar PC-1 do ciclo/ })).not.toBeInTheDocument();
  });

  it("técnico de outro item não vê nenhuma ação", () => {
    renderRow({ souGestor: false, meuUserId: 42 });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("item planejado: só o gestor agenda", () => {
    renderRow({ souGestor: false, meuUserId: 9, item: item({ status: "planejado", data_agendada: null }) });
    expect(screen.queryByRole("button", { name: /Agendar/ })).not.toBeInTheDocument();

    renderRow({ souGestor: true, item: item({ status: "planejado", data_agendada: null }) });
    expect(screen.getByRole("button", { name: /Agendar/ })).toBeInTheDocument();
  });

  it("item finalizado: gestor edita, técnico só visualiza", () => {
    const finalizado = item({ status: "concluido" });
    renderRow({ souGestor: true, item: finalizado });
    expect(screen.getByRole("button", { name: "Editar checklist" })).toBeInTheDocument();

    renderRow({ souGestor: false, meuUserId: 9, item: finalizado });
    expect(screen.getByRole("button", { name: "Ver checklist" })).toBeInTheDocument();
  });
});
