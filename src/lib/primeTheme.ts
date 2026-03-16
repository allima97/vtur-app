export const PRIME_THEME_LINK_ID = "theme-link";
export const PRIME_DEFAULT_THEME = "lara-light-blue";
export type PrimeThemeName = typeof PRIME_DEFAULT_THEME;

export function isPrimeThemeName(themeName: string | null | undefined): themeName is PrimeThemeName {
  return String(themeName || "").trim().toLowerCase() === PRIME_DEFAULT_THEME;
}

export function resolvePrimeThemeName(themeName: string | null | undefined): PrimeThemeName {
  return PRIME_DEFAULT_THEME;
}

export function normalizePrimeThemeName(themeName: string | null | undefined): string {
  return PRIME_DEFAULT_THEME;
}

export function buildPrimeThemeHref(themeName: string): string {
  return `/themes/${PRIME_DEFAULT_THEME}/theme.css`;
}

export function getStoredPrimeThemeName(): string {
  return PRIME_DEFAULT_THEME;
}

export function setStoredPrimeThemeName(themeName: string): string {
  return PRIME_DEFAULT_THEME;
}

export async function changePrimeTheme(themeName: string, currentThemeName?: string): Promise<string> {
  const nextTheme = PRIME_DEFAULT_THEME;
  if (typeof window === "undefined") return nextTheme;

  const link = document.getElementById(PRIME_THEME_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    return setStoredPrimeThemeName(nextTheme);
  }

  const currentTheme = PRIME_DEFAULT_THEME;
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
