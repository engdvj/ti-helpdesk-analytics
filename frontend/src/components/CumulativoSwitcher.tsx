"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { useCumulativo } from "@/lib/cumulativo-context";
import { useUnitOptional } from "@/lib/unit-context";

/** So aparece dentro de /u/[slug]/... - ortogonal a granularidade: acumulado
 * soma tudo desde o inicio, individual mostra so o balde de tempo isolado
 * (diario individual e ruidoso no volume atual - aviso documentado em
 * snapshot.py, nao escondido aqui). */
export function CumulativoSwitcher() {
  const unit = useUnitOptional();
  const { cumulativo, setCumulativo } = useCumulativo();

  if (!unit) return null;

  return (
    <div style={{ display: "flex", gap: "0.35rem" }}>
      <FilterChip active={cumulativo} onClick={() => setCumulativo(true)}>
        Acumulado
      </FilterChip>
      <FilterChip active={!cumulativo} onClick={() => setCumulativo(false)}>
        Individual
      </FilterChip>
    </div>
  );
}
