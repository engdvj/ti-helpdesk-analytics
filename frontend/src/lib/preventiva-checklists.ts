import type { ChecklistItemDef } from "./api";

export const RESULTADO_LABEL: Record<string, string> = {
  sem_achado: "Sem achado",
  ajuste_simples: "Ajuste simples realizado",
  corretiva_aberta: "Corretiva aberta",
  interrompido: "Interrompido",
};

/** Agrupa itens em seções consecutivas por `secao` (a ordem do catálogo
 * decide onde uma seção começa/termina) - itens sem seção ficam soltos, sem
 * cabeçalho. Compartilhado por ExecutionChecklist e ReconfirmChecklist. */
export function agruparPorSecao(defs: ChecklistItemDef[]): { secao: string | null; itens: ChecklistItemDef[] }[] {
  const grupos: { secao: string | null; itens: ChecklistItemDef[] }[] = [];
  for (const def of defs) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.secao === def.secao) ultimo.itens.push(def);
    else grupos.push({ secao: def.secao, itens: [def] });
  }
  return grupos;
}
