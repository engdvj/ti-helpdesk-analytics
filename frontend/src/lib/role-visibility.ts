"use client";

import useSWR from "swr";

import { adminApi, type RoleVisibility, type Technician } from "./api";

const SWR_KEY = "role-visibility";

export function useRoleVisibility() {
  return useSWR<RoleVisibility>(SWR_KEY, () => adminApi.getRoleVisibility());
}

/** Na ausencia da configuracao (carregando ou API indisponivel), somente a
 * populacao-base aparece. Isso evita um flash de papeis que o admin ocultou. */
export function isRoleVisible(papel: Technician["papel"], visibility?: RoleVisibility): boolean {
  if (papel === "plantonista") return visibility?.mostrar_plantonistas ?? true;
  if (papel === "tatico") return visibility?.mostrar_taticos ?? false;
  return visibility?.mostrar_coordenacao ?? false;
}
