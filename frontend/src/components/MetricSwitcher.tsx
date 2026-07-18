"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { METRIC_OPTIONS, useMetric } from "@/lib/metric-context";
import { useUnitOptional } from "@/lib/unit-context";

/** So aparece dentro de /u/[slug]/... - ordenacao nao significa nada no hub. */
export function MetricSwitcher() {
  const unit = useUnitOptional();
  const { metric, setMetricKey } = useMetric();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!unit) return null;

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
          whiteSpace: "nowrap",
        }}
      >
        Ordenar: {metric.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          style={{
            position: "fixed",
            marginTop: 4,
            minWidth: 220,
            background: "var(--superficie)",
            border: "1px solid var(--linha)",
            zIndex: 100,
          }}
        >
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setMetricKey(opt.key);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.5rem 0.75rem",
                fontSize: "var(--fonte-corpo)",
                background: metric.key === opt.key ? "var(--acento-suave)" : "transparent",
                color: metric.key === opt.key ? "var(--acento)" : "var(--tinta)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
