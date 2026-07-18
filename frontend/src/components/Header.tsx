"use client";

import Link from "next/link";

import { AdminLink } from "@/components/AdminLink";
import { GranularidadeSwitcher } from "@/components/GranularidadeSwitcher";
import { MetricSwitcher } from "@/components/MetricSwitcher";
import { SnapshotPlayback } from "@/components/SnapshotPlayback";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UnitSwitcher } from "@/components/UnitSwitcher";

export function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0 1rem",
        background: "var(--superficie)",
        borderBottom: "1px solid var(--linha)",
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: "1.05rem",
          color: "var(--tinta)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        TI Analytics
      </Link>
      <UnitSwitcher />
      <GranularidadeSwitcher />
      <MetricSwitcher />
      <SnapshotPlayback />
      <div style={{ flex: 1 }} />
      <AdminLink />
      <ThemeToggle />
    </header>
  );
}
