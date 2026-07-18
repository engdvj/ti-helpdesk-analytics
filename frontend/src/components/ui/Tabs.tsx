interface Tab {
  key: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

/** Abas com indicador de borda inferior - navegacao principal do dashboard e
 * abas de detalhe do perfil de tecnico usam o mesmo padrao visual. */
export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--linha)" }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            padding: "0.6rem 1rem",
            background: "none",
            border: "none",
            borderBottom: active === t.key ? "2px solid var(--acento)" : "2px solid transparent",
            color: active === t.key ? "var(--acento)" : "var(--apagado)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fonte-label)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
