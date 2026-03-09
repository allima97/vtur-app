import { createServerClient } from "../../../../lib/supabaseServer";
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

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const clienteId = String(url.searchParams.get("cliente_id") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    if (!isUuid(clienteId)) {
      return new Response("cliente_id invalido.", { status: 400 });
    }

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const papel = resolvePapel(tipoName, usoIndividual);

    if (papel !== "ADMIN") {
      const denied = await requireModuloView(
        client,
        user.id,
        ["clientes", "clientes_consulta"],
        "Sem acesso a Clientes."
      );
      if (denied) return denied;
    }

    const cacheKey = ["v1", "clientes", "historico", user.id, clienteId].join("|");

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

    const { data: vendasData, error: vendasErr } = await client
      .from("vendas")
      .select("id, data_lancamento, data_embarque, destino_cidade_id, destinos:produtos!destino_id (nome, cidade_id)")
      .eq("cliente_id", clienteId)
      .order("data_lancamento", { ascending: false });
    if (vendasErr) throw vendasErr;

    let vendasFmt: {
      id: string;
      data_lancamento: string | null;
      data_embarque: string | null;
      destino_nome: string;
      destino_cidade_nome?: string;
      valor_total: number;
      valor_taxas: number;
    }[] = [];

    if (vendasData && vendasData.length > 0) {
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
        cidadesMap = Object.fromEntries(
          (cidadesData || []).map((c: any) => [c.id, c.nome || ""])
        );
      }

      vendasFmt = vendasData.map((v: any) => {
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
        };
      });
    }

    const { data: quotesData, error: quotesErr } = await client
      .from("quote")
      .select("id, created_at, status, status_negociacao, total, client_id, quote_item (title, item_type)")
      .eq("client_id", clienteId)
      .order("created_at", { ascending: false });
    if (quotesErr) throw quotesErr;

    const orcFmt =
      quotesData?.map((q: any) => ({
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
