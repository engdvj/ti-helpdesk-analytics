"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

export type SortDir = "asc" | "desc";

/** Cabeçalho de coluna clicável — mesmo padrão da tabela de coletas do admin
 * (`th > button` + seta lucide). 1º clique ordena asc, 2º inverte. */
export function SortHeader<K extends string>({
  col,
  label,
  active,
  dir,
  onSort,
  align = "left",
}: {
  col: K;
  label: string;
  active: K;
  dir: SortDir;
  onSort: (col: K) => void;
  align?: "left" | "right";
}) {
  const isActive = active === col;
  return (
    <th
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
      style={align === "right" ? { textAlign: "right" } : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        style={align === "right" ? { flexDirection: "row-reverse" } : undefined}
      >
        {label}
        {isActive && (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

/** Ordena slugs de unidade: HGVC/UPA (alfabético) primeiro, "geral" (setores
 * transversais — TI/ME/MP de manutenção) sempre por último. */
export function ordenarUnidades(a: string, b: string): number {
  if (a === "geral") return 1;
  if (b === "geral") return -1;
  return a.localeCompare(b, "pt-BR");
}

/** Compara dois valores para ordenação (string com locale pt-BR, número natural). */
export function compareBy<T>(a: T, b: T, get: (row: T) => string | number | null, dir: SortDir): number {
  const va = get(a);
  const vb = get(b);
  let cmp: number;
  if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
  else cmp = String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}
