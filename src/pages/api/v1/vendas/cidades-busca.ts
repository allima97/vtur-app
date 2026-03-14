import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, requireModuloLevel } from "./_utils";
import { searchCidades } from "../_shared/cidadesSearch";

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  if (intVal <= 0) return fallback;
  return Math.min(50, intVal);
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

    const url = new URL(request.url);
    const query = String(url.searchParams.get("q") || "").trim();
    const limite = parseLimit(url.searchParams.get("limite"), 20);
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

    const denied = await requireModuloLevel(
      client,
      user.id,
      ["vendas", "vendas_cadastro", "vendas_consulta", "vendas_importar"],
      1,
      "Sem acesso a Vendas."
    );
    if (denied) return denied;

    const cacheKey = ["v1", "vendas", "cidades-busca", user.id, query, String(limite)].join("|");

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

    const payload = await searchCidades(client, {
      query,
      limit: limite,
      allowEmpty: false,
    });
    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 10);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=10",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro vendas/cidades-busca", err);
    return new Response("Erro ao buscar cidades.", { status: 500 });
  }
}
