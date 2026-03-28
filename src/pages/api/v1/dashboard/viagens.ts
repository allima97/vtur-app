import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

const CACHE_TTL_SECONDS = 300;
const LOCAL_CACHE_TTL_MS = 300_000;
const cache = new Map<string, { expiresAt: number; payload: unknown }>();

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

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

function toISODateLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
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

    let canDashboard = true;
    let canOperacao = true;

    if (!isAdmin) {
      const { data: acessos, error: acessosErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id);
      if (acessosErr) throw acessosErr;

      canDashboard = (acessos || []).some(
        (row: any) =>
          row?.ativo &&
          normalizeModulo(row?.modulo) === "dashboard" &&
          permLevel(row?.permissao) >= 1
      );
      canOperacao = (acessos || []).some(
        (row: any) =>
          row?.ativo &&
          normalizeModulo(row?.modulo) === "operacao" &&
          permLevel(row?.permissao) >= 1
      );
    }

    if (!canDashboard) return new Response("Sem acesso ao Dashboard.", { status: 403 });
    if (!canOperacao) return new Response("Sem acesso a Operacao.", { status: 403 });

    let vendedorIds: string[] = [user.id];
    let papel = "VENDEDOR";

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

    const companyId =
      mode === "gestor" && requestedCompanyId && requestedCompanyId !== "all"
        ? requestedCompanyId
        : null;

    const cacheKey = [
      "v2",
      "dashboardViagens",
      mode,
      user.id,
      papel,
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

    const hojeIso = toISODateLocal(new Date());
    const limiteData = new Date();
    limiteData.setDate(limiteData.getDate() + 14);
    const limiteIso = toISODateLocal(limiteData);

    function agruparPorVenda(rawData: any[]): any[] {
      const grupos = new Map<string, any>();
      for (const v of rawData) {
        const key = (v.venda_id as string) || (v.recibo as any)?.venda_id || v.id;
        const produtoNome: string = v.recibo?.tipo_produtos?.nome || "";
        const existing = grupos.get(key);
        if (!existing) {
          grupos.set(key, {
            ...v,
            produtos_tipos: produtoNome ? [produtoNome] : [],
          });
          continue;
        }
        // Menor data_inicio = embarque real do cliente
        if (v.data_inicio && (!existing.data_inicio || v.data_inicio < existing.data_inicio)) {
          existing.data_inicio = v.data_inicio;
        }
        // Maior data_fim = retorno real (mantemos o id da primeira saída para abrir o dossiê da ida).
        if (v.data_fim && (!existing.data_fim || v.data_fim > existing.data_fim)) {
          existing.data_fim = v.data_fim;
        }
        // Acumula todos os tipos de serviço da viagem
        if (produtoNome && !(existing.produtos_tipos as string[]).includes(produtoNome)) {
          (existing.produtos_tipos as string[]).push(produtoNome);
        }
      }
      return Array.from(grupos.values());
    }

    // Depois de mesclar por venda, faz dedupe por passageiro para evitar poluição no card
    // de próximas viagens quando há múltiplos recibos da mesma viagem/passageiro.
    function agruparPorPassageiroPrimeiraSaida(rawData: any[]): any[] {
      const grupos = new Map<string, any>();
      for (const v of rawData) {
        const clienteId = String(v?.clientes?.id || "").trim();
        const key = clienteId || String(v?.venda_id || v?.recibo?.venda_id || v?.id || "").trim();
        if (!key) continue;

        const produtos = Array.isArray(v?.produtos_tipos)
          ? v.produtos_tipos.filter(Boolean)
          : [];
        const existente = grupos.get(key);
        if (!existente) {
          grupos.set(key, {
            ...v,
            produtos_tipos: Array.from(new Set(produtos)),
          });
          continue;
        }

        const produtosSet = new Set<string>([
          ...((existente.produtos_tipos as string[]) || []),
          ...produtos,
        ]);
        const inicioAtual = String(v?.data_inicio || "");
        const inicioExistente = String(existente?.data_inicio || "");
        const deveTrocarRepresentante =
          Boolean(inicioAtual) && (!inicioExistente || inicioAtual < inicioExistente);

        if (deveTrocarRepresentante) {
          const fimExistente = String(existente?.data_fim || "");
          const fimAtual = String(v?.data_fim || "");
          grupos.set(key, {
            ...existente,
            ...v,
            // Sempre preserva a primeira saída do passageiro
            id: v.id,
            data_inicio: v.data_inicio,
            data_fim:
              fimExistente && (!fimAtual || fimExistente > fimAtual)
                ? existente.data_fim
                : v.data_fim,
            produtos_tipos: Array.from(produtosSet),
          });
          continue;
        }

        existente.produtos_tipos = Array.from(produtosSet);
        if (v.data_fim && (!existente.data_fim || v.data_fim > existente.data_fim)) {
          existente.data_fim = v.data_fim;
        }
        existente.destino = existente.destino || v.destino || null;
        existente.origem = existente.origem || v.origem || null;
        existente.status = existente.status || v.status || null;
        if (!existente.clientes && v.clientes) existente.clientes = v.clientes;
      }
      return Array.from(grupos.values());
    }

    function filtrarProximasViagens(grupos: any[]) {
      return grupos
        .filter((item) => {
          const dataInicio = String(item?.data_inicio || "");
          return Boolean(dataInicio) && dataInicio >= hojeIso && dataInicio <= limiteIso;
        })
        .sort((a, b) => (a.data_inicio || "").localeCompare(b.data_inicio || ""))
        .slice(0, 20);
    }

    let data: unknown[] = [];

    if (mode === "gestor") {
      let candidatasQuery = client
        .from("viagens")
        .select(
          `
            id,
            venda_id,
            data_inicio,
            data_fim,
            status,
            destino,
            responsavel_user_id,
            clientes:clientes (id, nome),
            recibo:vendas_recibos (venda_id)
          `
        )
        .gte("data_inicio", hojeIso)
        .lte("data_inicio", limiteIso)
        .order("data_inicio", { ascending: true })
        .limit(500);

      if (companyId) {
        candidatasQuery = candidatasQuery.eq("company_id", companyId);
      }

      if (vendedorIds.length > 0) {
        candidatasQuery = candidatasQuery.in("responsavel_user_id", vendedorIds);
      }

      const { data: candidatasData, error: candidatasError } = await candidatasQuery;
      if (candidatasError) throw candidatasError;

      const vendaIds = Array.from(
        new Set(
          (candidatasData || [])
            .map((row: any) => String(row?.venda_id || row?.recibo?.venda_id || "").trim())
            .filter(Boolean)
        )
      );
      const avulsas = (candidatasData || []).filter((row: any) => !row?.venda_id);

      let detalhadas: any[] = [];
      if (vendaIds.length > 0) {
        let detalhadasQuery = client
          .from("viagens")
          .select(
            `
              id,
              venda_id,
              data_inicio,
              data_fim,
              status,
              destino,
              responsavel_user_id,
              clientes:clientes (id, nome),
              recibo:vendas_recibos (venda_id)
            `
          )
          .in("venda_id", vendaIds)
          .order("data_inicio", { ascending: true })
          .limit(5000);

        if (companyId) {
          detalhadasQuery = detalhadasQuery.eq("company_id", companyId);
        }

        if (vendedorIds.length > 0) {
          detalhadasQuery = detalhadasQuery.in("responsavel_user_id", vendedorIds);
        }

        const { data: detalhadasData, error: detalhadasError } = await detalhadasQuery;
        if (detalhadasError) throw detalhadasError;
        detalhadas = detalhadasData || [];
      }

      data = filtrarProximasViagens(
        agruparPorPassageiroPrimeiraSaida([
          ...agruparPorVenda(detalhadas),
          ...agruparPorVenda(avulsas),
        ])
      );
    } else {
      let candidatasQuery = client
        .from("viagens")
        .select(
          `
            id,
            venda_id,
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
          `
        )
        .gte("data_inicio", hojeIso)
        .lte("data_inicio", limiteIso)
        .order("data_inicio", { ascending: true })
        .limit(500);

      if (companyId) {
        candidatasQuery = candidatasQuery.eq("company_id", companyId);
      }

      if (vendedorIds.length > 0) {
        candidatasQuery = candidatasQuery.in("venda.vendedor_id", vendedorIds);
      }
      candidatasQuery = candidatasQuery.eq("venda.cancelada", false);

      const { data: candidatasData, error: candidatasError } = await candidatasQuery;
      if (candidatasError) throw candidatasError;

      const vendaIds = Array.from(
        new Set(
          (candidatasData || [])
            .map((row: any) => String(row?.venda_id || row?.recibo?.venda_id || "").trim())
            .filter(Boolean)
        )
      );
      const avulsas = (candidatasData || []).filter((row: any) => !row?.venda_id);

      let detalhadas: any[] = [];
      if (vendaIds.length > 0) {
        let detalhadasQuery = client
          .from("viagens")
          .select(
            `
              id,
              venda_id,
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
            `
          )
          .in("venda_id", vendaIds)
          .order("data_inicio", { ascending: true })
          .limit(5000);

        if (companyId) {
          detalhadasQuery = detalhadasQuery.eq("company_id", companyId);
        }

        if (vendedorIds.length > 0) {
          detalhadasQuery = detalhadasQuery.in("venda.vendedor_id", vendedorIds);
        }
        detalhadasQuery = detalhadasQuery.eq("venda.cancelada", false);

        const { data: detalhadasData, error: detalhadasError } = await detalhadasQuery;
        if (detalhadasError) throw detalhadasError;
        detalhadas = detalhadasData || [];
      }

      data = filtrarProximasViagens(
        agruparPorPassageiroPrimeiraSaida([
          ...agruparPorVenda(detalhadas),
          ...agruparPorVenda(avulsas),
        ])
      );
    }

    const payload = { items: data };

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
    console.error("[api/v1/dashboard/viagens] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
