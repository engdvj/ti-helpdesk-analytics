"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { DEFAULT_RAW_METRIC_KEY, useMetric } from "@/lib/metric-context";
import { useScoreMode } from "@/lib/score-mode-context";
import { useUnitOptional } from "@/lib/unit-context";

/** Equipe/Metas so tem efeito em score_geral e score_qualidade (ver
 * scores.py) - ordenando por uma metrica bruta (chamados, resposta média...)
 * o toggle vira enganoso, porque o numero exibido nao muda com o modo. Nesse
 * caso "Métricas" assume como terceiro estado ativo, e clicar em Equipe/Metas
 * volta a ordenacao pra Score geral (reativando o modo escolhido de verdade). */
export function ScoreModeSwitcher() {
  const unit = useUnitOptional();
  const { scoreMode, setScoreMode } = useScoreMode();
  const { metric, setMetricKey } = useMetric();

  if (!unit) return null;

  const isMetricMode = !metric.modeDependent;

  function activate(mode: "equipe" | "metas") {
    setScoreMode(mode);
    if (isMetricMode) setMetricKey("score_geral");
  }

  return (
    <div className="score-mode-switcher" style={{ display: "flex", gap: "0.35rem" }} aria-label="Modo de análise do score">
      <FilterChip active={!isMetricMode && scoreMode === "equipe"} onClick={() => activate("equipe")}>
        Equipe
      </FilterChip>
      <FilterChip active={!isMetricMode && scoreMode === "metas"} onClick={() => activate("metas")}>
        Metas
      </FilterChip>
      <FilterChip active={isMetricMode} onClick={() => setMetricKey(DEFAULT_RAW_METRIC_KEY)}>
        Métricas
      </FilterChip>
    </div>
  );
}
