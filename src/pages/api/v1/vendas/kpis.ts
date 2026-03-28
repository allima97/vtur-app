import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { fetchAndComputeVendasAgg } from "./_aggregates";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 15_000;
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

function isSeguroRecibo(recibo: any) {
  const tipo = String(recibo?.tipo_produtos?.tipo || "").toLowerCase();
  const nome = String(recibo?.tipo_produtos?.nome || "").toLowerCase();
  return tipo.includes("seguro") || nome.includes("seguro");
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
    const cacheRevision = String(url.searchParams.get("rev") || "").trim() || "0";
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    const hasDates = Boolean(inicio || fim);
    if (hasDates) {
      if (!isIsoDate(inicio) || !isIsoDate(fim)) {
        return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
      }
    }

    const vendorIdsParam = vendedorIdsRaw
      ? vendedorIdsRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => isUuid(v))
      : [];

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, company_id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");
    const isMaster = tipoName.includes("MASTER");
    const isGestor = tipoName.includes("GESTOR");

    if (!isAdmin) {
      const { data: acessos, error: acessoErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id)
        .in("modulo", ["vendas_consulta", "vendas"]);
      if (acessoErr) throw acessoErr;

      const podeVer = (acessos || []).some(
        (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 1
      );
      if (!podeVer) return new Response("Sem acesso a Vendas.", { status: 403 });
    }

    const companyIdFromProfile = String((perfil as any)?.company_id || "").trim();
    const companyId =
      isMaster && requestedCompanyId && requestedCompanyId !== "all"
        ? requestedCompanyId
        : companyIdFromProfile || (requestedCompanyId && requestedCompanyId !== "all" ? requestedCompanyId : "");

    let vendedorIds: string[] = [];

    if (vendorIdsParam.length > 0) {
      vendedorIds = vendorIdsParam.slice(0, 300);
    } else if (isAdmin) {
      vendedorIds = [];
    } else if (isMaster) {
      vendedorIds = [];
    } else if (isGestor) {
      try {
        const { data, error } = await client.rpc("gestor_equipe_vendedor_ids", { uid: user.id });
        if (error) throw error;
        const ids =
          (data || [])
            .map((row: any) => String(row?.vendedor_id || "").trim())
            .filter(Boolean) || [];
        vendedorIds = Array.from(new Set([user.id, ...ids]));
      } catch {
        vendedorIds = [user.id];
      }
    } else {
      vendedorIds = [user.id];
    }

    if (!isAdmin && vendedorIds.length === 0) {
      const emptyPayload = { totalVendas: 0, totalTaxas: 0, totalLiquido: 0, totalSeguro: 0 };
      return new Response(JSON.stringify(emptyPayload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=15",
          Vary: "Cookie",
        },
      });
    }

    const cacheKey = [
      "v1",
      "vendasKpis",
      user.id,
      hasDates ? inicio : "all",
      hasDates ? fim : "all",
      companyId || "all",
      vendedorIds.length === 0 ? "all" : vendedorIds.join(","),
      `rev:${cacheRevision}`,
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

    const agg = await fetchAndComputeVendasAgg(client, {
      companyId: companyId || null,
      vendedorIds: vendedorIds.length > 0 ? vendedorIds : null,
      inicio: hasDates ? inicio : null,
      fim: hasDates ? fim : null,
    });
    const rpcPayload = {
      totalVendas: agg.totalVendas,
      totalTaxas: agg.totalTaxas,
      totalLiquido: agg.totalLiquido,
      totalSeguro: agg.totalSeguro,
    };

    if (!noCache) {
      writeCache(cacheKey, rpcPayload);
      await kvCache.set(cacheKey, rpcPayload, 15);
    }

    return new Response(JSON.stringify(rpcPayload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": noCache ? "no-store" : "private, max-age=15",
        Vary: "Cookie",
      },
    });
  } catch (error: any) {
    console.error("[api/v1/vendas/kpis] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
