import type { ReactNode } from "react";

interface Props {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** Botao de filtro toggle (papel do tecnico, granularidade do snapshot...) -
 * preenchido quando ativo, transparente quando nao. */
export function FilterChip({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        fontSize: "var(--fonte-label)",
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "0.3rem 0.6rem",
        border: "1px solid var(--linha)",
        background: active ? "var(--acento-suave)" : "transparent",
        color: active ? "var(--acento)" : "var(--apagado)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
