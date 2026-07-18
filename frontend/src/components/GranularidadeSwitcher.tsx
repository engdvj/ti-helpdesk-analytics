"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { useCumulativo } from "@/lib/cumulativo-context";
import { GRANULARIDADE_OPTIONS, useGranularidade } from "@/lib/granularidade-context";
import { useSnapshots } from "@/lib/snapshot-context";
import { useUnitOptional } from "@/lib/unit-context";

/** So aparece dentro de /u/[slug]/... - granularidade nao significa nada no
 * hub (lista de unidades). */
export function GranularidadeSwitcher() {
  const unit = useUnitOptional();
  const { granularidade, setGranularidade } = useGranularidade();
  const { cumulativo, setCumulativo } = useCumulativo();
  const { resetPeriodRange } = useSnapshots();

  if (!unit) return null;

  return (
    <div className="granularity-switcher" style={{ display: "flex", gap: "0.35rem" }}>
      {GRANULARIDADE_OPTIONS.map((opt) => (
        <FilterChip
          key={opt.key}
          active={!cumulativo && granularidade === opt.key}
          onClick={() => {
            setGranularidade(opt.key);
            setCumulativo(false);
            resetPeriodRange();
          }}
        >
          {opt.label}
        </FilterChip>
      ))}
    </div>
  );
}
