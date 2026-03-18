import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";
import { normalizeText } from "../../../../lib/normalizeText";
import { fetchEffectiveConciliacaoReceipts } from "../../../../lib/conciliacao/source";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 15_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

const DEFAULT_NAO_COMISSIONAVEIS = [
  "credito diversos",
  "credito pax",
  "credito passageiro",
  "credito de viagem",
  "credipax",
  "vale viagem",
  "carta de credito",
  "credito",
];

const DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED = DEFAULT_NAO_COMISSIONAVEIS.map((termo) =>
  normalizeText(termo, { trim: true, collapseWhitespace: true })
).filter(Boolean);

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

function resolvePapel(tipoNome: string): Papel {
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

function normalizeTerm(value?: string | null) {
  return normalizeText(value || "", { trim: true, collapseWhitespace: true });
}

function toStr(value?: unknown) {
  return String(value || "").trim();
}

function toNumber(value?: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPositive(value?: unknown) {
  return toNumber(value) > 0;
}

async function fetchTermosNaoComissionaveis(client: any) {
  try {
    const { data, error } = await client
      .from("parametros_pagamentos_nao_comissionaveis")
      .select("termo, termo_normalizado, ativo")
      .eq("ativo", true)
      .order("termo", { ascending: true });
    if (error) throw error;
    const termos = (data || [])
      .map((row: any) => normalizeTerm(row?.termo_normalizado || row?.termo))
      .filter(Boolean);
    return Array.from(new Set(termos));
  } catch {
    return DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED;
  }
}

function isFormaNaoComissionavel(nome?: string | null, termos?: string[] | null) {
  const normalized = normalizeTerm(nome);
  if (!normalized) return false;
  if (normalized.includes("cartao") && normalized.includes("credito")) return false;
  const lista = termos && termos.length ? termos : DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED;
  return lista.some((termo) => termo && normalized.includes(termo));
}

function calcularNaoComissionavelPorVenda(
  pagamentos: {
    venda_id: string;
    valor_total?: number | null;
    valor_bruto?: number | null;
    desconto_valor?: number | null;
    paga_comissao?: boolean | null;
    forma_nome?: string | null;
  }[],
  termos?: string[] | null
) {
  const mapa = new Map<string, number>();
  pagamentos.forEach((pagamento) => {
    const naoComissiona =
      pagamento.paga_comissao === false || isFormaNaoComissionavel(pagamento.forma_nome, termos);
    if (!naoComissiona) return;
    const total = Number(pagamento.valor_total || 0);
    const bruto = Number(pagamento.valor_bruto || 0);
    const desconto = Number(pagamento.desconto_valor || 0);
    const valorBase = bruto > 0 ? bruto : total > 0 ? total : Math.max(0, bruto - desconto);
    if (valorBase <= 0) return;
    mapa.set(pagamento.venda_id, (mapa.get(pagamento.venda_id) || 0) + valorBase);
  });
  return mapa;
}

async function fetchParametrosComissao(client: any, companyId: string | null) {
  if (!companyId) {
    return {
      usar_taxas_na_meta: true,
      foco_valor: "bruto",
      conciliacao_sobrepoe_vendas: false,
    };
  }

  const { data } = await client
    .from("parametros_comissao")
    .select("usar_taxas_na_meta, foco_valor, conciliacao_sobrepoe_vendas")
    .eq("company_id", companyId)
    .maybeSingle();

  return {
    usar_taxas_na_meta: data?.usar_taxas_na_meta ?? true,
    foco_valor: data?.foco_valor === "liquido" ? "liquido" : "bruto",
    conciliacao_sobrepoe_vendas: Boolean(data?.conciliacao_sobrepoe_vendas),
  };
}

async function applyConciliacaoOverridesToVendas(client: any, companyId: string | null, items: any[]) {
  if (!companyId || !Array.isArray(items) || items.length === 0) {
    return items;
  }

  const receiptIds = items
    .flatMap((item: any) => (Array.isArray(item?.vendas_recibos) ? item.vendas_recibos : []))
    .map((recibo: any) => toStr(recibo?.id))
    .filter(Boolean);

  if (receiptIds.length === 0) return items;

  const concRows: any[] = [];
  for (let i = 0; i < receiptIds.length; i += 200) {
    const batch = receiptIds.slice(i, i + 200);
    const { data, error } = await client
      .from("conciliacao_recibos")
      .select(
        "documento, movimento_data, status, valor_lancamentos, valor_taxas, valor_venda_real, valor_comissao_loja, percentual_comissao_loja, venda_recibo_id"
      )
      .eq("company_id", companyId)
      .in("status", ["BAIXA", "OPFAX"] as any)
      .in("venda_recibo_id", batch)
      .order("movimento_data", { ascending: true });
    if (error) throw error;
    concRows.push(...(Array.isArray(data) ? data : []));
  }

  if (concRows.length === 0) return items;

  const byDocumento = new Map<string, any[]>();
  concRows.forEach((row) => {
    const documento = toStr(row?.documento);
    if (!documento) return;
    const bucket = byDocumento.get(documento) || [];
    bucket.push(row);
    byDocumento.set(documento, bucket);
  });

  const overrides = new Map<
    string,
    {
      data_venda: string;
      valor_bruto_override: number | null;
      valor_meta_override: number | null;
      valor_liquido_override: number | null;
      valor_taxas: number | null;
      valor_comissao_loja: number | null;
      percentual_comissao_loja: number | null;
    }
  >();

  Array.from(byDocumento.values()).forEach((rows) => {
    const sortedRows = [...rows].sort((a, b) =>
      toStr(a?.movimento_data).localeCompare(toStr(b?.movimento_data))
    );
    const baixaRows = sortedRows.filter((row) => toStr(row?.status).toUpperCase() === "BAIXA");
    const confirmed = baixaRows.length > 0;
    const valuedBaixa = baixaRows.find(
      (row) => isPositive(row?.valor_venda_real) || isPositive(row?.valor_lancamentos)
    );
    const valuedOpfax = sortedRows.find(
      (row) =>
        toStr(row?.status).toUpperCase() === "OPFAX" &&
        (isPositive(row?.valor_venda_real) || isPositive(row?.valor_lancamentos))
    );
    const sourceRow =
      valuedBaixa ||
      (confirmed ? valuedOpfax : null) ||
      (confirmed ? baixaRows[0] : null) ||
      null;

    if (!sourceRow) return;
    if (!confirmed && toStr(sourceRow?.status).toUpperCase() === "OPFAX") return;

    const linkedReciboId = sortedRows.map((row) => toStr(row?.venda_recibo_id)).find(Boolean);
    const effectiveDate = toStr(sourceRow?.movimento_data);
    if (!linkedReciboId || !effectiveDate) return;

    const valorMeta = toNumber(sourceRow?.valor_venda_real);
    const valorTaxas = toNumber(sourceRow?.valor_taxas);
    const valorBruto = isPositive(sourceRow?.valor_lancamentos)
      ? toNumber(sourceRow?.valor_lancamentos)
      : valorMeta > 0
      ? valorMeta + valorTaxas
      : 0;

    overrides.set(linkedReciboId, {
      data_venda: effectiveDate,
      valor_bruto_override: valorBruto || null,
      valor_meta_override: valorMeta || null,
      valor_liquido_override: valorMeta || null,
      valor_taxas: valorTaxas || null,
      valor_comissao_loja: sourceRow?.valor_comissao_loja ?? null,
      percentual_comissao_loja: sourceRow?.percentual_comissao_loja ?? null,
    });
  });

  if (overrides.size === 0) return items;

  return items.map((item: any) => ({
    ...item,
    vendas_recibos: (Array.isArray(item?.vendas_recibos) ? item.vendas_recibos : []).map((recibo: any) => {
      const override = overrides.get(toStr(recibo?.id));
      if (!override) return recibo;
      return {
        ...recibo,
        data_venda: override.data_venda,
        valor_taxas: override.valor_taxas,
        valor_bruto_override: override.valor_bruto_override,
        valor_meta_override: override.valor_meta_override,
        valor_liquido_override: override.valor_liquido_override,
        valor_comissao_loja: override.valor_comissao_loja,
        percentual_comissao_loja: override.percentual_comissao_loja,
      };
    }),
  }));
}

async function fetchMatchingBaseReceiptIds(params: {
  client: any;
  vendedorIds: string[];
  papel: Papel;
  inicio?: string;
  fim?: string;
  status?: string;
  clienteId?: string;
  valorMin?: number | null;
  valorMax?: number | null;
}) {
  const { client, vendedorIds, papel, inicio, fim, status, clienteId, valorMin, valorMax } = params;
  const pageSize = 1000;
  const ids = new Set<string>();

  for (let offset = 0; offset < 10000; offset += pageSize) {
    let query = client
      .from("vendas")
      .select(
        `
        vendas_recibos!inner (
          id
        )
      `
      )
      .order("data_venda", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (papel !== "ADMIN") {
      query = query.in("vendedor_id", vendedorIds);
    } else if (vendedorIds.length > 0) {
      query = query.in("vendedor_id", vendedorIds);
    }

    if (inicio) query = query.gte("vendas_recibos.data_venda", inicio);
    if (fim) query = query.lte("vendas_recibos.data_venda", fim);
    if (status && status !== "todos") query = query.eq("status", status);
    if (clienteId) query = query.eq("cliente_id", clienteId);
    if (valorMin != null && Number.isFinite(valorMin)) query = query.gte("valor_total_bruto", valorMin);
    if (valorMax != null && Number.isFinite(valorMax)) query = query.lte("valor_total_bruto", valorMax);

    const { data, error } = await query;
    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    chunk.forEach((row: any) => {
      const recibos = Array.isArray(row?.vendas_recibos) ? row.vendas_recibos : [];
      recibos.forEach((recibo: any) => {
        const id = toStr(recibo?.id);
        if (id) ids.add(id);
      });
    });

    if (chunk.length < pageSize) break;
  }

  return ids;
}

function buildSyntheticRelatorioRows(params: {
  currentItems: any[];
  concReceipts: Awaited<ReturnType<typeof fetchEffectiveConciliacaoReceipts>>;
  existingReceiptIds: Set<string>;
  status?: string;
  clienteId?: string;
  valorMin?: number | null;
  valorMax?: number | null;
}) {
  const { currentItems, concReceipts, existingReceiptIds, status, clienteId, valorMin, valorMax } = params;
  if (clienteId) return [] as any[];
  if (status && status !== "todos" && status !== "confirmado") return [] as any[];

  const currentSaleIds = new Set(currentItems.map((item: any) => toStr(item?.id)).filter(Boolean));

  return concReceipts
    .filter((item) => {
      if (item.linked_recibo_id && existingReceiptIds.has(item.linked_recibo_id)) return false;
      if (!item.linked_recibo_id && item.linked_venda_id && currentSaleIds.has(item.linked_venda_id)) return false;
      const bruto = toNumber(item.valor_bruto);
      if (valorMin != null && Number.isFinite(valorMin) && bruto < valorMin) return false;
      if (valorMax != null && Number.isFinite(valorMax) && bruto > valorMax) return false;
      return true;
    })
    .map((item) => ({
      id: item.linked_venda_id || item.id,
      vendedor_id: item.vendedor_id,
      numero_venda: null,
      cliente_id: "",
      destino_id: "",
      destino_cidade_id: null,
      produto_id: item.produto_id,
      data_venda: item.data_venda,
      data_embarque: null,
      valor_total: item.valor_bruto,
      valor_total_bruto: item.valor_bruto,
      valor_total_pago: item.valor_bruto,
      desconto_comercial_valor: 0,
      valor_nao_comissionado: 0,
      status: "confirmado",
      cliente: { nome: null, cpf: null },
      destino_produto: item.produto
        ? {
            id: item.produto.id,
            nome: item.produto.nome,
            tipo_produto: item.produto.id,
            cidade_id: null,
          }
        : null,
      destino_cidade: { nome: null },
      vendas_recibos: [
        {
          id: item.linked_recibo_id || `${item.id}:synthetic`,
          numero_recibo: item.documento,
          data_venda: item.data_venda,
          valor_total: item.valor_bruto,
          valor_taxas: item.valor_taxas,
          valor_du: null,
          valor_rav: null,
          produto_id: item.produto_id,
          tipo_pacote: null,
          valor_bruto_override: item.valor_bruto,
          valor_meta_override: item.valor_meta_override,
          valor_liquido_override: item.valor_liquido_override,
          valor_comissao_loja: item.valor_comissao_loja,
          percentual_comissao_loja: item.percentual_comissao_loja,
          produto_resolvido_id: item.produto_id,
          produto_resolvido: item.produto
            ? {
                id: item.produto.id,
                nome: item.produto.nome,
                tipo_produto: item.produto.id,
                cidade_id: null,
              }
            : null,
          tipo_produtos: item.produto
            ? {
                id: item.produto.id,
                nome: item.produto.nome,
                tipo: item.produto.nome,
              }
            : null,
        },
      ],
    }));
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
    const clienteId = String(url.searchParams.get("cliente_id") || "").trim();
    const valorMinRaw = String(url.searchParams.get("valor_min") || "").trim();
    const valorMaxRaw = String(url.searchParams.get("valor_max") || "").trim();
    const vendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";
    const includePagamentos = String(url.searchParams.get("include_pagamentos") || "").trim() === "1";
    const all = String(url.searchParams.get("all") || "").trim() === "1";

    const page = parseIntSafe(url.searchParams.get("page"), 1);
    const pageSize = parseIntSafe(url.searchParams.get("pageSize"), 25);

    if ((inicio || fim) && (!isIsoDate(inicio) || !isIsoDate(fim))) {
      return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
    }
    if (clienteId && !isUuid(clienteId)) {
      return new Response("cliente_id invalido.", { status: 400 });
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
      .select("id, company_id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const papel = resolvePapel(tipoName);
    const companyId = toStr((perfil as any)?.company_id) || null;
    const parametrosComissao = await fetchParametrosComissao(client, companyId);

    if (papel !== "ADMIN") {
      const denied = await requireModuloView(
        client,
        user.id,
        ["relatorios", "relatorios_vendas"],
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
      const emptyPayload = {
        items: [],
        total: 0,
        page,
        pageSize,
        ...(includePagamentos ? { pagamentosNaoComissionaveis: {} } : {}),
      };
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
      "relatorioVendas",
      user.id,
      inicio || "-",
      fim || "-",
      status || "-",
      clienteId || "-",
      valorMinRaw || "-",
      valorMaxRaw || "-",
      vendedorIds.join(";"),
      all ? "all" : "page",
      includePagamentos ? "p1" : "p0",
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
        numero_venda,
        cliente_id,
        destino_id,
        destino_cidade_id,
        produto_id,
        data_venda,
        data_embarque,
        valor_total,
        valor_total_bruto,
        valor_total_pago,
        desconto_comercial_valor,
        valor_nao_comissionado,
        status,
        cliente:clientes!cliente_id (nome, cpf),
        destino_produto:produtos!destino_id (id, nome, tipo_produto, cidade_id),
        destino_cidade:cidades!destino_cidade_id (nome),
        vendas_recibos${hasPeriodo ? "!inner" : ""} (
          id,
          numero_recibo,
          data_venda,
          valor_total,
          valor_taxas,
          valor_du,
          valor_rav,
          produto_id,
          tipo_pacote,
          produto_resolvido_id,
          produto_resolvido:produtos!produto_resolvido_id (id, nome, tipo_produto, cidade_id),
          tipo_produtos (id, nome, tipo)
        )
      `,
        { count: "exact" }
      )
      .order("data_venda", { ascending: false });

    if (papel !== "ADMIN") {
      query = query.in("vendedor_id", vendedorIds);
    } else if (vendedorIds.length > 0) {
      query = query.in("vendedor_id", vendedorIds);
    }

    // Competência por recibo: filtra pelo mês do recibo (não por vendas.data_venda).
    if (inicio) query = query.gte("vendas_recibos.data_venda", inicio);
    if (fim) query = query.lte("vendas_recibos.data_venda", fim);
    if (status && status !== "todos") query = query.eq("status", status);
    if (clienteId) query = query.eq("cliente_id", clienteId);

    const vMin = parseFloat(valorMinRaw.replace(",", "."));
    if (!Number.isNaN(vMin)) query = query.gte("valor_total_bruto", vMin);
    const vMax = parseFloat(valorMaxRaw.replace(",", "."));
    if (!Number.isNaN(vMax)) query = query.lte("valor_total_bruto", vMax);

    if (!all) {
      const start = (Math.max(1, page) - 1) * Math.max(1, pageSize);
      const end = start + Math.max(1, pageSize) - 1;
      query = query.range(start, end);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    let pagamentosNaoComissionaveis: Record<string, number> | undefined;
    if (includePagamentos) {
      const vendaIds = (data || [])
        .map((row: any) => String(row?.id || "").trim())
        .filter(Boolean);
      if (vendaIds.length > 0) {
        const { data: pagamentosData, error: pagamentosErr } = await client
          .from("vendas_pagamentos")
          .select("venda_id, valor_total, valor_bruto, desconto_valor, paga_comissao, forma_nome")
          .in("venda_id", vendaIds);
        if (pagamentosErr) throw pagamentosErr;
        const termos = await fetchTermosNaoComissionaveis(client);
        const mapa = calcularNaoComissionavelPorVenda((pagamentosData || []) as any[], termos);
        pagamentosNaoComissionaveis = Object.fromEntries(mapa.entries());
      } else {
        pagamentosNaoComissionaveis = {};
      }
    }

    let itemsWithOverrides = parametrosComissao.conciliacao_sobrepoe_vendas
      ? await applyConciliacaoOverridesToVendas(client, companyId, data || [])
      : data || [];

    let totalAdjusted = typeof count === "number" ? count : (data || []).length;
    if (parametrosComissao.conciliacao_sobrepoe_vendas && companyId) {
      const valorMin = Number.isNaN(parseFloat(valorMinRaw.replace(",", ".")))
        ? null
        : parseFloat(valorMinRaw.replace(",", "."));
      const valorMax = Number.isNaN(parseFloat(valorMaxRaw.replace(",", ".")))
        ? null
        : parseFloat(valorMaxRaw.replace(",", "."));
      const concReceipts = await fetchEffectiveConciliacaoReceipts({
        client,
        companyId,
        inicio: inicio || "1900-01-01",
        fim: fim || "2999-12-31",
        vendedorIds,
      });
      if (concReceipts.length > 0) {
        const existingReceiptIds = await fetchMatchingBaseReceiptIds({
          client,
          vendedorIds,
          papel,
          inicio: inicio || undefined,
          fim: fim || undefined,
          status,
          clienteId,
          valorMin,
          valorMax,
        });
        const syntheticRows = buildSyntheticRelatorioRows({
          currentItems: itemsWithOverrides,
          concReceipts,
          existingReceiptIds,
          status,
          clienteId,
          valorMin,
          valorMax,
        });
        if (syntheticRows.length > 0) {
          const canAppendSyntheticRows = all || page === 1;
          if (canAppendSyntheticRows) {
            itemsWithOverrides = [...itemsWithOverrides, ...syntheticRows].sort((a: any, b: any) =>
              String(b?.data_venda || "").localeCompare(String(a?.data_venda || ""))
            );
          }
          totalAdjusted += syntheticRows.length;
        }
      }
    }

    const payload = {
      items: itemsWithOverrides,
      total: totalAdjusted,
      page,
      pageSize,
      ...(includePagamentos ? { pagamentosNaoComissionaveis } : {}),
    };

    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 15);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=15",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro relatorios/vendas", err);
    return new Response("Erro ao carregar relatorio de vendas.", { status: 500 });
  }
}
