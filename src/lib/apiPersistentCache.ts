import { isPersistentCacheEnabled } from "./cachePolicy";
import { buildQueryLiteKey, queryLite } from "./queryLite";
import {
  readPersistentCache,
  removePersistentCache,
  writePersistentCache,
} from "./offline/persistentCache";

type FetchApiJsonWithPersistentCacheParams = {
  endpoint: string;
  cacheScope: string;
  cacheKey: string;
  noCache?: boolean;
  persistentTtlMs?: number;
  queryLiteTtlMs?: number;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
};

export async function fetchApiJsonWithPersistentCache<T = unknown>(
  params: FetchApiJsonWithPersistentCacheParams
): Promise<T> {
  const endpoint = String(params.endpoint || "").trim();
  if (!endpoint) {
    throw new Error("Endpoint inválido para cache de API.");
  }

  const forceNoCache = Boolean(params.noCache) || !isPersistentCacheEnabled();
  const persistentTtlMs = Number.isFinite(params.persistentTtlMs)
    ? Math.max(0, Number(params.persistentTtlMs))
    : 6 * 60 * 60 * 1000;
  const queryLiteTtlMs = Number.isFinite(params.queryLiteTtlMs)
    ? Math.max(0, Number(params.queryLiteTtlMs))
    : 60_000;

  let cached: T | null = null;
  if (!forceNoCache) {
    cached = await readPersistentCache<T>(params.cacheScope, params.cacheKey);
    if (cached != null) {
      return cached;
    }
  } else {
    await removePersistentCache(params.cacheScope, params.cacheKey);
  }

  const queryKey = buildQueryLiteKey([
    "apiPersistentCache",
    endpoint,
    params.cacheScope,
    params.cacheKey,
    forceNoCache ? "no-cache" : "cache",
  ]);

  try {
    const payload = await queryLite(
      queryKey,
      async () => {
        const response = await fetch(endpoint, {
          credentials: params.credentials,
          signal: params.signal,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `Erro ao carregar ${endpoint}.`);
        }
        return (await response.json()) as T;
      },
      { ttlMs: forceNoCache ? 0 : queryLiteTtlMs }
    );

    if (!forceNoCache && persistentTtlMs > 0) {
      await writePersistentCache(params.cacheScope, params.cacheKey, payload, persistentTtlMs);
    }
    return payload;
  } catch (error) {
    if (cached != null) {
      return cached;
    }
    throw error;
  }
}

