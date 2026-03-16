import { useCallback, useState } from "react";
import {
  changePrimeTheme,
  PRIME_DEFAULT_THEME,
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
