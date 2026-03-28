import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { fetchAndComputeVendasAgg } from "../vendas/_aggregates";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 20_000;
const CACHE_MAX_ENTRIES = 150;
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

type ModuloAcessoRow = {
  modulo: string | null;
  permissao: string | null;
  ativo: boolean | null;
};

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

function normalizePermissao(value?: string | null): Permissao {
  const perm = String(value || "").toLowerCase();
  if (perm === "admin") return "admin";
  if (perm === "delete") return "delete";
  if (perm === "edit") return "edit";
  if (perm === "create") return "create";
  if (perm === "view") return "view";
  return "none";
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

function permLevel(value: Permissao): number {
  switch (value) {
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

function buildPermsMap(rows: ModuloAcessoRow[]) {
  const map: Record<string, Permissao> = {};
  rows.forEach((row) => {
    const key = normalizeModulo(row.modulo);
    if (!key) return;
    const perm = row.ativo ? normalizePermissao(row.permissao) : "none";
    const current = map[key] ?? "none";
    map[key] = permLevel(perm) > permLevel(current) ? perm : current;
  });
  return map;
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

type VendasAgg = {
  totalVendas: number;
  totalTaxas: number;
  totalLiquido: number;
  totalSeguro: number;
  qtdVendas: number;
  ticketMedio: number;
  timeline: Array<{ date: string; value: number }>;
  topDestinos: Array<{ name: string; value: number }>;
  porProduto: Array<{ id: string; name: string; value: number }>;
  porVendedor: Array<{ vendedor_id: string; total: number; qtd: number }>;
};

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

async function fetchClientes(client: any, vendedorIds: string[]) {
  if (vendedorIds.length === 0) {
    const { data, error } = await client
      .from("clientes")
      .select("id, nome, nascimento, telefone");
    if (error) throw error;
    return data || [];
  }

  const { data: vendasClientes, error: vendasClientesErr } = await client
    .from("vendas")
    .select("cliente_id")
    .in("vendedor_id", vendedorIds)
    .not("cliente_id", "is", null);
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

async function fetchDashboardWidgets(client: any, userId: string) {
  try {
    const { data, error } = await client
      .from("dashboard_widgets")
      .select("widget, ordem, visivel, settings")
      .eq("usuario_id", userId)
      .order("ordem", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

async function fetchPorProdutoFallback(
  client: any,
  companyId: string | null,
  vendedorIds: string[],
  inicio: string,
  fim: string
) {
  let query = client
    .from("vendas")
    .select("destino_id, valor_total, destinos:produtos!destino_id (nome, tipo_produto)")
    .eq("cancelada", false)
    .gte("data_venda", inicio)
    .lte("data_venda", fim);

  if (companyId) query = query.eq("company_id", companyId);
  if (vendedorIds.length > 0) query = query.in("vendedor_id", vendedorIds);

  const { data, error } = await query.limit(3000);
  if (error) throw error;

  const map = new Map<string, { id: string; name: string; value: number }>();
  (data || []).forEach((row: any) => {
    const name = String(row?.destinos?.nome || "Sem produto");
    const idRaw = String(row?.destinos?.tipo_produto || "").trim();
    const id = idRaw || `nome:${name.toLowerCase()}`;
    const value = Number(row?.valor_total || 0);
    const current = map.get(id);
    if (!current) {
      map.set(id, { id, name, value });
    } else {
      current.value += value;
    }
  });

  return Array.from(map.values()).sort((a, b) => b.value - a.value);
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
    const mode = String(url.searchParams.get("mode") || "geral").trim().toLowerCase();
    const requestedCompanyId = String(url.searchParams.get("company_id") || "").trim();
    const requestedVendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const includeClientes = String(url.searchParams.get("include_clientes") || "1").trim() === "1";
    const includeOrcamentos =
      String(url.searchParams.get("include_orcamentos") || "1").trim() === "1";
    const includeConsultorias =
      String(url.searchParams.get("include_consultorias") || "1").trim() === "1";
    const includeViagens =
      String(url.searchParams.get("include_viagens") || "1").trim() === "1";
    const includeFollowUps =
      String(url.searchParams.get("include_followups") || "1").trim() === "1";
    const cacheRevision = String(url.searchParams.get("rev") || "").trim() || "0";
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";
    const responseCacheControl = noCache ? "no-store" : "private, max-age=20";

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

    if (!isIsoDate(inicio) || !isIsoDate(fim)) {
      return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
    }

    const { data: usuarioDb, error: usuarioErr } = await client
      .from("users")
      .select("id, nome_completo, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (usuarioErr) throw usuarioErr;

    const tipoName = String((usuarioDb as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");
    const isGestor = tipoName.includes("GESTOR");
    const isMaster = tipoName.includes("MASTER");

    if (mode !== "geral" && mode !== "gestor") {
      return new Response("mode invalido (use mode=geral ou mode=gestor).", { status: 400 });
    }

    const cacheKeyParts: string[] = [
      "v1",
      "dashboardSummary",
      mode,
      user.id,
      inicio,
      fim,
      tipoName || "sem_tipo",
      `rev:${cacheRevision}`,
    ];

    let perms: Record<string, Permissao> = {};
    if (!isAdmin) {
      const { data: acessos, error: acessosErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id);
      if (!acessosErr) {
        perms = buildPermsMap((acessos || []) as ModuloAcessoRow[]);
      }
    }

    const canDashboard = isAdmin || permLevel(perms["dashboard"] ?? "none") >= 1;
    if (!canDashboard) {
      return new Response("Sem acesso ao Dashboard.", { status: 403 });
    }

    const canOperacao = isAdmin || permLevel(perms["operacao"] ?? "none") >= 1;
    const canConsultoria =
      isAdmin || permLevel(perms["consultoria_online"] ?? "none") >= 1;

    let vendedorIds: string[] = [user.id];
    let papel: string = "VENDEDOR";

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

    cacheKeyParts.push(vendedorIds.length === 0 ? "all" : vendedorIds.join(","));
    if (mode === "gestor") {
      const companyKey =
        requestedCompanyId && requestedCompanyId !== "all" ? requestedCompanyId : "all";
      cacheKeyParts.push(`c:${companyKey}`);
    }
    cacheKeyParts.push(canOperacao ? "op1" : "op0");
    cacheKeyParts.push(canConsultoria ? "co1" : "co0");
    cacheKeyParts.push(includeClientes ? "cl1" : "cl0");
    cacheKeyParts.push(includeOrcamentos ? "oc1" : "oc0");
    cacheKeyParts.push(includeConsultorias ? "cs1" : "cs0");
    cacheKeyParts.push(includeViagens ? "vj1" : "vj0");
    cacheKeyParts.push(includeFollowUps ? "fu1" : "fu0");
    const cacheKey = cacheKeyParts.join("|");

    if (!noCache) {
      const kvCached = await kvCache.get<any>(cacheKey);
      if (kvCached) {
        return new Response(JSON.stringify(kvCached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": responseCacheControl,
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
            "Cache-Control": responseCacheControl,
            Vary: "Cookie",
          },
        });
      }
    }

    const vendasAggPromise = (async (): Promise<VendasAgg> => {
      const companyId =
        requestedCompanyId && requestedCompanyId !== "all" ? requestedCompanyId : null;
      const agg = await fetchAndComputeVendasAgg(client, {
        companyId,
        vendedorIds: vendedorIds.length > 0 ? vendedorIds : null,
        inicio,
        fim,
      });
      if (agg.porProduto.length === 0 && agg.totalVendas > 0) {
        agg.porProduto = await fetchPorProdutoFallback(client, companyId, vendedorIds, inicio, fim);
      }
      return agg;
    })();

    const tiposPromise = (async () => {
      if (mode !== "geral") return [];
      const { data, error } = await client
        .from("tipo_produtos")
        .select("id, nome, exibe_kpi_comissao");
      if (error) throw error;
      return data || [];
    })();

    const orcamentosPromise = includeOrcamentos
      ? (async () => {
      let orcamentosQuery = client
        .from("quote")
        .select(
          "id, created_at, status, status_negociacao, total, client_id, cliente:client_id (id, nome), quote_item (id, title, product_name, item_type, city_name)"
        )
        .gte("created_at", inicio)
        .lte("created_at", fim)
        .order("created_at", { ascending: false })
        .limit(20);
      if (vendedorIds.length > 0) {
        orcamentosQuery = orcamentosQuery.in("created_by", vendedorIds);
      }
      const { data, error } = await orcamentosQuery;
      if (error) throw error;
      return data || [];
    })()
      : Promise.resolve([]);

    const metasPromise = (async () => {
      let metasQuery = client
        .from("metas_vendedor")
        .select("id, vendedor_id, periodo, meta_geral, meta_diferenciada, ativo, scope")
        .gte("periodo", inicio)
        .lte("periodo", fim)
        .eq("ativo", true);

      if (vendedorIds.length > 0) {
        metasQuery = metasQuery.in("vendedor_id", vendedorIds);
      }
      if (mode === "geral") {
        metasQuery = metasQuery.or("scope.is.null,scope.eq.vendedor");
      }
      const { data, error } = await metasQuery;
      if (error) throw error;
      return data || [];
    })();

    const followUpPromise = includeFollowUps
      ? (async () => {
      try {
        const hoje = new Date();
        const ontem = new Date(hoje);
        ontem.setDate(hoje.getDate() - 1);
        const ontemIso = ontem.toISOString().slice(0, 10);
        const fimFollowUp = fim < ontemIso ? fim : ontemIso;
        if (fimFollowUp < inicio) return [];

        let followUpQuery = client
          .from("viagens")
          .select(
            `
              id,
              venda_id,
              data_inicio,
              data_fim,
              follow_up_fechado,
              venda:vendas (
                id,
                data_embarque,
                data_final,
                vendedor_id,
                cancelada,
                clientes:clientes (id, nome),
                destino_cidade:cidades!destino_cidade_id (id, nome)
              )
            `
          )
          .not("data_fim", "is", null)
          .gte("data_fim", inicio)
          .lte("data_fim", fimFollowUp)
          .or("follow_up_fechado.is.null,follow_up_fechado.eq.false")
          .eq("venda.cancelada", false)
          .order("data_fim", { ascending: false })
          .limit(20);

        if (vendedorIds.length > 0) {
          followUpQuery = followUpQuery.in("venda.vendedor_id", vendedorIds);
        }

        const { data, error } = await followUpQuery;
        if (error) throw error;
        return data || [];
      } catch {
        return [];
      }
    })()
      : Promise.resolve([]);

    const consultoriasPromise = includeConsultorias
      ? (async () => {
      if (mode !== "geral") return [];
      if (!canConsultoria) return [];
      try {
        const agoraIso = new Date().toISOString();
        const limite = new Date();
        limite.setDate(limite.getDate() + 30);
        let consultoriasQuery = client
          .from("consultorias_online")
          .select("id, cliente_nome, data_hora, lembrete, destino, orcamento_id")
          .eq("fechada", false)
          .gte("data_hora", agoraIso)
          .lte("data_hora", limite.toISOString())
          .order("data_hora", { ascending: true })
          .limit(50);
        if (vendedorIds.length > 0) {
          consultoriasQuery = consultoriasQuery.in("created_by", vendedorIds);
        }
        const { data, error } = await consultoriasQuery;
        if (error) throw error;
        return data || [];
      } catch {
        return [];
      }
    })()
      : Promise.resolve([]);

    const viagensPromise = includeViagens
      ? (async () => {
      if (!canOperacao) return [];
      if (mode === "gestor") {
        try {
          const hojeIso = new Date().toISOString().slice(0, 10);
          const limiteData = new Date();
          limiteData.setDate(limiteData.getDate() + 14);
          const limiteIso = limiteData.toISOString().slice(0, 10);
          let viagensQuery = client
            .from("viagens")
            .select(
              `
              id,
              data_inicio,
              data_fim,
              status,
              destino,
              responsavel_user_id,
              clientes:clientes (id, nome)
            `
            )
            .gte("data_inicio", hojeIso)
            .lte("data_inicio", limiteIso)
            .order("data_inicio", { ascending: true })
            .limit(20);

          if (vendedorIds.length > 0) {
            viagensQuery = viagensQuery.in("responsavel_user_id", vendedorIds);
          }

          const { data, error } = await viagensQuery;
          if (error) throw error;
          return data || [];
        } catch {
          return [];
        }
      }
      try {
        const hojeIso = new Date().toISOString().slice(0, 10);
        const limiteData = new Date();
        limiteData.setDate(limiteData.getDate() + 14);
        const limiteIso = limiteData.toISOString().slice(0, 10);
        let viagensQuery = client
          .from("viagens")
          .select(`
            id,
            data_inicio,
            data_fim,
            status,
            origem,
            destino,
            responsavel_user_id,
            venda:vendas (
              vendedor_id,
              cancelada
            ),
            clientes:clientes (id, nome),
            recibo:vendas_recibos (
              id,
              venda_id,
              produto_id,
              tipo_produtos (id, nome, tipo)
            )
          `)
          .gte("data_inicio", hojeIso)
          .lte("data_inicio", limiteIso)
          .order("data_inicio", { ascending: true })
          .limit(20);

        if (vendedorIds.length > 0) {
          viagensQuery = viagensQuery.in("venda.vendedor_id", vendedorIds);
        }
        viagensQuery = viagensQuery.eq("venda.cancelada", false);

        const { data, error } = await viagensQuery;
        if (error) throw error;
        return data || [];
      } catch {
        return [];
      }
    })()
      : Promise.resolve([]);

    const widgetsPromise = mode === "geral" ? fetchDashboardWidgets(client, user.id) : Promise.resolve([]);
    const clientesPromise =
      includeClientes
        ? mode === "geral"
          ? fetchClientes(client, vendedorIds)
          : (async () => {
              const { data, error } = await client
                .from("clientes")
                .select("id, nome, nascimento, telefone");
              if (error) throw error;
              return data || [];
            })()
        : Promise.resolve([]);

    const equipeNomesPromise =
      mode !== "gestor"
        ? Promise.resolve(null)
        : (async () => {
            if (vendedorIds.length === 0) return {};
            const { data, error } = await client
              .from("users")
              .select("id, nome_completo")
              .in("id", vendedorIds);
            if (error) throw error;
            const map: Record<string, string> = {};
            (data || []).forEach((row: any) => {
              if (!row?.id) return;
              map[String(row.id)] = String(row.nome_completo || "");
            });
            return map;
          })();

    const [
      tiposProduto,
      vendasAgg,
      orcamentos,
      metas,
      clientes,
      consultoriasOnline,
      viagens,
      followUps,
      widgetPrefs,
      equipeNomes,
    ] = await Promise.all([
      tiposPromise,
      vendasAggPromise,
      orcamentosPromise,
      metasPromise,
      clientesPromise,
      consultoriasPromise,
      viagensPromise,
      followUpPromise,
      widgetsPromise,
      equipeNomesPromise,
    ]);

    const payload = {
      inicio,
      fim,
      userCtx: {
        usuarioId: user.id,
        nome: (usuarioDb as any)?.nome_completo || null,
        papel,
        vendedorIds,
      },
      podeVerOperacao: canOperacao,
      podeVerConsultoria: canConsultoria,
      tiposProduto,
      vendasAgg,
      orcamentos,
      metas,
      clientes,
      consultoriasOnline,
      viagens,
      followUps,
      widgetPrefs,
      ...(mode === "gestor" ? { equipeNomes } : {}),
    };

    if (!noCache) {
      writeCache(cacheKey, payload);
      await kvCache.set(cacheKey, payload, 20);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": noCache ? "no-store" : "private, max-age=20",
        Vary: "Cookie",
      },
    });
  } catch (error: any) {
    console.error("[api/v1/dashboard/summary] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
