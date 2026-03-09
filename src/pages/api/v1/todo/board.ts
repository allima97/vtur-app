import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 15_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

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

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

function permLevel(p?: string | null): number {
  switch (p) {
    case "admin":
      return 5;
    case "delete":
      return 4;
    case "edit":
      return 3;
    case "create":
      return 2;
    case "view":
      return 1;
    default:
      return 0;
  }
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

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const { data: acessos, error: acessoErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id)
        .in("modulo", ["operacao_todo", "operacao"]);
      if (acessoErr) throw acessoErr;

      const podeVer = (acessos || []).some(
        (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 1
      );
      if (!podeVer) return new Response("Sem acesso a Tarefas.", { status: 403 });
    }

    const cacheKey = ["v1", "todoBoard", user.id].join("|");
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=15",
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
          "Cache-Control": "private, max-age=15",
          Vary: "Cookie",
        },
      });
    }

    const [catsResp, todosResp] = await Promise.all([
      client
        .from("todo_categorias")
        .select("id, nome, cor")
        .eq("user_id", user.id)
        .order("nome", { ascending: true }),
      client
        .from("agenda_itens")
        .select("id, titulo, descricao, done, categoria_id, prioridade, status, arquivo, created_at")
        .eq("tipo", "todo")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    if (catsResp.error || todosResp.error) {
      throw catsResp.error || todosResp.error;
    }

    const payload = {
      categorias: (catsResp.data || []) as any[],
      itens: (todosResp.data || []) as any[],
    };

    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 15);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=15",
        Vary: "Cookie",
      },
    });
  } catch (error: any) {
    console.error("[api/v1/todo/board] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
