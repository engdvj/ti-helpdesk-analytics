"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { GRANULARIDADE_OPTIONS, useGranularidade } from "@/lib/granularidade-context";
import { useUnitOptional } from "@/lib/unit-context";

/** So aparece dentro de /u/[slug]/... - granularidade nao significa nada no
 * hub (lista de unidades). */
export function GranularidadeSwitcher() {
  const unit = useUnitOptional();
  const { granularidade, setGranularidade } = useGranularidade();

  if (!unit) return null;

  return (
    <div style={{ display: "flex", gap: "0.35rem" }}>
      {GRANULARIDADE_OPTIONS.map((opt) => (
        <FilterChip key={opt.key} active={granularidade === opt.key} onClick={() => setGranularidade(opt.key)}>
          {opt.label}
        </FilterChip>
      ))}
    </div>
  );
}
