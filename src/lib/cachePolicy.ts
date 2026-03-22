function parseBoolFlag(value: unknown): boolean | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function readEnvValue(keys: string[]): unknown {
  const g = globalThis as any;
  for (const key of keys) {
    const runtimeValue = g?.env?.[key];
    if (runtimeValue != null && String(runtimeValue).trim() !== "") {
      return runtimeValue;
    }
  }

  try {
    for (const key of keys) {
      const viteValue = (import.meta as any)?.env?.[key];
      if (viteValue != null && String(viteValue).trim() !== "") {
        return viteValue;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function readEnvBool(keys: string[]): boolean | null {
  const value = readEnvValue(keys);
  return parseBoolFlag(value);
}

function readEnvString(keys: string[]): string | null {
  const value = readEnvValue(keys);
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function isCacheDisabled() {
  const runtimeFlag = readEnvBool(["DISABLE_APP_CACHE", "PUBLIC_DISABLE_CACHE"]);
  if (runtimeFlag !== null) return runtimeFlag;

  // Padrão de segurança: sem cache até nova decisão explícita.
  return true;
}

export function isPersistentCacheEnabled() {
  const runtimeFlag = readEnvBool(["PERSISTENT_CACHE_ENABLED", "PUBLIC_PERSISTENT_CACHE_ENABLED"]);
  if (runtimeFlag !== null) return runtimeFlag;

  // Cache persistente local é seguro por padrão e pode ser desligado por flag.
  return true;
}

export function isDexieCloudSyncEnabled() {
  const runtimeFlag = readEnvBool(["DEXIE_CLOUD_SYNC_ENABLED", "PUBLIC_DEXIE_CLOUD_SYNC_ENABLED"]);
  if (runtimeFlag !== null) return runtimeFlag;
  return false;
}

export function getDexieCloudDatabaseUrl() {
  return readEnvString(["DEXIE_CLOUD_DB_URL", "PUBLIC_DEXIE_CLOUD_DB_URL"]) || "";
}

export function getDexieCloudSyncScopes() {
  const raw = readEnvString(["DEXIE_CLOUD_SYNC_SCOPES", "PUBLIC_DEXIE_CLOUD_SYNC_SCOPES"]);
  if (!raw) return ["quote-import-draft"];
  const scopes = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : ["quote-import-draft"];
}

export function applyNoStoreHeaders(headers: Headers) {
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Surrogate-Control", "no-store");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
}
