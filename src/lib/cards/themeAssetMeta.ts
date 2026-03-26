export type ThemeAssetMeta = {
  nome?: string | null;
  asset_url?: string | null;
  width_px?: number | null;
  height_px?: number | null;
};

export function resolveThemeAssetMeta(theme?: ThemeAssetMeta | null) {
  return {
    asset_url: String(theme?.asset_url || "").trim(),
    width_px: Number(theme?.width_px || 0),
    height_px: Number(theme?.height_px || 0),
  };
}
