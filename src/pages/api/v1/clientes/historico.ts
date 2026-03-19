import { createServerClient, hasServiceRoleKey, supabaseServer } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";

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
  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId)
    .in("modulo", modulos);
  if (error) throw error;
  const podeVer = (acessos || []).some(
    (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 1
  );
  if (!podeVer) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

async function canAccessClienteViaRls(client: any, clienteId: string) {
  const { data, error } = await client
    .from("clientes")
    .select("id")
    .eq("id", clienteId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function fetchVendasHistorico(
  client: any,
  clienteId: string,
  options?: { companyIds?: string[] | null; vendedorIds?: string[] }
) {
  const vendaSelect =
    "id, cliente_id, vendedor_id, company_id, data_lancamento, data_embarque, destino_cidade_id, destinos:produtos!destino_id (nome, cidade_id)";

  const companyIds = options?.companyIds?.filter(Boolean) || [];
  const vendedorIds = options?.vendedorIds?.filter(Boolean) || [];

  let vendasTitularQuery = client.from("vendas").select(vendaSelect).eq("cliente_id", clienteId);
  if (hasServiceRoleKey && companyIds.length > 0) vendasTitularQuery = vendasTitularQuery.in("company_id", companyIds);
  if (vendedorIds.length > 0) vendasTitularQuery = vendasTitularQuery.in("vendedor_id", vendedorIds);
  const { data: vendasTitular, error: vendasTitularErr } = await vendasTitularQuery;
  if (vendasTitularErr) throw vendasTitularErr;

  let vendasPassageiro: any[] = [];
  const { data: viagensComoPassageiro, error: passageiroErr } = await client
    .from("viagem_passageiros")
    .select("viagem_id")
    .eq("cliente_id", clienteId);
  if (passageiroErr) {
    console.warn("[clientes/historico] falha ao consultar vinculos de passageiro", passageiroErr);
  } else {
    const viagemIdsPassageiro = Array.from(
      new Set(
        (viagensComoPassageiro || [])
          .map((row: any) => String(row?.viagem_id || "").trim())
          .filter(Boolean)
      )
    );

    if (viagemIdsPassageiro.length > 0) {
      const { data: viagensRows, error: viagensErr } = await client
        .from("viagens")
        .select("id, venda_id")
        .in("id", viagemIdsPassageiro);
      if (viagensErr) {
        console.warn("[clientes/historico] falha ao consultar viagens do passageiro", viagensErr);
      } else {
        const vendaIdsPassageiro = Array.from(
          new Set(
            (viagensRows || [])
              .map((row: any) => String(row?.venda_id || "").trim())
              .filter(Boolean)
          )
        );

        if (vendaIdsPassageiro.length > 0) {
          let vendasPassQuery = client.from("vendas").select(vendaSelect).in("id", vendaIdsPassageiro);
          if (hasServiceRoleKey && companyIds.length > 0) vendasPassQuery = vendasPassQuery.in("company_id", companyIds);
          if (vendedorIds.length > 0) vendasPassQuery = vendasPassQuery.in("vendedor_id", vendedorIds);
          const { data: vendasPassData, error: vendasPassErr } = await vendasPassQuery;
          if (vendasPassErr) {
            console.warn("[clientes/historico] falha ao consultar vendas do passageiro", vendasPassErr);
          } else {
            vendasPassageiro = vendasPassData || [];
          }
        }
      }
    }
  }

  const vendasMap = new Map<string, any>();
  (vendasTitular || []).forEach((v: any) => {
    vendasMap.set(v.id, { ...v, origem_vinculo: "titular" as const });
  });
  vendasPassageiro.forEach((v: any) => {
    if (!vendasMap.has(v.id)) {
      vendasMap.set(v.id, { ...v, origem_vinculo: "passageiro" as const });
    }
  });

  const vendasData = Array.from(vendasMap.values()).sort((a, b) =>
    String(b?.data_lancamento || "").localeCompare(String(a?.data_lancamento || ""))
  );

  if (vendasData.length === 0) return [];

  const vendaIds = vendasData.map((v: any) => v.id);
  const cidadeIds = Array.from(
    new Set(
      vendasData
        .map((v: any) => v.destino_cidade_id || v.destinos?.cidade_id)
        .filter((cid: string | null | undefined): cid is string => Boolean(cid))
    )
  );

  const { data: recibosData, error: recibosErr } = await client
    .from("vendas_recibos")
    .select("venda_id, valor_total, valor_taxas")
    .in("venda_id", vendaIds);
  if (recibosErr) throw recibosErr;

  let cidadesMap: Record<string, string> = {};
  if (cidadeIds.length > 0) {
    const { data: cidadesData, error: cidadesErr } = await client
      .from("cidades")
      .select("id, nome")
      .in("id", cidadeIds);
    if (cidadesErr) throw cidadesErr;
    cidadesMap = Object.fromEntries((cidadesData || []).map((c: any) => [c.id, c.nome || ""]));
  }

  return vendasData.map((v: any) => {
    const recs = (recibosData || []).filter((r: any) => r.venda_id === v.id);
    const total = recs.reduce((acc: number, r: any) => acc + (r.valor_total || 0), 0);
    const taxas = recs.reduce((acc: number, r: any) => acc + (r.valor_taxas || 0), 0);
    const cidadeId = v.destino_cidade_id || v.destinos?.cidade_id || null;
    return {
      id: v.id,
      data_lancamento: v.data_lancamento || null,
      data_embarque: v.data_embarque || null,
      destino_nome: v.destinos?.nome || "",
      destino_cidade_nome: cidadeId ? cidadesMap[cidadeId] || "" : "",
      valor_total: total,
      valor_taxas: taxas,
      origem_vinculo: v.origem_vinculo || "titular",
    };
  });
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const clienteId = String(url.searchParams.get("cliente_id") || "").trim();
    const empresaIdRaw = String(url.searchParams.get("empresa_id") || "").trim();
    const vendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    const vendedorIdsParam = vendedorIdsRaw
      ? vendedorIdsRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => isUuid(v))
          .slice(0, 500)
      : [];

    if (!isUuid(clienteId)) {
      return new Response("cliente_id invalido.", { status: 400 });
    }

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
      if (denied) {
        const canAccessCliente = await canAccessClienteViaRls(client, clienteId);
        if (!canAccessCliente) return denied;
      }
    }

    let empresaScope: string[] | null = null;
    if (papel === "ADMIN") {
      if (isUuid(empresaIdRaw)) empresaScope = [empresaIdRaw];
    } else if (papel === "MASTER") {
      const empresas = await fetchMasterEmpresas(client, user.id);
      if (empresas.length === 0) {
        return new Response(JSON.stringify({ vendas: [], orcamentos: [] }), {
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

    const cacheKey = [
      "v1",
      "clientes",
      "historico",
      user.id,
      clienteId,
      (empresaScope || []).join(";") || "-",
      vendedorIdsParam.join(";") || "-",
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

    const dataClient = hasServiceRoleKey ? supabaseServer : client;

    const vendasFmt = await fetchVendasHistorico(dataClient, clienteId, {
      companyIds: empresaScope,
      vendedorIds: vendedorIdsParam,
    });

    const { data: quotesData, error: quotesErr } = await dataClient
      .from("quote")
      .select("id, created_at, status, status_negociacao, total, client_id, created_by, quote_item (title, item_type)")
      .eq("client_id", clienteId)
      .order("created_at", { ascending: false });
    if (quotesErr) throw quotesErr;

    let creatorCompanyMap: Record<string, string> = {};
    if (hasServiceRoleKey) {
      const creatorIds = Array.from(
        new Set(
          (quotesData || [])
            .map((q: any) => String(q?.created_by || "").trim())
            .filter(Boolean)
        )
      );
      if (creatorIds.length > 0) {
        const { data: creatorsData, error: creatorsErr } = await supabaseServer
          .from("users")
          .select("id, company_id")
          .in("id", creatorIds);
        if (creatorsErr) throw creatorsErr;
        creatorCompanyMap = Object.fromEntries(
          (creatorsData || []).map((u: any) => [String(u.id), String(u.company_id || "")])
        );
      }
    }

    const orcFmt =
      (quotesData || [])
        .filter((q: any) => {
          const createdBy = String(q?.created_by || "").trim();
          if (vendedorIdsParam.length > 0 && (!createdBy || !vendedorIdsParam.includes(createdBy))) {
            return false;
          }
          if (hasServiceRoleKey && empresaScope && empresaScope.length > 0) {
            const creatorCompanyId = creatorCompanyMap[createdBy] || "";
            return Boolean(creatorCompanyId && empresaScope.includes(creatorCompanyId));
          }
          return true;
        })
        .map((q: any) => ({
          id: q.id,
          data_orcamento: q.created_at || null,
          status: q.status_negociacao || q.status || null,
          valor: q.total ?? null,
          produto_nome: q.quote_item?.[0]?.title || q.quote_item?.[0]?.item_type || null,
        })) || [];

    const payload = {
      vendas: vendasFmt,
      orcamentos: orcFmt,
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
    console.error("Erro clientes/historico", err);
    return new Response("Erro ao carregar historico de clientes.", { status: 500 });
  }
}
