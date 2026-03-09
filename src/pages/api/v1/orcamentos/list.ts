import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 150;
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

    const cacheKey = ["v1", "orcamentos", "list", user.id].join("|");
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

    const { data, error } = await client
      .from("quote")
      .select(
        "id, status, status_negociacao, total, currency, created_at, client_id, client_name, client_whatsapp, client_email, last_interaction_at, last_interaction_notes, cliente:client_id (id, nome, cpf), quote_item (id, title, product_name, item_type, total_amount, order_index)"
      )
      .order("created_at", { ascending: false })
      .order("order_index", { foreignTable: "quote_item", ascending: true })
      .limit(200);
    if (error) throw error;

    writeCache(cacheKey, data || []);
    await kvCache.set(cacheKey, data || [], 10);

    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=10",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro orcamentos/list", err);
    return new Response("Erro ao carregar orcamentos.", { status: 500 });
  }
}
