interface Props {
  pct: number;
  height?: number;
  color?: string;
  trackColor?: string;
  transition?: string;
}

/** Trilho + preenchimento animado - ranking race e sub-scores do perfil de
 * tecnico usam a mesma barra, so mudando altura/cor/transicao. */
export function Bar({
  pct,
  height = 18,
  color = "var(--acento)",
  trackColor = "var(--acento-suave)",
  transition = "width 0.4s ease",
}: Props) {
  return (
    <span style={{ position: "relative", display: "block", flex: 1, height, background: trackColor }}>
      <span style={{ position: "absolute", inset: 0, width: `${pct}%`, background: color, transition }} />
    </span>
  );
}
