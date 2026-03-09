import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";
import { cpfDigitsToFormatted, onlyDigits } from "../../../../lib/searchNormalization";

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

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function parseIntSafe(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  return intVal > 0 ? intVal : fallback;
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

async function fetchMasterEmpresas(client: any, masterId: string) {
  try {
    const { data, error } = await client
      .from("master_empresas")
      .select("company_id, status")
      .eq("master_id", masterId);
    if (error) throw error;
    return (data || [])
      .filter((row: any) => row?.status === "approved")
      .map((row: any) => String(row?.company_id || "").trim())
      .filter(Boolean);
  } catch {
    return [] as string[];
  }
}

function buildBuscaFilter(busca: string) {
  const term = busca.replace(/%/g, "").replace(/,/g, " ").trim();
  if (!term) return "";

  const digits = onlyDigits(term);
  const cpfCandidates = new Set<string>();
  cpfCandidates.add(term);
  if (digits && digits !== term) cpfCandidates.add(digits);
  if (digits.length === 11) cpfCandidates.add(cpfDigitsToFormatted(digits));

  const cpfFilters = Array.from(cpfCandidates)
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .map((t) => `cpf.ilike.%${t}%`);

  return [`nome.ilike.%${term}%`, ...cpfFilters, `email.ilike.%${term}%`].join(",");
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const page = parseIntSafe(url.searchParams.get("page"), 1);
    const pageSize = Math.min(200, parseIntSafe(url.searchParams.get("pageSize"), 20));
    const all = String(url.searchParams.get("all") || "").trim() === "1";
    const busca = String(url.searchParams.get("busca") || "").trim();
    const empresaIdRaw = String(url.searchParams.get("empresa_id") || "").trim();
    const vendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    const vendorIdsParam = vendedorIdsRaw
      ? vendedorIdsRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => isUuid(v))
          .slice(0, 500)
      : [];

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, company_id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const papel = resolvePapel(tipoName, false);

    if (papel !== "ADMIN") {
      const denied = await requireModuloView(
        client,
        user.id,
        ["clientes", "clientes_consulta"],
        "Sem acesso a Clientes."
      );
      if (denied) return denied;
    }

    let empresaScope: string[] | null = null;
    if (papel === "ADMIN") {
      if (isUuid(empresaIdRaw)) empresaScope = [empresaIdRaw];
    } else if (papel === "MASTER") {
      const empresas = await fetchMasterEmpresas(client, user.id);
      if (empresas.length === 0) {
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=10",
            Vary: "Cookie",
          },
        });
      }
      if (isUuid(empresaIdRaw) && empresas.includes(empresaIdRaw)) {
        empresaScope = [empresaIdRaw];
      } else {
        empresaScope = empresas;
      }
    } else {
      const companyId = String((perfil as any)?.company_id || "").trim();
      if (isUuid(companyId)) empresaScope = [companyId];
    }

    const scopeKey = empresaScope && empresaScope.length ? empresaScope.join(";") : "-";
    const cacheKey = [
      "v1",
      "clientes",
      "list",
      user.id,
      scopeKey,
      busca || "-",
      all ? "1" : "0",
      vendorIdsParam.join(";") || "-",
      String(page),
      String(pageSize),
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

    let clientesFiltroIds: string[] | null = null;
    const vendorFilterAtivo = (papel === "MASTER" || papel === "ADMIN") && vendorIdsParam.length > 0;
    if (vendorFilterAtivo) {
      let vendasQuery = client
        .from("vendas")
        .select("cliente_id")
        .in("vendedor_id", vendorIdsParam)
        .not("cliente_id", "is", null);
      if (empresaScope && empresaScope.length > 0) {
        vendasQuery = vendasQuery.in("company_id", empresaScope);
      }
      const { data: vendasClientes, error: vendasErr } = await vendasQuery;
      if (vendasErr) throw vendasErr;
      const ids = Array.from(
        new Set(
          (vendasClientes || [])
            .map((v: any) => v.cliente_id)
            .filter((id: string | null): id is string => Boolean(id))
        )
      );
      if (ids.length === 0) {
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=10",
            Vary: "Cookie",
          },
        });
      }
      clientesFiltroIds = ids;
    }

    let query = client
      .from("clientes")
      .select("id, nome, cpf, telefone, email, whatsapp, company_id, created_by", { count: "exact" });

    // Importante: clientes agora sao escopados por RLS via public.clientes_company.
    // Nao filtre por clientes.company_id.

    if (clientesFiltroIds && clientesFiltroIds.length > 0) {
      query = query.in("id", clientesFiltroIds);
    }

    if (busca) {
      const buscaFilter = buildBuscaFilter(busca);
      if (buscaFilter) {
        query = query.or(buscaFilter);
      }
    }

    query = query.order(all ? "nome" : "created_at", { ascending: all });

    if (!all) {
      const inicio = (page - 1) * pageSize;
      const fim = inicio + pageSize - 1;
      query = query.range(inicio, fim);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const payload = {
      items: (data || []) as any[],
      total: all ? (data || []).length : count ?? (data || []).length,
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
  } catch (err) {
    console.error("Erro clientes/list", err);
    return new Response("Erro ao carregar clientes.", { status: 500 });
  }
}
