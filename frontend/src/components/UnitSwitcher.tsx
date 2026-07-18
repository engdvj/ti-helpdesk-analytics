"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { units as unitsApi, type Unit } from "@/lib/api";
import { GERAL_SLUG, useUnitOptional } from "@/lib/unit-context";

export function UnitSwitcher() {
  const ctx = useUnitOptional();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [allUnits, setAllUnits] = useState<Unit[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && allUnits === null) {
      unitsApi.list().then(setAllUnits).catch(() => setAllUnits([]));
    }
  }, [open, allUnits]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!ctx) return null;

  const currentLabel = ctx.status === "pronta" ? (ctx.unit ? ctx.unit.nome : "Todas as unidades") : "...";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fonte-label)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          border: "1px solid var(--linha)",
          background: "var(--superficie)",
          color: "var(--tinta)",
          padding: "0.4rem 0.7rem",
          cursor: "pointer",
        }}
      >
        {currentLabel}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          style={{
            position: "fixed",
            marginTop: 4,
            minWidth: 200,
            background: "var(--superficie)",
            border: "1px solid var(--linha)",
            zIndex: 100,
          }}
        >
          <button
            onClick={() => {
              setOpen(false);
              router.push(`/u/${GERAL_SLUG}/dashboard`);
            }}
            style={itemStyle(ctx.status === "pronta" && ctx.unit === null)}
          >
            Todas as unidades
          </button>
          {(allUnits ?? []).map((u) => (
            <button
              key={u.slug}
              onClick={() => {
                setOpen(false);
                router.push(`/u/${u.slug}/dashboard`);
              }}
              style={itemStyle(ctx.status === "pronta" && ctx.unit?.slug === u.slug)}
            >
              {u.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function itemStyle(active: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "0.5rem 0.75rem",
    fontSize: "var(--fonte-corpo)",
    background: active ? "var(--acento-suave)" : "transparent",
    color: active ? "var(--acento)" : "var(--tinta)",
    border: "none",
    cursor: "pointer",
  };
}
