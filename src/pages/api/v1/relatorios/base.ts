import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 50;
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

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

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

function resolvePapel(tipoNome: string): Papel {
  const tipo = String(tipoNome || "").toUpperCase();
  if (tipo.includes("ADMIN")) return "ADMIN";
  if (tipo.includes("MASTER")) return "MASTER";
  if (tipo.includes("GESTOR")) return "GESTOR";
  if (tipo.includes("VENDEDOR")) return "VENDEDOR";
  return "OUTRO";
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

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const papel = resolvePapel(tipoName);

    if (papel !== "ADMIN") {
      const denied = await requireModuloView(
        client,
        user.id,
        ["relatorios", "relatorios_vendas"],
        "Sem acesso a Relatorios."
      );
      if (denied) return denied;
    }

    const cacheKey = ["v1", "relatorioBase", user.id].join("|");
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=60",
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
          "Cache-Control": "private, max-age=60",
          Vary: "Cookie",
        },
      });
    }

    const clientesPromise = client
      .from("clientes")
      .select("id, nome, cpf")
      .order("nome", { ascending: true });

    const produtosPromise = client
      .from("produtos")
      .select("id, nome, tipo_produto, cidade_id, todas_as_cidades")
      .order("nome", { ascending: true });

    const tiposBaseCols = "id, nome, tipo";
    const tiposExtraCols =
      ", regra_comissionamento, soma_na_meta, usa_meta_produto, meta_produto_valor, comissao_produto_meta_pct, descontar_meta_geral, exibe_kpi_comissao";

    const tiposPromise = client
      .from("tipo_produtos")
      .select(`${tiposBaseCols}${tiposExtraCols}`)
      .order("nome", { ascending: true });

    const cidadesPromise = client
      .from("cidades")
      .select("id, nome")
      .order("nome", { ascending: true });

    const [clientesRes, produtosRes, tiposRes, cidadesRes] = await Promise.all([
      clientesPromise,
      produtosPromise,
      tiposPromise,
      cidadesPromise,
    ]);

    if (clientesRes.error) throw clientesRes.error;
    if (produtosRes.error) throw produtosRes.error;
    if (cidadesRes.error) throw cidadesRes.error;

    let tiposData = tiposRes.data;
    if (tiposRes.error && tiposRes.error.code === "42703") {
      const fallback = await client
        .from("tipo_produtos")
        .select(tiposBaseCols)
        .order("nome", { ascending: true });
      if (fallback.error) throw fallback.error;
      tiposData = fallback.data;
    } else if (tiposRes.error) {
      throw tiposRes.error;
    }

    const payload = {
      clientes: clientesRes.data || [],
      produtos: produtosRes.data || [],
      tiposProdutos: tiposData || [],
      cidades: cidadesRes.data || [],
    };

    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 60);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro relatorios/base", err);
    return new Response("Erro ao carregar base de relatorios.", { status: 500 });
  }
}
