type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

type Store = {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<unknown>>;
  maxEntries: number;
};

const STORE_KEY = "__sgtur_query_lite_v1";

function getStore(): Store {
  const g = globalThis as any;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      cache: new Map<string, CacheEntry>(),
      inflight: new Map<string, Promise<unknown>>(),
      maxEntries: 350,
    } satisfies Store;
  }
  return g[STORE_KEY] as Store;
}

function now() {
  return Date.now();
}

export function buildQueryLiteKey(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== "")
    .map((p) => String(p))
    .join("|");
}

export async function queryLite<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlMs?: number }
): Promise<T> {
  const store = getStore();
  const ttlMs = typeof options?.ttlMs === "number" ? options.ttlMs : 0;
  const useCache = ttlMs > 0;

  if (useCache) {
    const cached = store.cache.get(key);
    if (cached) {
      if (cached.expiresAt > now()) return cached.value as T;
      store.cache.delete(key);
    }
  }

  const inflight = store.inflight.get(key);
  if (inflight) return inflight as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fetcher();
      if (useCache) {
        if (store.cache.size >= store.maxEntries) {
          const firstKey = store.cache.keys().next().value;
          if (firstKey) store.cache.delete(firstKey);
        }
        store.cache.set(key, { expiresAt: now() + ttlMs, value });
      }
      return value;
    } finally {
      store.inflight.delete(key);
    }
  })();

  store.inflight.set(key, promise as Promise<unknown>);
  return promise;
}

export function invalidateQueryLiteByPrefix(prefix: string) {
  const store = getStore();
  Array.from(store.cache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) store.cache.delete(key);
  });
  Array.from(store.inflight.keys()).forEach((key) => {
    if (key.startsWith(prefix)) store.inflight.delete(key);
  });
}

export function clearQueryLite() {
  const store = getStore();
  store.cache.clear();
  store.inflight.clear();
}

