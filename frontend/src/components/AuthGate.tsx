"use client";

import { Suspense, type ReactNode } from "react";

import { Header } from "@/components/Header";
import { LoginForm } from "@/components/LoginForm";
import { useSession } from "@/lib/session-context";
import { SnapshotProvider } from "@/lib/snapshot-context";
import { UnitProvider } from "@/lib/unit-context";

/** Gate unico pro dashboard inteiro (ver layout.tsx). Sem sessao valida, a
 * tela de login e a unica coisa na pagina - nada de navbar/marca por cima
 * (o LoginForm ja se identifica). O Header (marca, escopo, menu do usuario)
 * so aparece depois de autenticado.
 *
 * UnitProvider/SnapshotProvider moraram aqui DENTRO (nao em volta do
 * AuthGate, em layout.tsx) de proposito: os dois disparam fetch autenticado
 * assim que montam (useEffect/useSWR direto, sem esperar ninguem). Se
 * ficassem acima do gate, montavam mesmo sem sessao pronta - o efeito deles
 * roda ANTES do efeito de restauracao de sessao (React dispara efeitos de
 * baixo pra cima), entao a 1a chamada saia sem token e a tela piscava
 * "sessao ausente" mesmo com uma sessao valida no sessionStorage. Nascendo
 * so depois de isAuthenticated=true, o token ja esta setado antes do 1o
 * fetch. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) return null;
  if (!isAuthenticated) return <LoginForm />;
  return (
    <UnitProvider>
      <SnapshotProvider>
        <Suspense fallback={null}>
          <Header />
        </Suspense>
        {children}
      </SnapshotProvider>
    </UnitProvider>
  );
}
