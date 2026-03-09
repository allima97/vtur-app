import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

const CACHE_TTL_SECONDS = 300;
const LOCAL_CACHE_TTL_MS = 300_000;
const cache = new Map<string, { expiresAt: number; payload: unknown }>();

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

type Cliente = {
  id: string;
  nome: string;
  nascimento: string | null;
  telefone: string | null;
  telefone_principal?: string | null;
  pessoa_tipo?: "cliente" | "acompanhante";
  cliente_id?: string | null;
};

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

function resolveMonth(raw: string | null) {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return parsed;
  return new Date().getMonth() + 1;
}

async function fetchClientesByScope(client: any, vendorIds: string[], companyId: string | null) {
  if (vendorIds.length === 0) {
    let query = client.from("clientes").select("id, nome, nascimento, telefone");
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  let vendasQuery = client
    .from("vendas")
    .select("cliente_id")
    .in("vendedor_id", vendorIds)
    .not("cliente_id", "is", null);
  if (companyId) vendasQuery = vendasQuery.eq("company_id", companyId);

  const { data: vendasClientes, error: vendasClientesErr } = await vendasQuery;
  if (vendasClientesErr) throw vendasClientesErr;

  const clienteIds = Array.from(
    new Set(
      (vendasClientes || [])
        .map((v: any) => v?.cliente_id)
        .filter((id: string | null): id is string => Boolean(id))
    )
  );
  if (clienteIds.length === 0) return [];

  const { data, error } = await client
    .from("clientes")
    .select("id, nome, nascimento, telefone")
    .in("id", clienteIds);
  if (error) throw error;
  return data || [];
}

async function fetchAcompanhantesByScope(client: any, vendorIds: string[], companyId: string | null): Promise<Cliente[]> {
  let viagensQuery = client
    .from("viagens")
    .select(
      `
        id,
        company_id,
        venda:vendas (
          id,
          vendedor_id,
          cancelada
        ),
        viagem_acompanhantes (
          acompanhante_id,
          cliente_acompanhantes:acompanhante_id (
            id,
            cliente_id,
            nome_completo,
            data_nascimento,
            telefone
          )
        )
      `
    )
    .eq("venda.cancelada", false);

  if (companyId) viagensQuery = viagensQuery.eq("company_id", companyId);
  if (vendorIds.length > 0) viagensQuery = viagensQuery.in("venda.vendedor_id", vendorIds);

  const { data, error } = await viagensQuery;
  if (error) throw error;

  const titularIds = new Set<string>();
  (data || []).forEach((viagem: any) => {
    const items = Array.isArray(viagem?.viagem_acompanhantes) ? viagem.viagem_acompanhantes : [];
    items.forEach((item: any) => {
      const acomp = item?.cliente_acompanhantes;
      const titularId = String(acomp?.cliente_id || "").trim();
      if (titularId) titularIds.add(titularId);
    });
  });

  const telefoneTitularById = new Map<string, string | null>();
  if (titularIds.size > 0) {
    const { data: titulares } = await client
      .from("clientes")
      .select("id, telefone")
      .in("id", Array.from(titularIds));
    (titulares || []).forEach((row: any) => {
      telefoneTitularById.set(String(row?.id || "").trim(), row?.telefone || null);
    });
  }

  const acompanhantesMap = new Map<string, Cliente>();
  (data || []).forEach((viagem: any) => {
    const items = Array.isArray(viagem?.viagem_acompanhantes) ? viagem.viagem_acompanhantes : [];
    items.forEach((item: any) => {
      const acomp = item?.cliente_acompanhantes;
      const id = String(acomp?.id || "").trim();
      if (!id || acompanhantesMap.has(id)) return;
      const titularId = String(acomp?.cliente_id || "").trim() || null;
      const telefoneTitular = titularId ? telefoneTitularById.get(titularId) || null : null;
      acompanhantesMap.set(id, {
        id,
        nome: String(acomp?.nome_completo || "").trim(),
        nascimento: acomp?.data_nascimento || null,
        telefone: acomp?.telefone || telefoneTitular || null,
        telefone_principal: telefoneTitular,
        pessoa_tipo: "acompanhante",
        cliente_id: titularId,
      });
    });
  });

  return Array.from(acompanhantesMap.values());
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
    const month = resolveMonth(url.searchParams.get("month"));
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

    if (!isAdmin) {
      const { data: acessos, error: acessosErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id);
      if (acessosErr) throw acessosErr;
      const podeVer = (acessos || []).some(
        (row: any) =>
          row?.ativo &&
          permLevel(row?.permissao as Permissao) >= 1 &&
          normalizeModulo(row?.modulo) === "dashboard"
      );
      if (!podeVer) return new Response("Sem acesso ao Dashboard.", { status: 403 });
    }

    let vendedorIds: string[] = [user.id];
    let papel: string = "VENDEDOR";

    if (isAdmin) {
      papel = "ADMIN";
      vendedorIds = requestedVendedorIds;
    } else if (isGestor) {
      papel = "GESTOR";
      vendedorIds = requestedVendedorIds.length > 0 ? requestedVendedorIds : [user.id];
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

    const cacheKey = [
      "v1",
      "dashboardAniversariantes",
      mode,
      user.id,
      papel,
      month,
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

    const [clientes, acompanhantes] = await Promise.all([
      fetchClientesByScope(client, vendedorIds, companyId),
      fetchAcompanhantesByScope(client, vendedorIds, companyId),
    ]);

    const clientesNormalizados = (clientes || []).map((c: any) => ({
      id: String(c?.id || "").trim(),
      nome: String(c?.nome || "").trim(),
      nascimento: c?.nascimento || null,
      telefone: c?.telefone || null,
      pessoa_tipo: "cliente" as const,
      cliente_id: String(c?.id || "").trim() || null,
    }));

    const items = [...clientesNormalizados, ...(acompanhantes || [])].filter((c: Cliente) => {
      if (!c?.nascimento) return false;
      const date = new Date(c.nascimento);
      if (Number.isNaN(date.getTime())) return false;
      return date.getMonth() + 1 === month;
    });

    const payload = { month, items };

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
    console.error("[api/v1/dashboard/aniversariantes] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
