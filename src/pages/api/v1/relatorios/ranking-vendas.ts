
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


    if (papel !== "ADMIN") {
      const modulos = viewMode && papel === "VENDEDOR"
        ? ["dashboard", "relatorios", "relatorios_ranking_vendas"]
        : ["relatorios", "relatorios_ranking_vendas"];
      const denied = await requireModuloView(client, user.id, modulos, "Sem acesso a Relatorios.");
      if (denied) return denied;
    }

    if (papel !== "GESTOR" && papel !== "MASTER" && !(viewMode && papel === "VENDEDOR")) {
      return new Response("Sem acesso ao ranking.", { status: 403 });
    }

    let companyId = companyIdParam;
    if (viewMode && papel === "VENDEDOR") {
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
        params: { usar_taxas_na_meta: true, foco_valor: "bruto" },
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

    const dataClient = viewMode && papel === "VENDEDOR" ? supabaseServer : client;

    let paramsPayload = { usar_taxas_na_meta: true, foco_valor: "bruto" };
    if (companyId) {
      const { data: paramsData, error: paramsErr } = await dataClient
        .from("parametros_comissao")
        .select("usar_taxas_na_meta, foco_valor")
        .eq("company_id", companyId)
        .maybeSingle();
      if (paramsErr) throw paramsErr;
      if (paramsData) {
        paramsPayload = {
          usar_taxas_na_meta: Boolean(paramsData.usar_taxas_na_meta),
          foco_valor: paramsData.foco_valor === "liquido" ? "liquido" : "bruto",
        };
      }
    }

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

    // Competência por recibo
    vendasQuery = vendasQuery
      .gte("vendas_recibos.data_venda", inicio)
      .lte("vendas_recibos.data_venda", fim);

    const { data: vendasData, error: vendasErr } = await vendasQuery;
    if (vendasErr) throw vendasErr;

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
