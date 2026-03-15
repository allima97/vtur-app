import birthdayElegant from "./themes/birthday-elegant/theme.json";
import womensDaySoft from "./themes/womens-day-soft/theme.json";
import mothersDayFloral from "./themes/mothers-day-floral/theme.json";
import newYearCelebration from "./themes/new-year-celebration.theme.json";
import christmasGold from "./themes/christmas-gold.theme.json";
import easterPastel from "./themes/easter-pastel.theme.json";

export type CardThemeStyle = {
  x?: number;
  y?: number;
  maxWidth?: number;
  width?: number;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  fontFamily?: string;
  align?: "left" | "center" | "right" | "justify";
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  italic?: boolean;
  fontStyle?: "normal" | "italic";
};

export type CardThemePhotoSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  framePadding?: number;
  frameRadius?: number;
  frameFill?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowDx?: number;
  shadowDy?: number;
  hideClientNameWhenPhoto?: boolean;
  hideBodyWhenPhoto?: boolean;
};

export type CardThemeMask = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  fill?: string;
  opacity?: number;
  blur?: number;
};

export type CardThemeLogoSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardThemeVisibility = {
  title?: boolean;
  clientName?: boolean;
  body?: boolean;
  footerLead?: boolean;
  consultant?: boolean;
  consultantRole?: boolean;
  logo?: boolean;
};

export type CardThemeLayout = {
  canvas?: {
    width: number;
    height: number;
  };
  title?: CardThemeStyle;
  clientName?: CardThemeStyle;
  clientNameMask?: CardThemeMask;
  body?: CardThemeStyle;
  footerLead?: CardThemeStyle;
  consultant?: CardThemeStyle;
  consultantRole?: CardThemeStyle;
  logo?: CardThemeLogoSlot;
  photo?: CardThemePhotoSlot;
  visibility?: CardThemeVisibility;
};

const THEME_LAYOUTS: Record<string, CardThemeLayout> = {
  "birthday-elegant": birthdayElegant as CardThemeLayout,
  "womens-day-soft": womensDaySoft as CardThemeLayout,
  "mothers-day-floral": mothersDayFloral as CardThemeLayout,
  "new-year-celebration": newYearCelebration as CardThemeLayout,
  "christmas-gold": christmasGold as CardThemeLayout,
  "easter-pastel": easterPastel as CardThemeLayout,
};

export function getCardThemeLayout(themeName?: string | null) {
  const key = String(themeName || "").trim();
  return key ? THEME_LAYOUTS[key] || null : null;
}
