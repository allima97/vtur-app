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
    const inicio = String(url.searchParams.get("inicio") || "").trim();
    const fim = String(url.searchParams.get("fim") || "").trim();
    const requestedCompanyId = String(url.searchParams.get("company_id") || "").trim();
    const requestedVendedorIdsRaw = String(url.searchParams.get("vendedor_ids") || "").trim();
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    if (mode !== "geral" && mode !== "gestor") {
      return new Response("mode invalido (use mode=geral ou mode=gestor).", { status: 400 });
    }
    if (!isIsoDate(inicio) || !isIsoDate(fim)) {
      return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
    }

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

    if (!isAdmin) {
      const { data: acessos, error: acessosErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id);
      if (acessosErr) throw acessosErr;
      const podeVer = (acessos || []).some(
        (row: any) =>
          row?.ativo &&
          permLevel(row?.permissao) >= 1 &&
          normalizeModulo(row?.modulo) === "dashboard"
      );
      if (!podeVer) return new Response("Sem acesso ao Dashboard.", { status: 403 });
    }

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
      "dashboardFollowUps",
      mode,
      user.id,
      papel,
      companyId || "all",
      inicio,
      fim,
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

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const ontemIso = ontem.toISOString().slice(0, 10);
    const fimFollowUp = fim < ontemIso ? fim : ontemIso;
    if (fimFollowUp < inicio) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": noCache ? "no-store" : "private, max-age=300",
          Vary: "Cookie",
        },
      });
    }

    let candidatasQuery = client
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
            clientes:clientes (id, nome, whatsapp, telefone),
            destino_cidade:cidades!destino_cidade_id (id, nome)
          )
        `
      )
      .not("data_fim", "is", null)
      .gte("data_fim", inicio)
      .lte("data_fim", fimFollowUp)
      .or("follow_up_fechado.is.null,follow_up_fechado.eq.false")
      .or("status.is.null,status.neq.Fechado")
      .eq("venda.cancelada", false)
      .order("data_fim", { ascending: false })
      .limit(500);

    if (companyId) {
      candidatasQuery = candidatasQuery.eq("company_id", companyId);
    }

    if (vendedorIds.length > 0) {
      candidatasQuery = candidatasQuery.in("venda.vendedor_id", vendedorIds);
    }

    const { data: candidatasData, error: candidatasError } = await candidatasQuery;
    if (candidatasError) throw candidatasError;

    const vendaIds = Array.from(
      new Set(
        (candidatasData || [])
          .map((row: any) => String(row?.venda_id || row?.venda?.id || "").trim())
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
            follow_up_fechado,
            venda:vendas (
              id,
              data_embarque,
              data_final,
              vendedor_id,
              cancelada,
              clientes:clientes (id, nome, whatsapp, telefone),
              destino_cidade:cidades!destino_cidade_id (id, nome)
            )
          `
        )
        .in("venda_id", vendaIds)
        .not("data_fim", "is", null)
        .or("status.is.null,status.neq.Fechado")
        .eq("venda.cancelada", false)
        .order("data_fim", { ascending: false })
        .limit(5000);

      if (companyId) {
        detalhadasQuery = detalhadasQuery.eq("company_id", companyId);
      }

      if (vendedorIds.length > 0) {
        detalhadasQuery = detalhadasQuery.in("venda.vendedor_id", vendedorIds);
      }

      const { data: detalhadasData, error: detalhadasError } = await detalhadasQuery;
      if (detalhadasError) throw detalhadasError;
      detalhadas = detalhadasData || [];
    }

    const grupos = new Map<string, any>();
    for (const item of [...detalhadas, ...avulsas] as any[]) {
      const key = (item.venda_id as string) || (item.venda as any)?.id || item.id;
      const existing = grupos.get(key);
      const itemFechado = item.follow_up_fechado === true;
      if (!existing) {
        grupos.set(key, {
          ...item,
          __allClosed: itemFechado,
        });
        continue;
      }
      existing.__allClosed = Boolean(existing.__allClosed) && itemFechado;
      if (item.data_inicio && (!existing.data_inicio || item.data_inicio < existing.data_inicio)) {
        existing.data_inicio = item.data_inicio;
      }
      if (item.data_fim && (!existing.data_fim || item.data_fim > existing.data_fim)) {
        const savedDataInicio = existing.data_inicio;
        const allClosed = existing.__allClosed;
        Object.assign(existing, item);
        existing.data_inicio = savedDataInicio;
        existing.__allClosed = allClosed;
      }
    }

    const data = Array.from(grupos.values())
      .filter((item: any) => item.__allClosed !== true)
      .filter((item: any) => {
        const retorno = String(item?.data_fim || item?.venda?.data_final || "");
        return Boolean(retorno) && retorno >= inicio && retorno <= fimFollowUp;
      })
      .sort((a, b) => {
        const da = a.data_fim || "";
        const db = b.data_fim || "";
        return da > db ? -1 : da < db ? 1 : 0;
      })
      .map((item: any) => {
        const { __allClosed, ...rest } = item;
        return {
          ...rest,
          follow_up_fechado: __allClosed,
        };
      })
      .slice(0, 20);

    const payload = { items: data || [] };

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
    console.error("[api/v1/dashboard/follow-ups] erro:", error);
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
