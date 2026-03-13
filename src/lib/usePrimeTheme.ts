import { useCallback, useEffect, useState } from "react";
import {
  changePrimeTheme,
  getStoredPrimeThemeName,
  PRIME_DEFAULT_THEME,
  PRIME_THEME_UPDATED_EVENT,
  resolvePrimeThemeName,
  type PrimeThemeName,
} from "./primeTheme";

type UsePrimeThemeResult = {
  themeName: PrimeThemeName;
  isApplying: boolean;
  applyTheme: (nextThemeName: string) => Promise<PrimeThemeName>;
};

export function usePrimeTheme(): UsePrimeThemeResult {
  const [themeName, setThemeName] = useState<PrimeThemeName>(
    resolvePrimeThemeName(PRIME_DEFAULT_THEME)
  );
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setThemeName(resolvePrimeThemeName(getStoredPrimeThemeName()));

    const onThemeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: string }>).detail || {};
      const nextTheme = detail.theme || getStoredPrimeThemeName();
      setThemeName(resolvePrimeThemeName(nextTheme));
    };

    window.addEventListener(PRIME_THEME_UPDATED_EVENT, onThemeUpdated as EventListener);
    return () => window.removeEventListener(PRIME_THEME_UPDATED_EVENT, onThemeUpdated as EventListener);
  }, []);

  const applyTheme = useCallback(
    async (nextThemeName: string) => {
      const nextTheme = resolvePrimeThemeName(nextThemeName);
      if (isApplying || nextTheme === themeName) return themeName;

      setIsApplying(true);
      try {
        const changedTheme = await changePrimeTheme(nextTheme, themeName);
        const resolved = resolvePrimeThemeName(changedTheme);
        setThemeName(resolved);
        return resolved;
      } finally {
        setIsApplying(false);
      }
    },
    [isApplying, themeName]
  );

  return {
    themeName,
    isApplying,
    applyTheme,
  };
}
