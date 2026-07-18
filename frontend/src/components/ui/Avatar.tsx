interface Props {
  nome: string;
  foto?: string | null;
  size?: number;
}

/** Foto do tecnico quando existe (GLPI ou upload do admin - ver
 * lib/technicians.ts), senao um circulo com a inicial do nome (fallback
 * que ja existia antes da foto, mantido pra quem ninguem cadastrou nada). */
export function Avatar({ nome, foto, size = 32 }: Props) {
  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data URI/GLPI, nao um asset local do Next
      <img
        src={foto}
        alt={nome}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid var(--linha)",
        }}
      />
    );
  }

  const initial = (nome || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--acento)",
        color: "var(--superficie)",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: size * 0.45,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}
