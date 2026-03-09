import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";

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

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function computeVendasAggFromRows(rows: any[]): VendasAgg {
  let totalVendas = 0;
  let totalTaxas = 0;
  let totalSeguro = 0;

  const timelineMap = new Map<string, number>();
  const destinoMap = new Map<string, number>();
  const produtoMap = new Map<string, { id: string; name: string; value: number }>();
  const vendedorMap = new Map<string, { vendedor_id: string; total: number; qtd: number }>();

  const includesSeguro = (tipo: string, nome: string) => {
    const t = (tipo || "").toLowerCase();
    const n = (nome || "").toLowerCase();
    return t.includes("seguro") || n.includes("seguro");
  };

  let qtdVendas = 0;

  rows.forEach((venda) => {
    const recibos: any[] = Array.isArray(venda?.vendas_recibos) ? venda.vendas_recibos : [];

    if (recibos.length === 0) {
      const vendaTotal = Number(venda?.valor_total || 0);
      const vendaTaxas = Number(venda?.valor_taxas || 0);
      totalVendas += vendaTotal;
      totalTaxas += vendaTaxas;
      qtdVendas += vendaTotal > 0 ? 1 : 0;

      const dia = String(venda?.data_venda || "").slice(0, 10);
      if (dia) timelineMap.set(dia, (timelineMap.get(dia) || 0) + vendaTotal);

      const destinoNome = String(venda?.destinos?.nome || venda?.destino?.nome || "Sem destino");
      destinoMap.set(destinoNome, (destinoMap.get(destinoNome) || 0) + vendaTotal);
      const produtoId = String(venda?.destinos?.tipo_produto || venda?.destino?.tipo_produto || "").trim();
      const produtoKey = produtoId || `nome:${destinoNome.toLowerCase()}`;
      const currentProd = produtoMap.get(produtoKey);
      if (!currentProd) {
        produtoMap.set(produtoKey, { id: produtoKey, name: destinoNome, value: vendaTotal });
      } else {
        currentProd.value += vendaTotal;
      }

      const vendedorId = String(venda?.vendedor_id || "unknown");
      const currentVend =
        vendedorMap.get(vendedorId) || { vendedor_id: vendedorId, total: 0, qtd: 0 };
      currentVend.total += vendaTotal;
      currentVend.qtd += vendaTotal > 0 ? 1 : 0;
      vendedorMap.set(vendedorId, currentVend);
      return;
    }

    const destinoNome = String(venda?.destinos?.nome || venda?.destino?.nome || "Sem destino");
    const vendedorId = String(venda?.vendedor_id || "unknown");

    recibos.forEach((r) => {
      const bruto = Number(r?.valor_total || 0);
      const taxas = Number(r?.valor_taxas || 0);
      const dia = String(r?.data_venda || venda?.data_venda || "").slice(0, 10);

      totalVendas += bruto;
      totalTaxas += taxas;
      qtdVendas += 1;

      if (dia) timelineMap.set(dia, (timelineMap.get(dia) || 0) + bruto);
      destinoMap.set(destinoNome, (destinoMap.get(destinoNome) || 0) + bruto);

      const produto = r?.produtos || null;
      if (produto && produto.exibe_kpi_comissao !== false) {
        const name = String(produto?.nome || "Produto");
        const idRaw = String(produto?.id || "").trim();
        const id = idRaw || `nome:${name.toLowerCase()}`;
        const current = produtoMap.get(id);
        if (!current) {
          produtoMap.set(id, { id, name, value: bruto });
        } else {
          current.value += bruto;
        }

        if (includesSeguro(String(produto?.tipo || ""), String(produto?.nome || ""))) {
          totalSeguro += bruto;
        }
      }

      const currentVend =
        vendedorMap.get(vendedorId) || { vendedor_id: vendedorId, total: 0, qtd: 0 };
      currentVend.total += bruto;
      currentVend.qtd += 1;
      vendedorMap.set(vendedorId, currentVend);
    });
  });

  const totalLiquido = totalVendas - totalTaxas;
  const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;

  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }));

  const topDestinos = Array.from(destinoMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const porProduto = Array.from(produtoMap.values()).sort((a, b) => b.value - a.value);

  const porVendedor = Array.from(vendedorMap.values()).sort((a, b) => b.total - a.total);

  return {
    totalVendas,
    totalTaxas,
    totalLiquido,
    totalSeguro,
    qtdVendas,
    ticketMedio,
    timeline,
    topDestinos,
    porProduto,
    porVendedor,
  };
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
            "Cache-Control": "private, max-age=20",
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
            "Cache-Control": "private, max-age=20",
            Vary: "Cookie",
          },
        });
      }
    }

    const vendasAggPromise = (async (): Promise<VendasAgg> => {
      const companyId =
        requestedCompanyId && requestedCompanyId !== "all" ? requestedCompanyId : null;

      try {
        const { data: rpcData, error: rpcErr } = await client.rpc("rpc_dashboard_vendas_summary", {
          p_company_id: companyId,
          p_vendedor_ids: vendedorIds.length > 0 ? vendedorIds : null,
          p_inicio: inicio,
          p_fim: fim,
        });

        if (rpcErr) throw rpcErr;
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!row) throw new Error("RPC rpc_dashboard_vendas_summary sem retorno.");

        const timelineRaw = (row as any)?.timeline;
        const topDestinosRaw = (row as any)?.top_destinos;
        const porProdutoRaw = (row as any)?.por_produto;
        const porVendedorRaw = (row as any)?.por_vendedor;

        const timeline = Array.isArray(timelineRaw)
          ? timelineRaw
              .map((item: any) => ({
                date: String(item?.date || "").slice(0, 10),
                value: Number(item?.value || 0),
              }))
              .filter((item: any) => Boolean(item.date))
          : [];

        const topDestinos = Array.isArray(topDestinosRaw)
          ? topDestinosRaw.map((item: any) => ({
              name: String(item?.name || "Sem destino"),
              value: Number(item?.value || 0),
            }))
          : [];

        let porProduto = Array.isArray(porProdutoRaw)
          ? porProdutoRaw.map((item: any) => {
              const name = String(item?.name || "Produto");
              const idRaw = String(item?.id || "").trim();
              return {
                id: idRaw || `nome:${name.toLowerCase()}`,
                name,
                value: Number(item?.value || 0),
              };
            })
          : [];

        const porVendedor = Array.isArray(porVendedorRaw)
          ? porVendedorRaw.map((item: any) => ({
              vendedor_id: String(item?.vendedor_id || "unknown"),
              total: Number(item?.total || 0),
              qtd: Number(item?.qtd || 0),
            }))
          : [];

        const totalVendas = Number((row as any)?.total_vendas || 0);
        const totalTaxas = Number((row as any)?.total_taxas || 0);
        const totalLiquido = Number((row as any)?.total_liquido || totalVendas - totalTaxas);
        const totalSeguro = Number((row as any)?.total_seguro || 0);
        const qtdVendas = Number((row as any)?.qtd_vendas || 0);
        const ticketMedio = Number((row as any)?.ticket_medio || 0);

        if (porProduto.length === 0 && totalVendas > 0) {
          porProduto = await fetchPorProdutoFallback(client, companyId, vendedorIds, inicio, fim);
        }

        return {
          totalVendas,
          totalTaxas,
          totalLiquido,
          totalSeguro,
          qtdVendas,
          ticketMedio,
          timeline,
          topDestinos,
          porProduto,
          porVendedor,
        };
      } catch (rpcError: any) {
        if (!isRpcMissing(rpcError, "rpc_dashboard_vendas_summary")) {
          throw rpcError;
        }
      }

      let vendasQuery = client
        .from("vendas")
        .select(
          `
            id,
            vendedor_id,
            destino_id,
            data_venda,
            valor_total,
            valor_taxas,
            destinos:produtos!destino_id (nome, tipo_produto),
            vendas_recibos (
              id,
              data_venda,
              valor_total,
              valor_taxas,
              produtos:tipo_produtos!produto_id (id, nome, tipo, exibe_kpi_comissao)
            )
          `
        )
        .eq("cancelada", false);

      // Competência por recibo: filtra pelo mês do recibo.
      vendasQuery = vendasQuery
        .gte("vendas_recibos.data_venda", inicio)
        .lte("vendas_recibos.data_venda", fim);

      if (companyId) {
        vendasQuery = vendasQuery.eq("company_id", companyId);
      }
      if (vendedorIds.length > 0) {
        vendasQuery = vendasQuery.in("vendedor_id", vendedorIds);
      }

      const { data, error } = await vendasQuery;
      if (error) throw error;
      return computeVendasAggFromRows(data || []);
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
