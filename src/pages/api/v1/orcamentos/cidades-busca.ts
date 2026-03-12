import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";
import { searchCidades } from "../_shared/cidadesSearch";

const CACHE_TTL_MS = 12_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { expiresAt: number; payload: unknown }>();

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

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  if (intVal <= 0) return fallback;
  return Math.min(200, intVal);
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
      ["orcamentos", "vendas"],
      1,
      "Sem acesso a Orcamentos."
    );
    if (denied) return denied;

    const url = new URL(request.url);
    const query = String(url.searchParams.get("q") || "").trim();
    const limite = parseLimit(url.searchParams.get("limite"), query.length === 0 ? 200 : 50);

    const cacheKey = ["v1", "orcamentos", "cidades", user.id, query, String(limite)].join("|");
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=12",
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
          "Cache-Control": "private, max-age=12",
          Vary: "Cookie",
        },
      });
    }

    const cidadesData = await searchCidades(client, {
      query,
      limit: limite,
      allowEmpty: true,
    });

    writeCache(cacheKey, cidadesData);
    await kvCache.set(cacheKey, cidadesData, 12);

    return new Response(JSON.stringify(cidadesData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=12",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro orcamentos/cidades", err);
    return new Response("Erro ao carregar cidades.", { status: 500 });
  }
}
