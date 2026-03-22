import { isPersistentCacheEnabled } from "./cachePolicy";
import { normalizeText } from "./normalizeText";
import { readPersistentCache, writePersistentCache } from "./offline/persistentCache";

export type CidadeBuscaCache = {
  id: string;
  nome: string;
  subdivisao_nome?: string | null;
  pais_nome?: string | null;
  subdivisao_id?: string | null;
  descricao?: string | null;
  created_at?: string | null;
};

type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (table: string) => any;
};

const CIDADES_SEARCH_CACHE_SCOPE = "cidades-search";
const CIDADES_SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeSearchTerm(term: string) {
  return normalizeText(term || "", { trim: true, collapseWhitespace: true });
}

function toCidadeList(data: any): CidadeBuscaCache[] {
  if (!Array.isArray(data)) return [];
  const mapped = data
    .map((item: any) => ({
      id: String(item?.id || "").trim(),
      nome: String(item?.nome || "").trim(),
      subdivisao_nome: item?.subdivisao_nome ? String(item.subdivisao_nome).trim() : null,
      pais_nome: item?.pais_nome ? String(item.pais_nome).trim() : null,
      subdivisao_id: item?.subdivisao_id ? String(item.subdivisao_id).trim() : null,
      descricao: item?.descricao ? String(item.descricao).trim() : null,
      created_at: item?.created_at ? String(item.created_at).trim() : null,
    }))
    .filter((item) => item.id && item.nome);

  const seen = new Set<string>();
  return mapped.filter((item) => {
    const key = `${item.id}:${normalizeSearchTerm(item.nome)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function buscarCidadesComCache(params: {
  supabase: SupabaseLike;
  query: string;
  limit?: number;
  noCache?: boolean;
}) {
  const term = String(params.query || "").trim();
  if (term.length < 2) return [] as CidadeBuscaCache[];

  const limit = Number.isFinite(params.limit) ? Math.min(Math.max(Number(params.limit), 1), 200) : 25;
  const cacheKey = `${limit}:${normalizeSearchTerm(term)}`;
  const canUseCache = !params.noCache && isPersistentCacheEnabled();

  if (canUseCache) {
    const cached = await readPersistentCache<CidadeBuscaCache[]>(CIDADES_SEARCH_CACHE_SCOPE, cacheKey);
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  }

  let lastError: any = null;

  try {
    const { data, error } = await params.supabase.rpc("buscar_cidades", {
      q: term,
      limite: limit,
    });
    if (!error) {
      const cidades = toCidadeList(data);
      if (canUseCache && cidades.length > 0) {
        await writePersistentCache(
          CIDADES_SEARCH_CACHE_SCOPE,
          cacheKey,
          cidades,
          CIDADES_SEARCH_CACHE_TTL_MS
        );
      }
      return cidades;
    }
    lastError = error;
  } catch (error) {
    lastError = error;
  }

  try {
    const { data, error } = await params.supabase
      .from("cidades")
      .select("id, nome, subdivisao_id")
      .ilike("nome", `%${term}%`)
      .order("nome")
      .limit(limit);

    if (error) throw error;
    const cidades = toCidadeList(data);
    if (canUseCache && cidades.length > 0) {
      await writePersistentCache(
        CIDADES_SEARCH_CACHE_SCOPE,
        cacheKey,
        cidades,
        CIDADES_SEARCH_CACHE_TTL_MS
      );
    }
    return cidades;
  } catch (error) {
    const message =
      (error as any)?.message || (lastError as any)?.message || "Erro ao buscar cidades.";
    throw new Error(message);
  }
}
