import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

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

function resolvePapel(tipoNome: string, usoIndividual: boolean): Papel {
  if (usoIndividual) return "VENDEDOR";
  const tipo = String(tipoNome || "").toUpperCase();
  if (tipo.includes("ADMIN")) return "ADMIN";
  if (tipo.includes("MASTER")) return "MASTER";
  if (tipo.includes("GESTOR")) return "GESTOR";
  if (tipo.includes("VENDEDOR")) return "VENDEDOR";
  return "OUTRO";
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

async function requireModuloView(client: any, userId: string, modulos: string[], msg: string) {
  const normalizeModulo = (value?: string | null) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    return MODULO_ALIASES[raw] || raw.replace(/\s+/g, "_");
  };

  const allowed = new Set<string>();
  modulos.forEach((modulo) => {
    const raw = String(modulo || "").trim().toLowerCase();
    if (!raw) return;
    allowed.add(raw);
    const normalized = normalizeModulo(raw);
    if (normalized) allowed.add(normalized);
  });

  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId);
  if (error) throw error;
  const podeVer = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < 1) return false;
    const moduloKey = normalizeModulo(row?.modulo);
    return moduloKey && allowed.has(moduloKey);
  });
  if (!podeVer) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

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

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, uso_individual, company_id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const papel = resolvePapel(tipoName, usoIndividual);
    const companyId = String((perfil as any)?.company_id || "").trim();

    if (papel !== "ADMIN") {
      const denied = await requireModuloView(
        client,
        user.id,
        ["relatorios", "relatorios_produtos", "relatorios_vendas"],
        "Sem acesso a Relatorios."
      );
      if (denied) return denied;
    }

    const cacheKey = [
      "v1",
      "relatorios",
      "cidades-busca",
      user.id,
      companyId || "-",
      query,
      String(limite),
    ].join("|");

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

    const { data, error } = await client.rpc("buscar_cidades", {
      q: query,
      limite,
    });
    if (error) throw error;

    const payload = data || [];
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
    console.error("Erro relatorios/cidades-busca", err);
    return new Response("Erro ao buscar cidades.", { status: 500 });
  }
}
