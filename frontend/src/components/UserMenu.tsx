"use client";

import { ChevronDown, LogOut, Moon, ShieldCheck, Sun, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { authApi } from "@/lib/api";
import { useAdmin } from "@/lib/admin-context";
import { useSession } from "@/lib/session-context";
import { applyTheme, resolveActiveTheme, type Theme } from "@/lib/theme";

/** Um so ponto de acesso no Header pra identidade, tema e sair - antes eram
 * 3 pecas soltas (SessionStatus + AdminLink + ThemeToggle) que nao se liam
 * como uma coisa so. Tambem e onde o tecnico troca a propria senha
 * (`POST /auth/change-password`, ja existia no backend sem nenhuma tela). */
export function UserMenu() {
  const { isAuthenticated, subjectType, nomeCompleto, logout } = useSession();
  const { isAdmin } = useAdmin();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Mesmo gate de hidratacao usado em AdminLink/ThemeToggle/SessionStatus -
  // SSR nunca ve sessionStorage nem o tema salvo, entao o 1o render aqui tem
  // que bater com o HTML do servidor (sempre "nao logado").
  useEffect(() => {
    setMounted(true);
    setTheme(resolveActiveTheme());
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setChangingPassword(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!mounted || !isAuthenticated) return null;

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  function handleLogout() {
    setOpen(false);
    logout();
  }

  const label = subjectType === "admin" ? "Admin" : nomeCompleto ?? "Técnico";

  return (
    <div ref={ref} className="user-menu">
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Menu do usuário"
      >
        <User size={14} />
        <span>{label}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="user-menu-panel">
          <div className="user-menu-identity">
            <strong>{label}</strong>
            <small>{subjectType === "admin" ? "Administrador" : "Técnico"}</small>
          </div>

          <button type="button" className="user-menu-item" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Tema claro" : "Tema escuro"}
          </button>

          {isAdmin && (
            <Link href="/admin" className="user-menu-item" onClick={() => setOpen(false)}>
              <ShieldCheck size={14} />
              Painel admin
            </Link>
          )}

          {subjectType === "tecnico" && (
            <>
              <button
                type="button"
                className="user-menu-item"
                onClick={() => setChangingPassword((v) => !v)}
              >
                <User size={14} />
                Trocar minha senha
              </button>
              {changingPassword && <ChangePasswordForm onDone={() => setChangingPassword(false)} />}
            </>
          )}

          <button type="button" className="user-menu-item is-destructive" onClick={handleLogout}>
            <LogOut size={14} />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await authApi.changePassword(senhaAtual, senhaNova);
      setOk(true);
      setSenhaAtual("");
      setSenhaNova("");
      setTimeout(onDone, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="user-menu-password-form" onSubmit={submit}>
      <input
        type="password"
        value={senhaAtual}
        onChange={(e) => setSenhaAtual(e.target.value)}
        placeholder="Senha atual"
        autoComplete="current-password"
        required
      />
      <input
        type="password"
        value={senhaNova}
        onChange={(e) => setSenhaNova(e.target.value)}
        placeholder="Nova senha"
        autoComplete="new-password"
        minLength={4}
        required
      />
      {error && <small className="user-menu-password-error">{error}</small>}
      {ok && <small className="user-menu-password-ok">Senha alterada.</small>}
      <button type="submit" disabled={saving || senhaAtual.length === 0 || senhaNova.length < 4}>
        {saving ? "Salvando..." : "Confirmar"}
      </button>
    </form>
  );
}
