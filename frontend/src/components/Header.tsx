"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GranularidadeSwitcher } from "@/components/GranularidadeSwitcher";
import { MetricSwitcher } from "@/components/MetricSwitcher";
import { PeriodRangePicker } from "@/components/PeriodRangePicker";
import { ScoreModeSwitcher } from "@/components/ScoreModeSwitcher";
import { SnapshotPlayback } from "@/components/SnapshotPlayback";
import { UnitSwitcher } from "@/components/UnitSwitcher";
import { UserMenu } from "@/components/UserMenu";

export function Header() {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/u/") ?? false;

  return (
    <header className={`app-header ${isDashboard ? "has-toolbar" : ""}`}>
      <div className="app-header-primary">
        <Link href="/" className="app-header-brand">
          <span>TI</span> Analytics
        </Link>

        {isDashboard && (
          <div className="app-header-scope">
            <span className="app-header-group-label">Escopo</span>
            <UnitSwitcher />
          </div>
        )}

        <div className="app-header-spacer" />
        <div className="app-header-actions">
          <UserMenu />
        </div>
      </div>

      {isDashboard && (
        <div className="app-header-toolbar">
          <section className="app-header-group app-header-period-group" aria-label="Período da análise">
            <span className="app-header-group-label">Período</span>
            <div className="app-header-group-controls">
              <GranularidadeSwitcher />
              <PeriodRangePicker />
            </div>
          </section>

          <section className="app-header-group app-header-analysis-group" aria-label="Critério da análise">
            <span className="app-header-group-label">Análise</span>
            <div className="app-header-group-controls">
              <ScoreModeSwitcher />
              <MetricSwitcher />
            </div>
          </section>

          <section className="app-header-group app-header-timeline-group" aria-label="Linha do tempo">
            <span className="app-header-group-label">Linha do tempo</span>
            <SnapshotPlayback />
          </section>
        </div>
      )}
    </header>
  );
}
