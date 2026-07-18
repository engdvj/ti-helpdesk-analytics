"use client";

import useSWR from "swr";

import { units as unitsApi, type Unit } from "./api";

export function useUnits() {
  return useSWR<Unit[]>("units", () => unitsApi.list());
}

export function unitDisplayName(slug: string | null | undefined, units: Unit[] | undefined): string {
  if (!slug) return "Complexo inteiro";
  return units?.find((unit) => unit.slug === slug)?.nome ?? slug;
}
