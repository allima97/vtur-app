import { buildQueryLiteKey, queryLite } from "./queryLite";
import { isPersistentCacheEnabled } from "./cachePolicy";
import {
  readPersistentCache,
  removePersistentCache,
  writePersistentCache,
} from "./offline/persistentCache";

type TipoProdutoRaw = {
  id?: string;
  nome?: string | null;
  tipo?: string | null;
};

export type TipoProdutoCatalogOption = {
  id: string;
  label: string;
};

const CACHE_SCOPE = "tipo-produtos-catalog";
const LOCAL_TTL_MS = 6 * 60 * 60 * 1000;

function mapTipoProdutos(payload: unknown) {
  if (!Array.isArray(payload)) return [] as TipoProdutoCatalogOption[];
  return payload
    .map((item) => {
      const row = (item || {}) as TipoProdutoRaw;
      const id = String(row.id || "").trim();
      const label = String(row.nome || row.tipo || "").trim();
      return { id, label };
    })
    .filter((item) => item.id && item.label);
}

export async function fetchTipoProdutosOptionsWithCache(params?: {
  cacheNamespace?: string;
  endpoint?: string;
  noCache?: boolean;
  signal?: AbortSignal;
}) {
  const endpoint = String(params?.endpoint || "/api/v1/orcamentos/tipos").trim();
  const cacheNamespace = String(params?.cacheNamespace || "default").trim() || "default";
  const forceNoCache = Boolean(params?.noCache) || !isPersistentCacheEnabled();
  const storageKey = `v1:${cacheNamespace}:${endpoint}`;

  let cached: TipoProdutoCatalogOption[] | null = null;
  if (!forceNoCache) {
    cached = await readPersistentCache<TipoProdutoCatalogOption[]>(CACHE_SCOPE, storageKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
  } else {
    await removePersistentCache(CACHE_SCOPE, storageKey);
  }

  const requestKey = buildQueryLiteKey([
    "tipoProdutosCatalog",
    cacheNamespace,
    endpoint,
    forceNoCache ? "no-cache" : "cache",
  ]);

  try {
    const payload = await queryLite(
      requestKey,
      async () => {
        const qs = new URLSearchParams();
        if (forceNoCache) qs.set("no_cache", "1");
        const url = qs.toString() ? `${endpoint}?${qs.toString()}` : endpoint;
        const response = await fetch(url, {
          signal: params?.signal,
          credentials: "same-origin",
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Erro ao carregar tipos de produto.");
        }
        const data = await response.json();
        return mapTipoProdutos(data);
      },
      { ttlMs: forceNoCache ? 0 : 60_000 }
    );

    const mapped = Array.isArray(payload) ? payload : [];
    if (!forceNoCache && mapped.length > 0) {
      await writePersistentCache(CACHE_SCOPE, storageKey, mapped, LOCAL_TTL_MS);
    }
    return mapped;
  } catch (error) {
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
    throw error;
  }
}

