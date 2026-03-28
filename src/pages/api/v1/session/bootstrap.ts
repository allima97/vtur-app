import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

function toISODateLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const map = new Map<string, string>();
  header.split(";").forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const [rawName, ...rawValue] = trimmed.split("=");
    const name = rawName?.trim();
    if (!name) return;
    map.set(name, rawValue.join("=").trim());
  });
  return map;
}

function buildAuthClient(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("PUBLIC_SUPABASE_URL ou PUBLIC_SUPABASE_ANON_KEY nao configurados.");
  }
  const cookies = parseCookies(request);
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name: string) => cookies.get(name) ?? "",
      set: () => {},
      remove: () => {},
    },
  });
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

    const cacheKey = ["v1", "sessionBootstrap", user.id].join("|");
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

    let companyId: string | null = null;
    try {
      const { data: companyData, error: companyErr } = await client.rpc("current_company_id");
      if (companyErr) throw companyErr;
      companyId = companyData ? String(companyData) : null;
    } catch (companyError) {
      console.warn("Falha ao resolver company_id atual:", companyError);
    }

    const { data, error } = await client.rpc("mural_recados_unread_count");
    if (error) throw error;
    const count = Number(data ?? 0);

    let agendaToday = 0;
    try {
      const today = toISODateLocal(new Date());
      const filterOverlap = [
        `and(start_date.lte.${today},end_date.gte.${today})`,
        `and(start_date.gte.${today},start_date.lte.${today},end_date.is.null)`,
      ].join(",");

      const { count: agendaCount, error: agendaErr } = await client
        .from("agenda_itens")
        .select("id", { count: "exact", head: true })
        .eq("tipo", "evento")
        .eq("user_id", user.id)
        .or(filterOverlap);

      if (agendaErr) throw agendaErr;
      agendaToday = Number(agendaCount ?? 0);
      if (!Number.isFinite(agendaToday)) agendaToday = 0;
    } catch (agendaError) {
      console.warn("Falha ao resolver agenda de hoje:", agendaError);
      agendaToday = 0;
    }

    const payload = {
      companyId,
      recadosUnread: Number.isFinite(count) ? count : 0,
      agendaToday,
    };

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
  } catch (e: any) {
    console.error("Erro session bootstrap:", e);
    return new Response("Erro ao carregar sessao.", { status: 500 });
  }
}
