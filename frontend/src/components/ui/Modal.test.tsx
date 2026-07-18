import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

describe("Modal arrastavel", () => {
  it("respeita a largura e acompanha o arraste pelo cabecalho", () => {
    render(
      <Modal title="João Pedro" onClose={vi.fn()} maxWidth={440} draggable>
        <p>Conteúdo</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "João Pedro" });
    const handle = screen.getByRole("heading", { name: "João Pedro" }).parentElement!;
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      x: 300,
      y: 200,
      left: 300,
      top: 200,
      right: 700,
      bottom: 600,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });

    expect(dialog).toHaveStyle({ maxWidth: "440px" });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 350, clientY: 250 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 430, clientY: 290 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(dialog).toHaveStyle({ transform: "translate3d(80px, 40px, 0)" });
  });

  it("nao inicia o arraste pelo botao de fechar", () => {
    const onClose = vi.fn();
    render(
      <Modal title="João Pedro" onClose={onClose} draggable>
        <p>Conteúdo</p>
      </Modal>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("permite empilhar modais sem bloquear o dashboard", () => {
    render(
      <>
        <Modal title="João Pedro" onClose={vi.fn()} modeless initialOffset={{ x: 0, y: 0 }} zIndex={200}>
          <p>Primeiro</p>
        </Modal>
        <Modal title="Bruna Bispo" onClose={vi.fn()} modeless initialOffset={{ x: 24, y: 18 }} zIndex={201}>
          <p>Segundo</p>
        </Modal>
      </>,
    );

    const first = screen.getByRole("dialog", { name: "João Pedro" });
    const second = screen.getByRole("dialog", { name: "Bruna Bispo" });
    expect(first.parentElement).toHaveStyle({ pointerEvents: "none", zIndex: "200" });
    expect(second.parentElement).toHaveStyle({ pointerEvents: "none", zIndex: "201" });
    expect(first).toHaveStyle({ pointerEvents: "auto", transform: "translate3d(0px, 0px, 0)" });
    expect(second).toHaveStyle({ pointerEvents: "auto", transform: "translate3d(24px, 18px, 0)" });
  });
});
