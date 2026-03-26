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

function normalizeModulo(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return MODULO_ALIASES[raw] || raw;
}

async function requireModuloView(client: any, userId: string, modulos: string[], msg: string) {
  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId);
  if (error) throw error;
  const allowed = new Set(modulos.map((mod) => String(mod || "").trim().toLowerCase()));
  const podeVer = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < 1) return false;
    const key = normalizeModulo(row?.modulo);
    if (key && allowed.has(key)) return true;
    const rawKey = String(row?.modulo || "").trim().toLowerCase();
    return rawKey ? allowed.has(rawKey) : false;
  });
  if (!podeVer) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

function resolveRoles(usoIndividual: boolean) {
  const deveRestringirResponsavel = usoIndividual;
  return { deveRestringirResponsavel };
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "").trim();
    const inicio = String(url.searchParams.get("inicio") || "").trim();
    const fim = String(url.searchParams.get("fim") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("company_id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const companyId = String((perfil as any)?.company_id || "").trim();
    if (!companyId) return new Response("Empresa nao encontrada.", { status: 400 });

    const tipoNome = String((perfil as any)?.user_types?.name || "");
    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const { deveRestringirResponsavel } = resolveRoles(usoIndividual);

    const denied = await requireModuloView(
      client,
      user.id,
      ["operacao", "operacao_viagens"],
      "Sem acesso a Operacao/Viagens."
    );
    if (denied) return denied;

    const cacheKey = ["v1", "viagens", user.id, companyId, status, inicio, fim].join("|");
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

    let query = client
      .from("viagens")
      .select(
        "id, venda_id, data_inicio, data_fim, status, origem, destino, responsavel_user_id, cliente_id, clientes (nome, cpf, whatsapp), responsavel:users!responsavel_user_id (nome_completo), recibo:vendas_recibos (id, valor_total, valor_taxas, data_inicio, data_fim, numero_recibo, produto_id, tipo_produtos (id, nome, tipo))"
      )
      .eq("company_id", companyId)
      .order("data_inicio", { ascending: true });

    if (status) query = query.eq("status", status);
    if (inicio) query = query.gte("data_inicio", inicio);
    if (fim) query = query.lte("data_inicio", fim);
    if (deveRestringirResponsavel) query = query.eq("responsavel_user_id", user.id);

    const { data, error } = await query;
    if (error) throw error;

    const payload = {
      items: data || [],
      context: {
        userId: user.id,
        companyId,
        usoIndividual,
        userTypeName: tipoNome,
      },
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
    console.error("Erro viagens list:", e);
    return new Response("Erro ao carregar viagens.", { status: 500 });
  }
}
