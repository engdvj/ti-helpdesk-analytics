"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { authApi, setSessionToken, type SessionInfo, type SubjectType } from "./api";
import { useAdmin } from "./admin-context";

const STORAGE_KEY = "ti-analytics-session";

interface SessionState {
  isLoading: boolean;
  isAuthenticated: boolean;
  subjectType: SubjectType | null;
  usersId: number | null;
  nomeCompleto: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  // Precisa estar DENTRO de <AdminProvider> (ver layout.tsx) - login/logout
  // aqui repassam a credencial de admin pro AdminProvider na hora, pra
  // /admin nunca pedir login de novo com uma sessao de admin ja valida.
  const { setCredentials: setAdminCredentials } = useAdmin();
  // Comeca sempre null/loading e so le sessionStorage depois de montar - SSR
  // nunca ve sessionStorage, ler direto no useState quebraria hidratacao
  // (mesmo motivo do AdminProvider/ThemeToggle).
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setIsLoading(false);
      return;
    }
    let stored: SessionInfo;
    try {
      stored = JSON.parse(raw);
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
      setIsLoading(false);
      return;
    }
    setSessionToken(stored.token);
    authApi
      .me(stored.token)
      .then((fresh) => {
        setSession(fresh);
        setSessionToken(fresh.token);
      })
      .catch(() => {
        window.sessionStorage.removeItem(STORAGE_KEY);
        setSessionToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(username: string, password: string): Promise<boolean> {
    let info: SessionInfo;
    try {
      info = await authApi.login(username, password);
    } catch {
      return false;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    setSessionToken(info.token);
    setSession(info);
    if (info.subject_type === "admin") setAdminCredentials({ username, password });
    return true;
  }

  function logout() {
    if (session) authApi.logout(session.token).catch(() => {});
    window.sessionStorage.removeItem(STORAGE_KEY);
    setSessionToken(null);
    setSession(null);
    setAdminCredentials(null);
  }

  return (
    <SessionContext.Provider
      value={{
        isLoading,
        isAuthenticated: session != null,
        subjectType: session?.subject_type ?? null,
        usersId: session?.users_id ?? null,
        nomeCompleto: session?.nome_completo ?? null,
        login,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() precisa estar dentro de <SessionProvider>");
  return ctx;
}
