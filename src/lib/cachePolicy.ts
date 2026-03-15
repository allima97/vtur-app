function parseBoolFlag(value: unknown): boolean | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isCacheDisabled() {
  const g = globalThis as any;
  const runtimeFlag = parseBoolFlag(g?.env?.DISABLE_APP_CACHE ?? g?.env?.PUBLIC_DISABLE_CACHE);
  if (runtimeFlag !== null) return runtimeFlag;

  try {
    const viteFlag = parseBoolFlag(
      (import.meta as any)?.env?.DISABLE_APP_CACHE ?? (import.meta as any)?.env?.PUBLIC_DISABLE_CACHE
    );
    if (viteFlag !== null) return viteFlag;
  } catch {
    // ignore
  }

  // Padrão de segurança: sem cache até nova decisão explícita.
  return true;
}

export function applyNoStoreHeaders(headers: Headers) {
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Surrogate-Control", "no-store");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
}
