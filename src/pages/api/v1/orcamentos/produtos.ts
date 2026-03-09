import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

const CACHE_TTL_MS = 20_000;
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

    const cacheKey = ["v1", "orcamentos", "produtos", user.id].join("|");
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=20",
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
          "Cache-Control": "private, max-age=20",
          Vary: "Cookie",
        },
      });
    }

    const { data, error } = await client
      .from("produtos")
      .select("nome, destino, cidade_id")
      .order("nome", { ascending: true })
      .limit(1000);
    if (error) throw error;

    writeCache(cacheKey, data || []);
    await kvCache.set(cacheKey, data || [], 20);

    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=20",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro orcamentos/produtos", err);
    return new Response("Erro ao carregar produtos.", { status: 500 });
  }
}
