"use client";

import { Shield, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAdmin } from "@/lib/admin-context";

export function AdminLink() {
  const { isAdmin } = useAdmin();
  // Header fica dentro de <Suspense> em layout.tsx, mas AdminProvider fica
  // por fora - o efeito que le sessionStorage pode rodar antes do Header
  // (adiado pelo Suspense) hidratar, e ai o 1o render client already veria
  // isAdmin=true enquanto o server sempre renderiza bloqueado. Gate local
  // (mesmo padrao do ThemeToggle) garante que o 1o render aqui bate com o
  // HTML do servidor - o "destrava" real so acontece depois de montar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const unlocked = mounted && isAdmin;

  return (
    <Link
      href="/admin"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fonte-label)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: unlocked ? "var(--acento)" : "var(--apagado)",
        textDecoration: "none",
      }}
    >
      {unlocked ? <ShieldCheck size={15} /> : <Shield size={15} />}
      Admin
    </Link>
  );
}
