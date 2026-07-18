import type { ButtonHTMLAttributes, CSSProperties } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primario" | "secundario" | "destrutivo";
}

const VARIANTS: Record<string, CSSProperties> = {
  primario: { background: "var(--acento)", color: "var(--superficie)", borderColor: "var(--acento)", fontWeight: 600 },
  secundario: { background: "var(--superficie)", color: "var(--tinta)" },
  destrutivo: { background: "transparent", color: "var(--critico)", borderColor: "var(--critico)" },
};

/** Botao de acao - primeira vez que essa tela (form de admin) precisou de
 * mais de um estilo de botao coerente (entrar/salvar/restaurar/sair). */
export function Botao({ variant = "secundario", style, disabled, ...rest }: Props) {
  return (
    <button
      disabled={disabled}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fonte-label)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "0.55rem 1rem",
        border: "1px solid var(--linha)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...VARIANTS[variant],
        ...style,
      }}
      {...rest}
    />
  );
}
