import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";
import { fetchAndComputeVendasAgg } from "./_aggregates";
import { buildReciboSearchTokens, matchesReciboSearch, onlyDigits } from "../../../../lib/searchNormalization";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 250;
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

function parseIntSafe(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  return intVal > 0 ? intVal : fallback;
}

function normalizeCampoBusca(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "cliente" || raw === "vendedor" || raw === "destino" || raw === "produto" || raw === "recibo"
    ? raw
    : "todos";
}

function isLikelyReciboQuery(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (!/^[0-9\s-]+$/.test(raw)) return false;
  return onlyDigits(raw).length >= 8;
}

function escapeLike(value: string) {
  return value.replace(/[%_,]/g, (match) => `\\${match}`);
}

async function resolveSearchVendaIds(client: any, params: {
  companyId: string;
  vendedorIds: string[];
  inicio: string;
  fim: string;
  query: string;
  campo: string;
}) {
  const queryRaw = String(params.query || "").trim();
  if (!queryRaw) return null;

  const campoBusca = normalizeCampoBusca(params.campo);
  const likelyRecibo = campoBusca === "recibo" || (campoBusca === "todos" && isLikelyReciboQuery(queryRaw));
  if (!likelyRecibo) return null;

  const reciboTokens = Array.from(
    new Set([queryRaw, ...buildReciboSearchTokens(queryRaw)].map((item) => String(item || "").trim()).filter(Boolean))
  ).slice(0, 6);

  if (reciboTokens.length === 0) return [];

  let recibosQuery = client
    .from("vendas_recibos")
    .select("venda_id, numero_recibo, vendas!inner(id, company_id, vendedor_id)")
    .limit(300);

  if (params.companyId) {
    recibosQuery = recibosQuery.eq("vendas.company_id", params.companyId);
  }
  if (params.vendedorIds.length > 0) {
    recibosQuery = recibosQuery.in("vendas.vendedor_id", params.vendedorIds);
  }

  const ilikeParts = reciboTokens.map((token) => `numero_recibo.ilike.%${escapeLike(token)}%`);
  if (ilikeParts.length > 0) {
    recibosQuery = recibosQuery.or(ilikeParts.join(","));
  }

  const { data, error } = await recibosQuery;
  if (error) throw error;

  const saleIds = new Set<string>();
  for (const row of Array.isArray(data) ? data : []) {
    if (!matchesReciboSearch((row as any)?.numero_recibo, queryRaw)) continue;
    const vendaId = String((row as any)?.venda_id || "").trim();
    if (vendaId) saleIds.add(vendaId);
  }

  return Array.from(saleIds);
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
    return MODULO_ALIASES[raw] || raw;
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
    if (moduloKey && allowed.has(moduloKey)) return true;
    const rawKey = String(row?.modulo || "").trim().toLowerCase();
    return rawKey ? allowed.has(rawKey) : false;
  });
  if (!podeVer) {
    return new Response(msg, { status: 403 });
  }
  return null;
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
    const requestedCompanyId = String(url.searchParams.get("company_id") || "").trim();
    const vendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const searchQuery = String(url.searchParams.get("q") || "").trim();
    const campoBusca = normalizeCampoBusca(url.searchParams.get("campo"));
    const includeKpis =
      String(url.searchParams.get("include_kpis") || "").trim() === "1" ||
      String(url.searchParams.get("kpis") || "").trim() === "1";
    const cacheRevision = String(url.searchParams.get("rev") || "").trim() || "0";
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    const page = parseIntSafe(url.searchParams.get("page"), 1);
    const pageSize = parseIntSafe(url.searchParams.get("pageSize"), 10);
    const all = String(url.searchParams.get("all") || "").trim() === "1";
    const openId = String(url.searchParams.get("id") || "").trim();

    if ((inicio || fim) && (!isIsoDate(inicio) || !isIsoDate(fim))) {
      return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
    }
    if (openId && !isUuid(openId)) {
      return new Response("id invalido.", { status: 400 });
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
      .select("id, company_id, uso_individual, user_types(name)")
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
        ["vendas_consulta", "vendas"],
        "Sem acesso a Vendas."
      );
      if (denied) return denied;
    }

    const companyIdFromProfile = String((perfil as any)?.company_id || "").trim();
    const companyId =
      papel === "MASTER" && requestedCompanyId && requestedCompanyId !== "all"
        ? requestedCompanyId
        : companyIdFromProfile || (requestedCompanyId && requestedCompanyId !== "all" ? requestedCompanyId : "");

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
      const emptyPayload = {
        page,
        pageSize,
        total: 0,
        items: [],
      };
      return new Response(JSON.stringify(emptyPayload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=10",
          Vary: "Cookie",
        },
      });
    }

    const cacheKey = [
      "v1",
      "vendasList",
      user.id,
      includeKpis ? "k1" : "k0",
      searchQuery || "-",
      campoBusca,
      openId || "-",
      inicio || "-",
      fim || "-",
      companyId || "all",
      vendedorIds.length === 0 ? "all" : vendedorIds.join(","),
      all ? "all" : `p${page}-${pageSize}`,
      `rev:${cacheRevision}`,
    ].join("|");

    if (!noCache) {
      // Try KV first (10 seconds TTL)
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

      // Fall back to local cache
      const localCached = readCache(cacheKey);
      if (localCached) {
        return new Response(JSON.stringify(localCached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=10",
            Vary: "Cookie",
          },
        });
      }
    }

    const recibosRelation = inicio && fim ? "recibos:vendas_recibos!inner" : "recibos:vendas_recibos";

    const baseSelect = `
      id,
      vendedor_id,
      cliente_id,
      destino_id,
      destino_cidade_id,
      company_id,
      data_lancamento,
      data_venda,
      data_embarque,
      data_final,
      valor_total,
      clientes (nome, whatsapp),
      vendedor:users!vendedor_id (nome_completo),
      destino_cidade:cidades!destino_cidade_id (id, nome),
      destinos:produtos!destino_id (
        nome,
        cidade_id
      ),
      ${recibosRelation} (
        id,
        venda_id,
        produto_id,
        numero_recibo,
        numero_reserva,
        tipo_pacote,
        valor_total,
        valor_taxas,
        data_inicio,
        data_fim,
        produto_resolvido_id,
        contrato_url,
        tipo_produtos (id, nome, tipo),
        produto_resolvido:produtos!produto_resolvido_id (id, nome)
      ),
      complementares:vendas_recibos_complementares (id, venda_id, recibo_id)
    `;

    let query = client
      .from("vendas")
      .select(baseSelect, { count: all || openId ? undefined : "exact" })
      .order("data_venda", { ascending: false });

    if (openId) {
      query = query.eq("id", openId);
    } else {
      const matchedSaleIds = await resolveSearchVendaIds(client, {
        companyId,
        vendedorIds,
        inicio,
        fim,
        query: searchQuery,
        campo: campoBusca,
      });
      const ignoringPeriodo = Boolean(searchQuery && matchedSaleIds !== null);

      if (inicio && fim && !ignoringPeriodo) {
        query = query.gte("recibos.data_venda", inicio).lte("recibos.data_venda", fim);
      }
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      if (vendedorIds.length > 0) {
        query = query.in("vendedor_id", vendedorIds);
      }
      if (matchedSaleIds) {
        if (matchedSaleIds.length === 0) {
          const emptyPayload = {
            page,
            pageSize,
            total: 0,
            items: [],
            ...(includeKpis
              ? { kpis: { totalVendas: 0, totalTaxas: 0, totalLiquido: 0, totalSeguro: 0 } }
              : {}),
          };
          return new Response(JSON.stringify(emptyPayload), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": noCache ? "no-store" : "private, max-age=10",
              Vary: "Cookie",
            },
          });
        }
        query = query.in("id", matchedSaleIds);
      }
    }

    if (!all && !openId) {
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      query = query.range(start, end);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    let kpis: { totalVendas: number; totalTaxas: number; totalLiquido: number; totalSeguro: number } | null = null;
    if (includeKpis && !openId) {
      const hasDates = Boolean(inicio && fim);
      const agg = await fetchAndComputeVendasAgg(client, {
        companyId: companyId || null,
        vendedorIds: vendedorIds.length > 0 ? vendedorIds : null,
        inicio: hasDates ? inicio : null,
        fim: hasDates ? fim : null,
      });
      kpis = {
        totalVendas: agg.totalVendas,
        totalTaxas: agg.totalTaxas,
        totalLiquido: agg.totalLiquido,
        totalSeguro: agg.totalSeguro,
      };
    }

    const payload = {
      page,
      pageSize,
      total: openId ? (data && data.length > 0 ? 1 : 0) : (all ? (data?.length || 0) : count || 0),
      items: data || [],
      ...(includeKpis ? { kpis } : {}),
    };

    if (!noCache) {
      writeCache(cacheKey, payload);
      await kvCache.set(cacheKey, payload, 10);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": noCache ? "no-store" : "private, max-age=10",
        Vary: "Cookie",
      },
    });
  } catch (error: any) {
    console.error("[api/v1/vendas/list] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
