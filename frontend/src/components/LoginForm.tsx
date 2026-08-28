"use client";

import { KeyRound, Trophy, User, UserRound, Users } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Botao } from "@/components/ui/Botao";
import { useSession } from "@/lib/session-context";

const FEATURES = [
  { icon: Trophy, label: "Ranking da equipe em tempo real" },
  { icon: UserRound, label: "Perfil individual por técnico" },
  { icon: Users, label: "Avaliação de competências entre pares" },
];

/** Login unico pra tecnico ou admin - o backend decide qual e qual
 * (POST /auth/login, ver api/app/routers/auth.py). Usado pelo AuthGate
 * (ver layout.tsx) pra gatear o dashboard inteiro - e a unica coisa na tela
 * quando nao ha sessao, sem Header por cima. */
export function LoginForm() {
  const { login } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await login(username, password);
    setLoading(false);
    if (!ok) setError("Usuário ou senha incorretos.");
  }

  return (
    <main className="auth-screen">
      <div className="auth-hero-panel">
        <div className="auth-hero">
          <h1>
            <span>TI</span> Analytics
          </h1>
          <ul className="auth-hero-features">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon size={16} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-login-panel">
        <div className="auth-card sumula-cartao">
          <span className="sumula-carimbo">TI Analytics</span>
          <form onSubmit={submit}>
            <label className="auth-field">
              <User size={16} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuário"
                autoFocus
                autoComplete="username"
              />
            </label>
            <label className="auth-field">
              <KeyRound size={16} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                autoComplete="current-password"
              />
            </label>
            {error && <p className="auth-card-error">{error}</p>}
            <Botao type="submit" variant="primario" disabled={loading || !username || !password}>
              {loading ? "Verificando..." : "Entrar"}
            </Botao>
          </form>
          <div className="auth-card-units">
            <span className="auth-unit-tag">HGVC</span>
            <span className="auth-unit-tag">UPA</span>
          </div>
        </div>
      </div>
    </main>
  );
}
