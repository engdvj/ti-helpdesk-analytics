import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Header } from "./Header";

const navigation = vi.hoisted(() => ({ pathname: "/u/geral/dashboard" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/components/UnitSwitcher", () => ({ UnitSwitcher: () => <span data-testid="unit" /> }));
vi.mock("@/components/GranularidadeSwitcher", () => ({ GranularidadeSwitcher: () => <span data-testid="granularity" /> }));
vi.mock("@/components/PeriodRangePicker", () => ({ PeriodRangePicker: () => <span data-testid="range" /> }));
vi.mock("@/components/ScoreModeSwitcher", () => ({ ScoreModeSwitcher: () => <span data-testid="score-mode" /> }));
vi.mock("@/components/MetricSwitcher", () => ({ MetricSwitcher: () => <span data-testid="metric" /> }));
vi.mock("@/components/SnapshotPlayback", () => ({ SnapshotPlayback: () => <span data-testid="playback" /> }));
vi.mock("@/components/AdminLink", () => ({ AdminLink: () => <span data-testid="admin" /> }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => <span data-testid="theme" /> }));

describe("Header", () => {
  afterEach(() => cleanup());

  it("agrupa escopo, periodo, analise e linha do tempo", () => {
    navigation.pathname = "/u/geral/dashboard";
    render(<Header />);

    const period = screen.getByRole("region", { name: "Período da análise" });
    expect(within(period).getByTestId("granularity")).toBeInTheDocument();
    expect(within(period).getByTestId("range")).toBeInTheDocument();

    const analysis = screen.getByRole("region", { name: "Critério da análise" });
    expect(within(analysis).getByTestId("score-mode")).toBeInTheDocument();
    expect(within(analysis).getByTestId("metric")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Linha do tempo" })).getByTestId("playback")).toBeInTheDocument();
  });

  it("mantem somente a faixa principal fora do dashboard", () => {
    navigation.pathname = "/admin";
    render(<Header />);

    expect(screen.queryByRole("region", { name: "Período da análise" })).not.toBeInTheDocument();
    expect(screen.getByTestId("admin")).toBeInTheDocument();
    expect(screen.getByTestId("theme")).toBeInTheDocument();
  });
});
