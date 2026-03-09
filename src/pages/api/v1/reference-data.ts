import { kvCache } from "../../../lib/kvCache";
import { buildAuthClient } from "./vendas/_utils";

type ReferencePayload = {
  paises?: Array<{ id: string; nome: string }>;
  subdivisoes?: Array<{
    id: string;
    nome: string;
    pais_id: string;
    codigo_admin1: string | null;
    tipo: string | null;
    created_at: string | null;
  }>;
  cidades?: Array<{
    id: string;
    nome: string;
    subdivisao_id: string | null;
  }>;
};

const TTL_SECONDS = 86_400; // 24h

function parseIncludeParam(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return ["paises", "subdivisoes", "cidades"];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCacheKey(include: string[]) {
  const parts = include.slice().sort();
  return ["v2", "referenceData", parts.join(".")].join("|");
}

function buildCacheHeaders() {
  return {
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Content-Type": "application/json",
  };
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const include = parseIncludeParam(url.searchParams.get("include"));
    const noCache = url.searchParams.get("no_cache") === "1";

    const cacheKey = buildCacheKey(include);
    if (!noCache) {
      const cached = await kvCache.get<ReferencePayload>(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: buildCacheHeaders(),
        });
      }
    }

    const payload: ReferencePayload = {};

    const tasks: Array<Promise<void>> = [];

    if (include.includes("paises")) {
      tasks.push(
        (async () => {
          const { data, error } = await client
            .from("paises")
            .select("id, nome")
            .order("nome");
          if (error) throw error;
          payload.paises = data || [];
        })()
      );
    }

    if (include.includes("subdivisoes")) {
      tasks.push(
        (async () => {
          const pageSize = 1000;
          const todas: ReferencePayload["subdivisoes"] = [];
          let from = 0;
          while (true) {
            const { data, error } = await client
              .from("subdivisoes")
              .select("id, nome, pais_id, codigo_admin1, tipo, created_at")
              .order("nome")
              .range(from, from + pageSize - 1);
            if (error) throw error;
            todas.push(...((data || []) as NonNullable<ReferencePayload["subdivisoes"]>));
            if (!data || data.length < pageSize) break;
            from += pageSize;
          }
          payload.subdivisoes = todas;
        })()
      );
    }

    if (include.includes("cidades")) {
      tasks.push(
        (async () => {
          const { data, error } = await client
            .from("cidades")
            .select("id, nome, subdivisao_id")
            .order("nome");
          if (error) throw error;
          payload.cidades = data || [];
        })()
      );
    }

    await Promise.all(tasks);

    await kvCache.set(cacheKey, payload, TTL_SECONDS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: buildCacheHeaders(),
    });
  } catch (err) {
    console.error("Erro reference-data", err);
    return new Response("Erro ao carregar dados de referencia.", { status: 500 });
  }
}
