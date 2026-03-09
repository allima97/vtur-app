import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

const CACHE_TTL_SECONDS = 300;
const LOCAL_CACHE_TTL_MS = 300_000;
const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const MAX_FILTER_IDS = 300;

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

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
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  if (normalized === "consultoria_online") return "consultoria_online";
  if (normalized === "consultoria") return "consultoria";
  if (normalized === "operacao") return "operacao";
  return normalized;
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
  cache.set(key, { expiresAt: Date.now() + LOCAL_CACHE_TTL_MS, payload });
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function isRpcMissing(error: any, fnName: string) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const needle = String(fnName || "").toLowerCase();
  return (
    code === "42883" ||
    (needle && message.includes(needle) && (message.includes("does not exist") || message.includes("could not find")))
  );
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
    try {
      const { data, error } = await client
        .from("gestor_vendedor")
        .select("vendedor_id, ativo")
        .eq("gestor_id", gestorId);
      if (error) throw error;
      const ids =
        (data || [])
          .filter((row: any) => row?.ativo !== false)
          .map((row: any) => String(row?.vendedor_id || "").trim())
          .filter(Boolean) || [];
      return Array.from(new Set([gestorId, ...ids]));
    } catch {
      return [gestorId];
    }
  }
}

async function fetchCompanyUserIds(client: any, companyId: string) {
  if (!companyId) return [];
  const { data, error } = await client
    .from("users")
    .select("id")
    .eq("company_id", companyId);
  if (error) throw error;
  return (data || []).map((row: any) => String(row?.id || "").trim()).filter(Boolean);
}

