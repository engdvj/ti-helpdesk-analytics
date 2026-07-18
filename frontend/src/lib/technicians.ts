"use client";

import useSWR from "swr";

import { technicians as techniciansApi, type Technician } from "./api";

/** Catalogo ativo por padrao; o admin pede explicitamente tambem os inativos.
 * Cache compartilhado por corrida, perfis e modais para nome, foto e lotacao. */
export function useTechnicians({ includeInactive = false }: { includeInactive?: boolean } = {}) {
  return useSWR<Technician[]>(
    ["technicians", includeInactive],
    () => techniciansApi.list({ includeInactive }),
  );
}

export function resolveTechnicianDisplay(
  usersId: number,
  fallbackNome: string,
  list: Technician[] | undefined,
): { nome: string; foto: string | null; unidadeSlug: string | null } {
  const tech = list?.find((t) => t.users_id === usersId);
  return {
    nome: tech?.nome_exibicao || fallbackNome,
    foto: tech?.foto ?? null,
    unidadeSlug: tech?.unidade_slug ?? null,
  };
}
