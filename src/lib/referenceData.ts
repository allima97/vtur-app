import { buildQueryLiteKey, queryLite } from "./queryLite";
import { isCacheDisabled } from "./cachePolicy";

type ReferencePayload = {
  paises?: Array<{ id: string; nome: string }>;
  subdivisoes?: Array<{
    id: string;
    nome: string;
    pais_id: string;
    codigo_admin1?: string | null;
    tipo?: string | null;
    created_at?: string | null;
  }>;
  cidades?: Array<{
    id: string;
    nome: string;
    subdivisao_id?: string | null;
  }>;
};

const LOCAL_TTL_MS = 12 * 60 * 60 * 1000;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLocalCache(key: string) {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt: number; payload: ReferencePayload };
    if (!parsed?.expiresAt || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.payload || null;
  } catch {
    return null;
  }
}

function writeLocalCache(key: string, payload: ReferencePayload) {
  if (!canUseStorage()) return;
  try {
    const entry = { expiresAt: Date.now() + LOCAL_TTL_MS, payload };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

function normalizeInclude(include?: string[]) {
  const list = (include || ["paises", "subdivisoes", "cidades"]).filter(Boolean);
  return Array.from(new Set(list.map((i) => String(i).trim()).filter(Boolean))).sort();
}

export async function fetchReferenceData(options?: {
  include?: string[];
  noCache?: boolean;
}): Promise<ReferencePayload> {
  const forceNoCache = options?.noCache || isCacheDisabled();
  const include = normalizeInclude(options?.include);
  const includeKey = include.join(",");
  const storageKey = `sgtur_ref_data_v2:${includeKey}`;

  if (!forceNoCache) {
    const cached = readLocalCache(storageKey);
    if (cached) return cached;
  } else if (canUseStorage()) {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }

  const key = buildQueryLiteKey(["referenceData", includeKey, forceNoCache ? "no-cache" : "cache"]);

  return queryLite(
    key,
    async () => {
      const qs = new URLSearchParams();
      qs.set("include", includeKey);
      if (forceNoCache) qs.set("no_cache", "1");
      const resp = await fetch(`/api/v1/reference-data?${qs.toString()}`);
      if (!resp.ok) throw new Error(await resp.text());
      const payload = (await resp.json()) as ReferencePayload;
      if (!forceNoCache) writeLocalCache(storageKey, payload);
      return payload;
    },
    { ttlMs: 5 * 60 * 1000 }
  );
}
