import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";

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

function isIsoDate(value: string) {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value);
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

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

async function fetchGestorEquipeIdsComGestor(client: any, gestorId: string) {
  if (!gestorId) return [gestorId].filter(Boolean);
  try {
    const { data, error } = await client.rpc("gestor_equipe_vendedor_ids", { uid: gestorId });
    if (error) throw error;
    const ids =
      (data || [])
        .map((row: any) => String(row?.vendedor_id || "").trim())
        .filter(Boolean) || [];
    return Array.from(new Set([gestorId, ...ids]));
  } catch {
    return [gestorId];
  }
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

    const url = new URL(request.url);
    const inicio = String(url.searchParams.get("inicio") || "").trim();
    const fim = String(url.searchParams.get("fim") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();
    const vendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    if ((inicio || fim) && (!isIsoDate(inicio) || !isIsoDate(fim))) {
      return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
    }

    const vendorIdsParam = vendedorIdsRaw
      ? vendedorIdsRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => isUuid(v))
          .slice(0, 300)
      : [];

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const papel = resolvePapel(tipoName, usoIndividual);

    if (papel !== "ADMIN") {
      const denied = await requireModuloView(
        client,
        user.id,
        ["relatorios", "relatorios_produtos"],
        "Sem acesso a Relatorios."
      );
      if (denied) return denied;
    }

    let vendedorIds: string[] = [];
    if (papel === "ADMIN") {
      vendedorIds = vendorIdsParam;
    } else if (papel === "GESTOR") {
      vendedorIds = vendorIdsParam.length > 0 ? vendorIdsParam : await fetchGestorEquipeIdsComGestor(client, user.id);
    } else if (papel === "MASTER") {
      vendedorIds = vendorIdsParam;
    } else {
      vendedorIds = [user.id];
    }

    if (papel !== "ADMIN" && vendedorIds.length === 0) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=15",
          Vary: "Cookie",
        },
      });
    }

    const statusParam = !status || status === "todos" ? null : status;
    const vendorParam = vendedorIds.length > 0 ? vendedorIds : null;

    const cacheKey = [
      "v1",
      "relatorioProdutosRecibos",
      user.id,
      inicio || "-",
      fim || "-",
      statusParam || "-",
      vendorParam ? vendorParam.join(";") : "-",
    ].join("|");

    if (!noCache) {
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
    }

    const hasPeriodo = Boolean(inicio || fim);

    let query = client
      .from("vendas")
      .select(
        `
          id,
          vendedor_id,
          cliente_id,
          destino_id,
          produto_id,
          destino_cidade_id,
          data_venda,
          data_embarque,
          valor_total,
          status,
          destino_cidade:destino_cidade_id (nome),
          destinos:produtos!destino_id (nome, cidade_id),
          vendas_recibos${hasPeriodo ? "!inner" : ""} (
            numero_recibo,
            produto_id,
            data_venda,
            valor_total,
            valor_taxas,
            valor_du,
            produtos:tipo_produtos!produto_id (nome, tipo)
          )
        `
      )
      .order("data_venda", { ascending: false });

    if (vendorParam) {
      query = query.in("vendedor_id", vendorParam);
    }
    // Competência por recibo
    if (inicio) query = query.gte("vendas_recibos.data_venda", inicio);
    if (fim) query = query.lte("vendas_recibos.data_venda", fim);
    if (statusParam) {
      query = query.eq("status", statusParam);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    writeCache(cacheKey, rows);
    await kvCache.set(cacheKey, rows, 15);

    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=15",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro relatorios/produtos-recibos", err);
    return new Response("Erro ao carregar relatorio de produtos por recibo.", { status: 500 });
  }
}
