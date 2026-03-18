
import { buildAuthClient } from "../vendas/_utils";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";



// parseCookies/buildAuthClient agora vêm de src/lib/apiAuth.ts

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

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

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

// cache local removido, usar apenas kvCache

type RankingVendaRecibo = {
  valor_total: number | null;
  valor_taxas: number | null;
  valor_du?: number | null;
  data_venda?: string | null;
  produto_id: string | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  tipo_produtos?: { id: string; nome: string | null } | null;
};

type RankingVendaRow = {
  id: string;
  data_venda: string;
  vendedor_id: string | null;
  vendas_recibos: RankingVendaRecibo[];
};

async function fetchConciliacaoRankingVendas(params: {
  dataClient: any;
  companyId: string | null;
  inicio: string;
  fim: string;
  vendedorIds: string[];
}): Promise<RankingVendaRow[] | null> {
  const { dataClient, companyId, inicio, fim, vendedorIds } = params;
  if (!companyId) return null;

  const pageSize = 1000;
  const relevantDocs = new Set<string>();
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const { data, error } = await dataClient
      .from("conciliacao_recibos")
      .select("documento")
      .eq("company_id", companyId)
      .in("status", ["BAIXA", "OPFAX"] as any)
      .gte("movimento_data", inicio)
      .lte("movimento_data", fim)
      .order("movimento_data", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    chunk.forEach((row: any) => {
      const documento = String(row?.documento || "").trim();
      if (documento) relevantDocs.add(documento);
    });
    if (chunk.length < pageSize) break;
  }

  if (relevantDocs.size === 0) return null;

  const concRows: any[] = [];
  const documentos = Array.from(relevantDocs);
  for (let i = 0; i < documentos.length; i += 200) {
    const batch = documentos.slice(i, i + 200);
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const { data, error } = await dataClient
        .from("conciliacao_recibos")
        .select(
          "id, documento, descricao, movimento_data, status, conciliado, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_venda_real, valor_comissao_loja, percentual_comissao_loja, is_seguro_viagem, venda_id, venda_recibo_id, ranking_vendedor_id, ranking_produto_id"
        )
        .eq("company_id", companyId)
        .in("status", ["BAIXA", "OPFAX"] as any)
        .in("documento", batch)
        .order("movimento_data", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const chunk = Array.isArray(data) ? data : [];
      concRows.push(...chunk);
      if (chunk.length < pageSize) break;
    }
  }

  if (concRows.length === 0) return null;

  const vendaIds = Array.from(
    new Set(concRows.map((row) => String(row?.venda_id || "").trim()).filter(Boolean))
  );
  const reciboIds = Array.from(
    new Set(concRows.map((row) => String(row?.venda_recibo_id || "").trim()).filter(Boolean))
  );

  const vendasMap = new Map<string, { vendedor_id: string | null }>();
  if (vendaIds.length > 0) {
    const { data: vendasData, error: vendasErr } = await dataClient
      .from("vendas")
      .select("id, vendedor_id")
      .in("id", vendaIds);
    if (vendasErr) throw vendasErr;
    (vendasData || []).forEach((row: any) => {
      vendasMap.set(String(row?.id || "").trim(), {
        vendedor_id: row?.vendedor_id ? String(row.vendedor_id) : null,
      });
    });
  }

  const recibosMap = new Map<string, { produto_id: string | null }>();
  if (reciboIds.length > 0) {
    const { data: recibosData, error: recibosErr } = await dataClient
      .from("vendas_recibos")
      .select("id, produto_id")
      .in("id", reciboIds);
    if (recibosErr) throw recibosErr;
    (recibosData || []).forEach((row: any) => {
      recibosMap.set(String(row?.id || "").trim(), {
        produto_id: row?.produto_id ? String(row.produto_id) : null,
      });
    });
  }

  const produtoIds = Array.from(
    new Set(
      concRows
        .map((row) => {
          const reciboId = String(row?.venda_recibo_id || "").trim();
          const linkedProdutoId = reciboId ? recibosMap.get(reciboId)?.produto_id || null : null;
          return linkedProdutoId || (row?.ranking_produto_id ? String(row.ranking_produto_id) : null);
        })
        .filter((id): id is string => Boolean(id))
    )
  );

  let seguroFallbackId: string | null = null;
  const { data: seguroRows, error: seguroErr } = await dataClient
    .from("tipo_produtos")
    .select("id, nome")
    .ilike("nome", "%seguro%")
    .limit(10);
  if (seguroErr) throw seguroErr;
  seguroFallbackId = Array.isArray(seguroRows) && seguroRows.length > 0 ? String(seguroRows[0]?.id || "").trim() || null : null;
  if (seguroFallbackId) {
    produtoIds.push(seguroFallbackId);
  }

  const produtosMap = new Map<string, { id: string; nome: string | null }>();
  if (produtoIds.length > 0) {
    const { data: produtosData, error: produtosErr } = await dataClient
      .from("tipo_produtos")
      .select("id, nome")
      .in("id", produtoIds);
    if (produtosErr) throw produtosErr;
    (produtosData || []).forEach((row: any) => {
      produtosMap.set(String(row?.id || "").trim(), {
        id: String(row?.id || "").trim(),
        nome: row?.nome ? String(row.nome) : null,
      });
    });
  }

  const allowedVendedores = new Set(vendedorIds);
  const concRowsByDocumento = new Map<string, any[]>();
  concRows.forEach((row: any) => {
    const documento = String(row?.documento || "").trim();
    if (!documento) return;
    const bucket = concRowsByDocumento.get(documento) || [];
    bucket.push(row);
    concRowsByDocumento.set(documento, bucket);
  });

  const rankingRows: RankingVendaRow[] = Array.from(concRowsByDocumento.entries())
    .map(([documento, rows]) => {
      const sortedRows = [...rows].sort((a, b) =>
        String(a?.movimento_data || "").localeCompare(String(b?.movimento_data || ""))
      );
      const baixaRows = sortedRows.filter((row) => String(row?.status || "").toUpperCase() === "BAIXA");
      const confirmed = baixaRows.length > 0;
      const valuedBaixa = baixaRows.find((row) => Number(row?.valor_venda_real || row?.valor_lancamentos || 0) > 0);
      const valuedOpfax = sortedRows.find(
        (row) =>
          String(row?.status || "").toUpperCase() === "OPFAX" &&
          Number(row?.valor_venda_real || row?.valor_lancamentos || 0) > 0
      );
      const sourceRow =
        valuedBaixa ||
        (confirmed ? valuedOpfax : null) ||
        (confirmed ? baixaRows[0] : null) ||
        null;

      if (!sourceRow) return null;
      if (!confirmed && String(sourceRow?.status || "").toUpperCase() === "OPFAX") return null;

      const effectiveDate = String(sourceRow?.movimento_data || "").trim();
      if (!effectiveDate || effectiveDate < inicio || effectiveDate > fim) return null;

      const linkedVendaId = sortedRows
        .map((row) => String(row?.venda_id || "").trim())
        .find(Boolean);
      const linkedReciboId = sortedRows
        .map((row) => String(row?.venda_recibo_id || "").trim())
        .find(Boolean);
      const linkedVendedorId = linkedVendaId ? vendasMap.get(linkedVendaId)?.vendedor_id || null : null;
      const rankingVendedorId = sortedRows
        .map((row) => (row?.ranking_vendedor_id ? String(row.ranking_vendedor_id) : null))
        .find(Boolean);
      const vendedorId = linkedVendedorId || rankingVendedorId || null;
      if (!vendedorId || !allowedVendedores.has(vendedorId)) return null;

      const linkedProdutoId = linkedReciboId ? recibosMap.get(linkedReciboId)?.produto_id || null : null;
      const manualProdutoId = sortedRows
        .map((row) => (row?.ranking_produto_id ? String(row.ranking_produto_id) : null))
        .find(Boolean);
      const isSeguro = sortedRows.some((row) => Boolean(row?.is_seguro_viagem));
      const produtoId = linkedProdutoId || manualProdutoId || (isSeguro ? seguroFallbackId : null);
      const produto = produtoId ? produtosMap.get(produtoId) || null : null;

      const valorMeta = Number(sourceRow?.valor_venda_real || 0);
      const taxas = Number(sourceRow?.valor_taxas || 0);
      const bruto = valorMeta > 0 ? valorMeta + taxas : Number(sourceRow?.valor_lancamentos || 0);

      return {
        id: `conc:${documento}`,
        data_venda: effectiveDate,
        vendedor_id: vendedorId,
        vendas_recibos: [
          {
            valor_total: bruto || null,
            valor_taxas: taxas || null,
            valor_du: null,
            data_venda: effectiveDate,
            produto_id: produtoId,
            valor_meta_override: valorMeta || null,
            valor_liquido_override: valorMeta || null,
            valor_comissao_loja: sourceRow?.valor_comissao_loja ?? null,
            percentual_comissao_loja: sourceRow?.percentual_comissao_loja ?? null,
            tipo_produtos: produto,
          },
        ],
      };
    })
    .filter((row): row is RankingVendaRow => Boolean(row));

  return rankingRows;
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
    const vendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const companyIdParam = String(url.searchParams.get("company_id") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";
    const viewParam = String(url.searchParams.get("view") || "").trim() === "1";

    if (!inicio || !fim || !isIsoDate(inicio) || !isIsoDate(fim)) {
      return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
    }

    let vendorIdsParam = vendedorIdsRaw
      ? vendedorIdsRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => isUuid(v))
          .slice(0, 400)
      : [];

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const papel = resolvePapel(tipoName);
    const viewMode = viewParam || papel === "VENDEDOR";
    const companyViewMode =
      viewMode && papel !== "ADMIN" && papel !== "MASTER" && papel !== "GESTOR";


    if (papel !== "ADMIN") {
      const modulos = companyViewMode
        ? ["dashboard", "relatorios", "relatorios_ranking_vendas"]
        : ["relatorios", "relatorios_ranking_vendas"];
      const denied = await requireModuloView(client, user.id, modulos, "Sem acesso a Relatorios.");
      if (denied) return denied;
    }

    if (papel !== "GESTOR" && papel !== "MASTER" && !companyViewMode) {
      return new Response("Sem acesso ao ranking.", { status: 403 });
    }

    let companyId = companyIdParam;
    if (companyViewMode) {
      // Service role check removido: use apenas permissões do usuário logado
      let resolvedCompanyId = "";
      try {
        const { data: companyData, error: companyErr } = await client.rpc("current_company_id");
        if (!companyErr && companyData) {
          resolvedCompanyId = String(companyData || "").trim();
        }
      } catch (_) {
        // Ignore and fall back to users table.
      }

      if (!resolvedCompanyId) {
        const { data: userRow, error: userErr } = await client
          .from("users")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        if (userErr) throw userErr;
        resolvedCompanyId = String((userRow as any)?.company_id || "").trim();
      }

      if (!resolvedCompanyId) {
        return new Response("Empresa nao encontrada.", { status: 403 });
      }

      companyId = resolvedCompanyId;

      const { data: equipeData, error: equipeErr } = await client
        .from("users")
        .select("id, user_types(name), participa_ranking")
        .eq("company_id", companyId);
      if (equipeErr) throw equipeErr;

      vendorIdsParam = (equipeData || [])
        .filter((row: any) => {
          const tipoNome = String(row?.user_types?.name || "").toUpperCase();
          const isVendedor = tipoNome.includes("VENDEDOR");
          const isGestor = tipoNome.includes("GESTOR");
          return isVendedor || (isGestor && row?.participa_ranking);
        })
        .map((row: any) => String(row?.id || "").trim())
        .filter((id: string) => isUuid(id))
        .slice(0, 400);
    }

    if (vendorIdsParam.length === 0) {
      const emptyPayload = {
        params: { usar_taxas_na_meta: true, foco_valor: "bruto", conciliacao_sobrepoe_vendas: false },
        vendas: [],
        metas: [],
        metasProduto: [],
        produtosMeta: [],
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
      "rankingVendas",
      user.id,
      inicio,
      fim,
      vendorIdsParam.join(";"),
      companyId || "-",
      viewMode ? "view" : "full",
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

      // cache local removido: usar apenas kvCache
    }

    const dataClient = companyViewMode ? supabaseServer : client;

    let paramsPayload = {
      usar_taxas_na_meta: true,
      foco_valor: "bruto",
      conciliacao_sobrepoe_vendas: false,
    };
    if (companyId) {
      const { data: paramsData, error: paramsErr } = await dataClient
        .from("parametros_comissao")
        .select("usar_taxas_na_meta, foco_valor, conciliacao_sobrepoe_vendas")
        .eq("company_id", companyId)
        .maybeSingle();
      if (paramsErr) throw paramsErr;
      if (paramsData) {
        paramsPayload = {
          usar_taxas_na_meta: Boolean(paramsData.usar_taxas_na_meta),
          foco_valor: paramsData.foco_valor === "liquido" ? "liquido" : "bruto",
          conciliacao_sobrepoe_vendas: Boolean((paramsData as any).conciliacao_sobrepoe_vendas),
        };
      }
    }

    let vendasData: any[] = [];
    const concVendas = await fetchConciliacaoRankingVendas({
      dataClient,
      companyId,
      inicio,
      fim,
      vendedorIds: vendorIdsParam,
    });

    if (concVendas && concVendas.length > 0) {
      vendasData = concVendas;
    } else {
      let vendasQuery = dataClient
        .from("vendas")
        .select(
          `
          id,
          data_venda,
          vendedor_id,
          vendas_recibos!inner (
            valor_total,
            valor_taxas,
            valor_du,
            data_venda,
            produto_id,
            tipo_produtos:tipo_produtos!produto_id (id, nome)
          )
        `
        )
        .eq("cancelada", false)
        .in("vendedor_id", vendorIdsParam);
      if (companyId) vendasQuery = vendasQuery.eq("company_id", companyId);

      vendasQuery = vendasQuery
        .gte("vendas_recibos.data_venda", inicio)
        .lte("vendas_recibos.data_venda", fim);

      const { data, error: vendasErr } = await vendasQuery;
      if (vendasErr) throw vendasErr;
      vendasData = data || [];
    }

    let metasQuery = dataClient
      .from("metas_vendedor")
      .select("id, vendedor_id, meta_geral, scope")
      .gte("periodo", inicio)
      .lte("periodo", fim)
      .eq("ativo", true)
      .in("vendedor_id", vendorIdsParam);

    const { data: metasData, error: metasErr } = await metasQuery;
    if (metasErr) throw metasErr;

    let metasProdData: any[] = [];
    const metaIds = (metasData || []).map((m: any) => m.id).filter(Boolean);
    if (metaIds.length > 0) {
      const { data: det, error: detErr } = await dataClient
        .from("metas_vendedor_produto")
        .select("meta_vendedor_id, produto_id, valor")
        .in("meta_vendedor_id", metaIds);
      if (detErr) throw detErr;
      metasProdData = det || [];
    }

    const produtoIds = Array.from(
      new Set(
        metasProdData
          .map((m) => m.produto_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    let produtosMeta: { id: string; nome: string }[] = [];
    if (produtoIds.length > 0) {
      const { data: produtosData, error: prodErr } = await client
        .from("tipo_produtos")
        .select("id, nome")
        .in("id", produtoIds);
      if (prodErr) throw prodErr;
      produtosMeta = (produtosData || []) as { id: string; nome: string }[];
    }

    const payload = {
      params: paramsPayload,
      vendas: vendasData || [],
      metas: metasData || [],
      metasProduto: metasProdData || [],
      produtosMeta,
    };

    // cache local removido: usar apenas kvCache
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
    let errorMsg = "Erro ao carregar ranking.";
    if (err instanceof Error) {
      errorMsg += `\n${err.message}\n${err.stack}`;
    } else if (typeof err === "object") {
      try {
        errorMsg += "\n" + JSON.stringify(err);
      } catch {}
    } else {
      errorMsg += `\n${String(err)}`;
    }
    console.error("Erro relatorios/ranking-vendas", errorMsg, err);
    return new Response(errorMsg, { status: 500 });
  }
}
