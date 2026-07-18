export type Theme = "light" | "dark";

const STORAGE_KEY = "ti-analytics-theme";

// Script inline injetado no <head> - roda antes da 1a pintura pra aplicar
// data-theme sem flash (FOUC). Nao pode importar nada: vira string crua.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem("${STORAGE_KEY}");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {}
})();
`;

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : null;
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function resolveActiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
