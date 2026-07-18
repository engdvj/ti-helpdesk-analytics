"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi, type ScoreWeights } from "@/lib/api";
import { SCORE_LABELS } from "@/lib/score";

export default function AdminPage() {
  const { isAdmin, lock } = useAdmin();

  if (!isAdmin) return <LoginForm />;

  return (
    <main className="sumula-container-media" style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600 }}>Admin</h1>
        <Botao variant="destrutivo" onClick={lock}>
          Sair do modo admin
        </Botao>
      </div>

      <ColetaPanel />
      <div style={{ height: "1.5rem" }} />
      <WeightsPanel />
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.6rem 0.75rem",
  border: "1.5px solid var(--linha)",
  background: "var(--superficie)",
  color: "var(--tinta)",
  fontSize: "var(--fonte-corpo)",
};

function LoginForm() {
  const { unlock } = useAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await unlock(username, password);
    setLoading(false);
    if (!ok) setError("Usuário ou senha incorretos.");
  }

  return (
    <main className="sumula-container-estreita" style={{ flex: 1 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600, marginBottom: "1.25rem" }}>
        Entrar como admin
      </h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuário"
          autoFocus
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          autoComplete="current-password"
          style={inputStyle}
        />
        {error && <p style={{ color: "var(--critico)", fontSize: "var(--fonte-label)" }}>{error}</p>}
        <Botao type="submit" variant="primario" disabled={loading || !username || !password}>
          {loading ? "Verificando..." : "Entrar"}
        </Botao>
      </form>
    </main>
  );
}

function ColetaPanel() {
  const { credentials } = useAdmin();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<{ status: string; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!credentials) return;
    setState("running");
    setError(null);
    try {
      const res = await adminApi.collect(credentials);
      setResult(res);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  return (
    <section className="sumula-cartao" style={{ padding: "1.25rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-h)", fontWeight: 600, marginBottom: "0.5rem" }}>
        Coleta
      </h2>
      <p style={{ color: "var(--apagado)", fontSize: "var(--fonte-corpo)", marginBottom: "1rem" }}>
        Dispara GLPI → raw → silver → gold → scores sob demanda. Síncrono - no volume atual leva
        minutos, não horas.
      </p>
      <Botao variant="primario" onClick={run} disabled={state === "running"}>
        {state === "running" ? "Rodando..." : "Rodar coleta"}
      </Botao>
      {state === "done" && result && (
        <p style={{ color: "var(--acento)", marginTop: "0.75rem", fontFamily: "var(--font-mono)", fontSize: "var(--fonte-dados)" }}>
          OK — {Object.entries(result.counts).map(([k, v]) => `${k}: ${v}`).join(", ")}
        </p>
      )}
      {state === "error" && <p style={{ color: "var(--critico)", marginTop: "0.75rem" }}>{error}</p>}
    </section>
  );
}

function WeightsPanel() {
  const { credentials } = useAdmin();
  const { data, mutate } = useSWR("admin-weights", () => adminApi.getWeights());
  const [draft, setDraft] = useState<ScoreWeights | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weights = draft ?? data;
  if (!weights) return <p style={{ color: "var(--apagado)" }}>Carregando pesos...</p>;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const somaOk = Math.abs(total - 1) <= 0.01;

  function setField(key: keyof ScoreWeights, value: number) {
    setDraft({ ...(weights as ScoreWeights), [key]: value });
  }

  async function save() {
    if (!credentials || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await adminApi.setWeights(draft, credentials);
      await mutate(saved, { revalidate: false });
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      const reverted = await adminApi.resetWeights(credentials);
      await mutate(reverted, { revalidate: false });
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sumula-cartao" style={{ padding: "1.25rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-h)", fontWeight: 600, marginBottom: "0.5rem" }}>
        Pesos do score
      </h2>
      <p style={{ color: "var(--apagado)", fontSize: "var(--fonte-corpo)", marginBottom: "1rem" }}>
        Precisam somar 1.00. Julgamento de design documentado em <code>scores.py</code> - mudar aqui
        também some com o histórico como base de comparação (afeta score de todo mundo no próximo
        recompute, que roda sob demanda).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1rem" }}>
        {SCORE_LABELS.map(({ key, label }) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr 90px", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "var(--fonte-corpo)" }}>{label}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={weights[key]}
              onChange={(e) => setField(key, Number(e.target.value))}
              style={{
                padding: "0.4rem 0.5rem",
                border: "1.5px solid var(--linha)",
                background: "var(--superficie)",
                color: "var(--tinta)",
                fontFamily: "var(--font-mono)",
                textAlign: "right",
              }}
            />
          </div>
        ))}
      </div>

      <p style={{ color: somaOk ? "var(--apagado)" : "var(--critico)", fontSize: "var(--fonte-label)", marginBottom: "1rem" }}>
        Soma: {total.toFixed(2)} {!somaOk && "(precisa ser 1.00)"}
      </p>

      {error && <p style={{ color: "var(--critico)", fontSize: "var(--fonte-label)", marginBottom: "0.75rem" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Botao variant="primario" onClick={save} disabled={saving || !somaOk || !draft}>
          Salvar
        </Botao>
        <Botao variant="secundario" onClick={reset} disabled={saving}>
          Restaurar padrão
        </Botao>
      </div>
    </section>
  );
}
