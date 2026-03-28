const VENDAS_CACHE_VERSION_KEY = "vtur_vendas_cache_version";

function safeNowVersion() {
  return String(Date.now());
}

export function getVendasCacheVersion() {
  if (typeof window === "undefined") return "0";
  const stored = window.localStorage.getItem(VENDAS_CACHE_VERSION_KEY);
  if (stored && stored.trim()) return stored.trim();
  return "0";
}

export function bumpVendasCacheVersion() {
  const version = safeNowVersion();
  if (typeof window === "undefined") return version;
  window.localStorage.setItem(VENDAS_CACHE_VERSION_KEY, version);
  try {
    window.dispatchEvent(
      new CustomEvent("vtur:vendas-cache-bust", {
        detail: { version },
      })
    );
  } catch {
    // no-op
  }
  return version;
}

