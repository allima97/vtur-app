import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { expiresAt: number; payload: unknown }>();

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  if (intVal <= 0) return fallback;
  return Math.min(20, intVal);
}

function readCache(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeCache(key: string, payload: unknown) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await requireModuloLevel(
      client,
      user.id,
      ["operacao_preferencias"],
      1,
      "Sem acesso a Minhas Preferências."
    );
    if (denied) return denied;

    const url = new URL(request.url);
    const query = String(url.searchParams.get("q") || "").trim();
    const limite = parseLimit(url.searchParams.get("limite"), 8);
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    if (query.length < 2) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    const cacheKey = ["v1", "preferencias", "cidades-busca", user.id, query, String(limite)].join("|");

    if (!noCache) {
      const kvCached = await kvCache.get<any>(cacheKey);
      if (kvCached) {
        return new Response(JSON.stringify(kvCached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=10",
            Vary: "Cookie",
          },
        });
      }

      const cached = readCache(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=10",
            Vary: "Cookie",
          },
        });
      }
    }

    let cidadesData: any[] = [];
    try {
      const { data, error } = await client.rpc("buscar_cidades", { q: query, limite });
      if (error) throw error;
      cidadesData = data || [];
    } catch (rpcError) {
      let fallbackQuery = client.from("cidades").select("id, nome").order("nome").limit(limite);
      fallbackQuery = fallbackQuery.ilike("nome", `%${query}%`);
      const fallback = await fallbackQuery;
      if (fallback.error) throw fallback.error;
      cidadesData = fallback.data || [];
    }

    writeCache(cacheKey, cidadesData);
    await kvCache.set(cacheKey, cidadesData, 10);

    return new Response(JSON.stringify(cidadesData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=10",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro preferencias/cidades-busca", err);
    return new Response("Erro ao buscar cidades.", { status: 500 });
  }
}
