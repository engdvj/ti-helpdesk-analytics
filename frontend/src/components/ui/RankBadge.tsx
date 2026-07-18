const MEDAL_COLORS = ["var(--ouro)", "var(--prata)", "var(--bronze)"];

interface Props {
  rank: number | null;
}

/** Selo numerado de posicao no ranking - cores de medalha pros 3 primeiros,
 * neutro pros demais. */
export function RankBadge({ rank }: Props) {
  const medalColor = rank == null ? undefined : MEDAL_COLORS[rank - 1];
  return (
    <span
      style={{
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "0.7rem",
        fontWeight: 700,
        background: medalColor ?? "var(--superficie)",
        color: medalColor ? "var(--medalha-texto)" : "var(--apagado)",
        border: "1px solid var(--linha)",
        flexShrink: 0,
      }}
    >
      {rank ?? "—"}
    </span>
  );
}
