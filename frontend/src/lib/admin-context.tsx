"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { adminApi, type AdminCredentials } from "./api";

const STORAGE_KEY = "ti-analytics-admin-credentials";

interface AdminState {
  isAdmin: boolean;
  credentials: AdminCredentials | null;
  unlock: (username: string, password: string) => Promise<boolean>;
  lock: () => void;
}

const AdminContext = createContext<AdminState | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  // Comeca sempre null (mesmo se sessionStorage tiver credencial salva) e so
  // le depois de montar - mesmo motivo do "mounted" gate em ThemeToggle.tsx:
  // SSR nunca ve sessionStorage, ler direto no useState quebraria hidratacao.
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setCredentials(JSON.parse(raw));
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  async function unlock(username: string, password: string): Promise<boolean> {
    const creds: AdminCredentials = { username, password };
    try {
      await adminApi.verify(creds);
    } catch {
      return false;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    setCredentials(creds);
    return true;
  }

  function lock() {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setCredentials(null);
  }

  return (
    <AdminContext.Provider value={{ isAdmin: credentials != null, credentials, unlock, lock }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminState {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin() precisa estar dentro de <AdminProvider>");
  return ctx;
}
