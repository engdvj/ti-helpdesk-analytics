"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { AdminCredentials } from "./api";

const STORAGE_KEY = "ti-analytics-admin-credentials";

interface AdminState {
  isAdmin: boolean;
  credentials: AdminCredentials | null;
  setCredentials: (creds: AdminCredentials | null) => void;
}

const AdminContext = createContext<AdminState | null>(null);

/** So guarda a credencial (usuario/senha) usada nos headers das mutacoes do
 * painel admin (`require_admin` no backend, independente do token de
 * sessao). Quem decide QUANDO essa credencial existe e o SessionProvider
 * (session-context.tsx) - login como admin la chama `setCredentials` aqui
 * na hora (nao so grava no sessionStorage), por isso o layout.tsx precisa
 * envolver <SessionProvider> DENTRO de <AdminProvider>. Sem isso, /admin
 * pedia login de novo mesmo com sessao de admin valida (o useEffect abaixo
 * so le o sessionStorage 1x, no mount - nao pega login que aconteceu depois). */
export function AdminProvider({ children }: { children: ReactNode }) {
  // Comeca sempre null (mesmo se sessionStorage tiver credencial salva) e so
  // le depois de montar - mesmo motivo do "mounted" gate em ThemeToggle.tsx:
  // SSR nunca ve sessionStorage, ler direto no useState quebraria hidratacao.
  // Isso cobre o caso de F5 no meio da sessao (sessionStorage sobrevive,
  // setCredentials nao seria rechamado).
  const [credentials, setCredentialsState] = useState<AdminCredentials | null>(null);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setCredentialsState(JSON.parse(raw));
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  function setCredentials(creds: AdminCredentials | null) {
    if (creds) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    else window.sessionStorage.removeItem(STORAGE_KEY);
    setCredentialsState(creds);
  }

  return (
    <AdminContext.Provider value={{ isAdmin: credentials != null, credentials, setCredentials }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminState {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin() precisa estar dentro de <AdminProvider>");
  return ctx;
}
