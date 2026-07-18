import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricProvider, useMetric } from "./metric-context";
import { ScoreModeProvider, useScoreMode } from "./score-mode-context";

function Harness() {
  const { metric, setMetricKey } = useMetric();
  const { scoreMode, setScoreMode } = useScoreMode();
  return (
    <>
      <span>{scoreMode}</span>
      <span>{metric.key}</span>
      <button onClick={() => setMetricKey("chamados_resolvidos")}>Usar chamados</button>
      <button onClick={() => setScoreMode("metas")}>Usar metas</button>
    </>
  );
}

describe("ScoreModeProvider", () => {
  it("volta para score geral ao trocar a forma de calculo", () => {
    render(
      <MetricProvider>
        <ScoreModeProvider>
          <Harness />
        </ScoreModeProvider>
      </MetricProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Usar chamados" }));
    expect(screen.getByText("chamados_resolvidos")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Usar metas" }));
    expect(screen.getByText("metas")).toBeInTheDocument();
    expect(screen.getByText("score_geral")).toBeInTheDocument();
  });
});
