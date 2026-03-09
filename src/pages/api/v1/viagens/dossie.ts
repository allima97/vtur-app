import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 8_000;
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

function resolveRoles(usoIndividual: boolean) {
  const deveRestringirResponsavel = usoIndividual;
  return { deveRestringirResponsavel };
}

async function loadDossie(client: any, params: { viagemId: string; companyId: string; userId: string; deveRestringirResponsavel: boolean; }) {
  let query = client
    .from("viagens")
    .select(
      `
      id,
      company_id,
      venda_id,
      orcamento_id,
      data_inicio,
      data_fim,
      status,
      origem,
      destino,
      responsavel_user_id,
      responsavel:users!responsavel_user_id (
        nome_completo
      ),
      observacoes,
      follow_up_text,
      follow_up_fechado,
      venda:vendas (
        id,
        cliente_id,
        destino_id,
        clientes:clientes (
          id,
          nome,
          telefone,
          whatsapp
        ),
        vendas_recibos (
          id,
          numero_recibo,
          valor_total,
          valor_taxas,
          data_inicio,
          data_fim,
          produto_id,
          produto_resolvido_id,
          tipo_produtos (
            id,
            nome,
            tipo
          ),
          produto_resolvido:produtos!produto_resolvido_id (
            id,
            nome
          )
        )
      ),
      viagem_acompanhantes (
        id,
        acompanhante_id,
        papel,
        documento_url,
        observacoes,
        cliente_acompanhantes:acompanhante_id (
          nome_completo,
          cpf,
          rg,
          telefone,
          grau_parentesco
        )
      ),
      viagem_servicos (
        id,
        tipo,
        fornecedor,
        descricao,
        status,
        data_inicio,
        data_fim,
        valor,
        moeda,
        voucher_url,
        observacoes
      ),
      viagem_documentos (
        id,
        titulo,
        tipo,
        url,
        mime_type,
        size_bytes,
        created_at
      )
    `
    )
    .eq("id", params.viagemId)
    .eq("company_id", params.companyId);

  if (params.deveRestringirResponsavel) {
    query = query.eq("responsavel_user_id", params.userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const detalhe = data || null;
  if (!detalhe) return null;

  let viagensVenda = [] as any[];
  if (detalhe?.venda_id) {
    let viagensQuery = client
      .from("viagens")
      .select("id, recibo_id, origem, destino, status, data_inicio, data_fim, observacoes")
      .eq("venda_id", detalhe.venda_id)
      .eq("company_id", params.companyId);
    if (params.deveRestringirResponsavel) {
      viagensQuery = viagensQuery.eq("responsavel_user_id", params.userId);
    }
    const { data: viagensData, error: viagensErr } = await viagensQuery;
    if (viagensErr) throw viagensErr;
    viagensVenda = viagensData || [];
  }

  let acompanhantesCliente: any[] = [];
  const clienteBaseId = detalhe?.venda?.cliente_id || null;
  if (clienteBaseId) {
    const { data: acompDisp, error: acompErr } = await client
      .from("cliente_acompanhantes")
      .select("id, nome_completo, cpf, telefone, grau_parentesco")
      .eq("cliente_id", clienteBaseId)
      .eq("ativo", true)
      .order("nome_completo", { ascending: true });
    if (acompErr) throw acompErr;
    acompanhantesCliente = acompDisp || [];
  }

  return { detalhe, viagensVenda, acompanhantesCliente };
}

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const viagemId = String(url.searchParams.get("viagem_id") || "").trim();
    if (!viagemId) return new Response("viagem_id obrigatorio.", { status: 400 });

    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("company_id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const companyId = String((perfil as any)?.company_id || "").trim();
    if (!companyId) {
      return new Response("Empresa nao encontrada.", { status: 400 });
    }

    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const tipoNome = String((perfil as any)?.user_types?.name || "");
    const { deveRestringirResponsavel } = resolveRoles(usoIndividual);

    const cacheKey = ["v2", "dossie", user.id, viagemId].join("|");
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=8",
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
          "Cache-Control": "private, max-age=8",
          Vary: "Cookie",
        },
      });
    }

    const loaded = await loadDossie(client, {
      viagemId,
      companyId,
      userId: user.id,
      deveRestringirResponsavel,
    });

    if (!loaded) {
      return new Response("Viagem nao encontrada.", { status: 404 });
    }

    const payload = {
      viagem: loaded.detalhe,
      viagensVenda: loaded.viagensVenda,
      acompanhantesCliente: loaded.acompanhantesCliente,
      context: {
        userId: user.id,
        companyId,
        usoIndividual,
        userTypeName: tipoNome,
      },
    };

    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 8);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=8",
        Vary: "Cookie",
      },
    });
  } catch (e: any) {
    console.error("Erro dossie viagem:", e);
    return new Response("Erro ao carregar dossie.", { status: 500 });
  }
}
