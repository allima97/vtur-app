import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";
import { normalizeText } from "../../../../lib/normalizeText";

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

    const payload = {
      items: data || [],
      total: typeof count === "number" ? count : (data || []).length,
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
