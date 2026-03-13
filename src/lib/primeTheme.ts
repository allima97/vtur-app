export const PRIME_THEME_LINK_ID = "theme-link";
export const PRIME_THEME_STORAGE_KEY = "vtur:prime-theme";
export const PRIME_THEME_UPDATED_EVENT = "vtur:prime-theme-updated";
export const PRIME_DEFAULT_THEME = "lara-light-indigo";
export const PRIME_THEME_OPTIONS = [
  { name: "lara-light-indigo", label: "Padrao (Indigo)" },
  { name: "lara-light-blue", label: "Azul" },
  { name: "lara-light-teal", label: "Verde agua" },
  { name: "lara-light-green", label: "Verde" },
  { name: "lara-light-amber", label: "Ambar" },
  { name: "lara-light-purple", label: "Roxo" },
] as const;
export type PrimeThemeName = (typeof PRIME_THEME_OPTIONS)[number]["name"];
const PRIME_THEME_NAME_SET = new Set<string>(PRIME_THEME_OPTIONS.map((option) => option.name));

export function isPrimeThemeName(themeName: string | null | undefined): themeName is PrimeThemeName {
  return PRIME_THEME_NAME_SET.has(String(themeName || "").trim().toLowerCase());
}

export function resolvePrimeThemeName(themeName: string | null | undefined): PrimeThemeName {
  const cleaned = String(themeName || "").trim().toLowerCase();
  if (isPrimeThemeName(cleaned)) return cleaned;
  return PRIME_DEFAULT_THEME as PrimeThemeName;
}

export function normalizePrimeThemeName(themeName: string | null | undefined): string {
  const raw = String(themeName || "").trim().toLowerCase();
  if (!raw) return PRIME_DEFAULT_THEME;
  if (!/^[a-z0-9-]+$/i.test(raw)) return PRIME_DEFAULT_THEME;
  return resolvePrimeThemeName(raw);
}

export function buildPrimeThemeHref(themeName: string): string {
  return `/themes/${normalizePrimeThemeName(themeName)}/theme.css`;
}

export function getStoredPrimeThemeName(): string {
  if (typeof window === "undefined") return PRIME_DEFAULT_THEME;
  try {
    const value = window.localStorage.getItem(PRIME_THEME_STORAGE_KEY);
    return normalizePrimeThemeName(value);
  } catch {
    return PRIME_DEFAULT_THEME;
  }
}

export function setStoredPrimeThemeName(themeName: string): string {
  const normalized = normalizePrimeThemeName(themeName);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PRIME_THEME_STORAGE_KEY, normalized);
    } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent(PRIME_THEME_UPDATED_EVENT, {
          detail: { theme: normalized },
        })
      );
    } catch {}
  }
  return normalized;
}

export async function changePrimeTheme(themeName: string, currentThemeName?: string): Promise<string> {
  const nextTheme = normalizePrimeThemeName(themeName);
  if (typeof window === "undefined") return nextTheme;

  const link = document.getElementById(PRIME_THEME_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    return setStoredPrimeThemeName(nextTheme);
  }

  const currentTheme = normalizePrimeThemeName(currentThemeName || getStoredPrimeThemeName());
  if (currentTheme === nextTheme) {
    link.setAttribute("href", buildPrimeThemeHref(nextTheme));
    return setStoredPrimeThemeName(nextTheme);
  }

  let switched = false;
  try {
    const module = await import("primereact/api");
    const primeReact = (module as { default?: { changeTheme?: (...args: unknown[]) => void } }).default;
    if (primeReact && typeof primeReact.changeTheme === "function") {
      await new Promise<void>((resolve) => {
        primeReact.changeTheme?.(currentTheme, nextTheme, PRIME_THEME_LINK_ID, () => resolve());
      });
      switched = true;
    }
  } catch {}

  if (!switched) {
    link.setAttribute("href", buildPrimeThemeHref(nextTheme));
  }

  return setStoredPrimeThemeName(nextTheme);
}
