import { isPersistentCacheEnabled } from "./cachePolicy";
import { normalizeText } from "./normalizeText";
import { readPersistentCache, writePersistentCache } from "./offline/persistentCache";

export type CidadeApiSugestao = {
  id: string;
  nome: string;
  subdivisao_nome?: string | null;
  pais_nome?: string | null;
};

type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (table: string) => any;
};

const CIDADES_API_CACHE_SCOPE = "cidades-search-api";
const CIDADES_API_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const DEFAULT_CIDADES_ENDPOINTS = [
  "/api/v1/vendas/cidades-busca",
  "/api/v1/orcamentos/cidades-busca",
  "/api/v1/relatorios/cidades-busca",
];

function buildCidadeApiCacheKey(namespace: string, query: string, limit: number) {
  const normalized = normalizeText(query || "", { trim: true, collapseWhitespace: true });
  return `${namespace}:${limit}:${normalized}`;
}

function normalizeCidadeList(payload: unknown) {
  if (!Array.isArray(payload)) return [] as CidadeApiSugestao[];
  return payload
    .map((item: any) => ({
      id: String(item?.id || "").trim(),
      nome: String(item?.nome || "").trim(),
      subdivisao_nome: item?.subdivisao_nome ? String(item.subdivisao_nome).trim() : null,
      pais_nome: item?.pais_nome ? String(item.pais_nome).trim() : null,
    }))
    .filter((item) => item.id && item.nome);
}

export async function fetchCidadesByApiWithCache(params: {
  query: string;
  limit?: number;
  signal?: AbortSignal;
  cacheNamespace: string;
  endpoints?: string[];
  serverNoCache?: boolean;
  minQueryLength?: number;
}) {
  const query = String(params.query || "").trim();
  const limit = Number.isFinite(params.limit) ? Number(params.limit) : 60;
  const minQueryLength = Number.isFinite(params.minQueryLength)
    ? Math.max(0, Number(params.minQueryLength))
    : 2;
  if (query.length < minQueryLength) return [] as CidadeApiSugestao[];

  const cacheKey = buildCidadeApiCacheKey(params.cacheNamespace, query, limit);
  if (isPersistentCacheEnabled()) {
    const cached = await readPersistentCache<CidadeApiSugestao[]>(CIDADES_API_CACHE_SCOPE, cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
  }

  const qs = new URLSearchParams();
  qs.set("q", query);
  qs.set("limite", String(limit));
  if (params.serverNoCache) {
    qs.set("no_cache", "1");
  }
  const endpoints = params.endpoints?.length ? params.endpoints : DEFAULT_CIDADES_ENDPOINTS;

  let lastError = "Erro ao buscar cidades.";
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}?${qs.toString()}`, { signal: params.signal });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        lastError = text || lastError;
        continue;
      }
      const data = normalizeCidadeList(await response.json());
      if (data.length > 0 && isPersistentCacheEnabled()) {
        await writePersistentCache(CIDADES_API_CACHE_SCOPE, cacheKey, data, CIDADES_API_CACHE_TTL_MS);
      }
      return data;
    } catch (error: any) {
      if (params.signal?.aborted) throw error;
      lastError = error?.message || lastError;
    }
  }

  throw new Error(lastError);
}

export async function fetchCidadesFallbackSupabaseWithCache(params: {
  supabase: SupabaseLike;
  query: string;
  limit?: number;
  cacheNamespace: string;
}) {
  const term = String(params.query || "").trim();
  const limit = Number.isFinite(params.limit) ? Number(params.limit) : 60;
  if (term.length < 2) return { data: [] as CidadeApiSugestao[], error: null as any };

  const cacheKey = buildCidadeApiCacheKey(params.cacheNamespace, term, limit);
  if (isPersistentCacheEnabled()) {
    const cached = await readPersistentCache<CidadeApiSugestao[]>(CIDADES_API_CACHE_SCOPE, cacheKey);
    if (Array.isArray(cached) && cached.length > 0) {
      return { data: cached, error: null as any };
    }
  }

  const { data: rpcData, error: rpcError } = await params.supabase.rpc("buscar_cidades", {
    q: term,
    limite: limit,
  });
  const rpcList = normalizeCidadeList(rpcData);
  if (!rpcError && rpcList.length > 0) {
    if (isPersistentCacheEnabled()) {
      await writePersistentCache(CIDADES_API_CACHE_SCOPE, cacheKey, rpcList, CIDADES_API_CACHE_TTL_MS);
    }
    return { data: rpcList, error: null as any };
  }

  const tableFallback = await params.supabase
    .from("cidades")
    .select("id, nome")
    .ilike("nome", `%${term}%`)
    .order("nome")
    .limit(limit);

  if (tableFallback.error) {
    return {
      data: [] as CidadeApiSugestao[],
      error: tableFallback.error || rpcError || new Error("Erro ao buscar cidades."),
    };
  }

  const tableList = normalizeCidadeList(tableFallback.data);
  if (isPersistentCacheEnabled() && tableList.length > 0) {
    await writePersistentCache(CIDADES_API_CACHE_SCOPE, cacheKey, tableList, CIDADES_API_CACHE_TTL_MS);
  }

  return { data: tableList, error: null as any };
}