async function fetchCompanyClienteIds(client: any, companyId: string) {
  if (!companyId) return [];
  const { data, error } = await client
    .from("clientes_company")
    .select("cliente_id")
    .eq("company_id", companyId);
  if (error) throw error;
  return (data || [])
    .map((row: any) => String(row?.cliente_id || "").trim())
    .filter(Boolean);
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const mode = String(url.searchParams.get("mode") || "geral").trim().toLowerCase();
    const requestedCompanyId = String(url.searchParams.get("company_id") || "").trim();
    const requestedVendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    const requestedVendedorIds = requestedVendedorIdsRaw
      ? Array.from(
          new Set(
            requestedVendedorIdsRaw
              .split(",")
              .map((v) => v.trim())
              .filter((v) => isUuid(v))
          )
        ).slice(0, 300)
      : [];

    if (mode !== "geral" && mode !== "gestor") {
      return new Response("mode invalido (use mode=geral ou mode=gestor).", { status: 400 });
    }

    const { data: usuarioDb, error: usuarioErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (usuarioErr) throw usuarioErr;

    const tipoName = String((usuarioDb as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");
    const isGestor = tipoName.includes("GESTOR");
    const isMaster = tipoName.includes("MASTER");

    let canDashboard = true;
    let canConsultoria = true;

    if (!isAdmin) {
      const { data: acessos, error: acessosErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id);
      if (acessosErr) throw acessosErr;

      canDashboard = (acessos || []).some(
        (row: any) =>
          row?.ativo &&
          normalizeModulo(row?.modulo) === "dashboard" &&
          permLevel(row?.permissao) >= 1
      );
      canConsultoria = (acessos || []).some((row: any) => {
        if (!row?.ativo) return false;
        const moduloKey = normalizeModulo(row?.modulo);
        if (moduloKey !== "consultoria" && moduloKey !== "consultoria_online") return false;
        return permLevel(row?.permissao) >= 1;
      });
    }

    if (!canDashboard) return new Response("Sem acesso ao Dashboard.", { status: 403 });
    if (!canConsultoria) return new Response("Sem acesso a Consultoria.", { status: 403 });

    let vendedorIds: string[] = [user.id];
    let papel = "VENDEDOR";

    if (isAdmin) {
      papel = "ADMIN";
      vendedorIds = requestedVendedorIds;
    } else if (isGestor) {
      papel = "GESTOR";
      vendedorIds = await fetchGestorEquipeIdsComGestor(client, user.id);
    } else if (isMaster) {
      if (mode === "gestor") {
        papel = "MASTER";
        vendedorIds = requestedVendedorIds;
      } else {
        papel = "OUTRO";
        vendedorIds = [user.id];
      }
    }

    const companyId =
      mode === "gestor" && requestedCompanyId && requestedCompanyId !== "all"
        ? requestedCompanyId
        : null;

    const agoraIso = new Date().toISOString();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    const limiteIso = limite.toISOString();

    const cacheKey = [
      "v1",
      "dashboardConsultorias",
      mode,
      user.id,
      papel,
      companyId || "all",
      vendedorIds.length === 0 ? "all" : vendedorIds.join(","),
    ].join("|");

    if (!noCache) {
      const kvCached = await kvCache.get<any>(cacheKey);
      if (kvCached) {
        return new Response(JSON.stringify(kvCached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=300",
            Vary: "Cookie",
          },
        });
      }

      const localCached = readCache(cacheKey);
      if (localCached) {
        return new Response(JSON.stringify(localCached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=300",
            Vary: "Cookie",
          },
        });
      }
    }

    try {
      const { data: rpcData, error: rpcErr } = await client.rpc("rpc_dashboard_consultorias", {
        p_company_id: companyId,
        p_vendedor_ids: vendedorIds.length > 0 ? vendedorIds : null,
        p_inicio: agoraIso,
        p_fim: limiteIso,
      });
      if (rpcErr) throw rpcErr;

      const payload = { items: rpcData || [] };
      if (!noCache) {
        writeCache(cacheKey, payload);
        await kvCache.set(cacheKey, payload, CACHE_TTL_SECONDS);
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": noCache ? "no-store" : "private, max-age=300",
          Vary: "Cookie",
        },
      });
    } catch (rpcError: any) {
      if (!isRpcMissing(rpcError, "rpc_dashboard_consultorias")) throw rpcError;
    }

    if (companyId && vendedorIds.length === 0) {
      vendedorIds = await fetchCompanyUserIds(client, companyId);
    }

    const clienteIds = companyId ? await fetchCompanyClienteIds(client, companyId) : [];

    if (companyId && vendedorIds.length === 0 && clienteIds.length === 0) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": noCache ? "no-store" : "private, max-age=300",
          Vary: "Cookie",
        },
      });
    }

    let consultoriasQuery = client
      .from("consultorias_online")
      .select("id, cliente_nome, data_hora, lembrete, destino, orcamento_id")
      .eq("fechada", false)
      .gte("data_hora", agoraIso)
      .lte("data_hora", limiteIso)
      .order("data_hora", { ascending: true })
      .limit(50);

    if (companyId && clienteIds.length > 0 && vendedorIds.length > 0) {
      const clienteSlice = clienteIds.slice(0, MAX_FILTER_IDS).join(",");
      const vendedorSlice = vendedorIds.slice(0, MAX_FILTER_IDS).join(",");
      consultoriasQuery = consultoriasQuery.or(
        `created_by.in.(${vendedorSlice}),cliente_id.in.(${clienteSlice})`
      );
    } else if (clienteIds.length > 0) {
      consultoriasQuery = consultoriasQuery.in("cliente_id", clienteIds.slice(0, MAX_FILTER_IDS));
    } else if (vendedorIds.length > 0) {
      consultoriasQuery = consultoriasQuery.in("created_by", vendedorIds);
    }

    const { data, error } = await consultoriasQuery;
    if (error) throw error;

    const payload = { items: data || [] };

    if (!noCache) {
      writeCache(cacheKey, payload);
      await kvCache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": noCache ? "no-store" : "private, max-age=300",
        Vary: "Cookie",
      },
    });
  } catch (error: any) {
    console.error("[api/v1/dashboard/consultorias] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}