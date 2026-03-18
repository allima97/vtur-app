import { createServerClient } from "../../../../lib/supabaseServer";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

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

function isIsoDate(value?: string | null) {
  return Boolean(value && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value));
}

function dateStartIso(date: string) {
  return `${date}T00:00:00-03:00`;
}

function dateEndIsoExclusive(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0));
  return nextDay.toISOString();
}

function getQuickFilterOr(filter: string) {
  switch (String(filter || "").trim().toLowerCase()) {
    case "security":
      return [
        "modulo.ilike.%login%",
        "modulo.ilike.%auth%",
        "modulo.ilike.%masterusuarios%",
        "acao.ilike.%login%",
        "acao.ilike.%mfa%",
        "acao.ilike.%2fa%",
        "acao.ilike.%resetou_mfa%",
        "acao.ilike.%senha%",
      ].join(",");
    case "2fa":
      return [
        "modulo.ilike.%auth_mfa%",
        "acao.ilike.%mfa%",
        "acao.ilike.%2fa%",
        "acao.ilike.%resetou_mfa%",
      ].join(",");
    case "login":
      return ["modulo.eq.login", "acao.ilike.%login%"].join(",");
    default:
      return "";
  }
}

type QueryParams = {
  userId: string;
  modulo: string;
  acao: string;
  dateFrom: string;
  dateTo: string;
  quickFilter: string;
  search: string;
};

function applySharedFilters(query: any, params: QueryParams, omit?: Array<"modulo" | "acao">) {
  const skip = new Set(omit || []);

  if (params.userId) {
    query = query.eq("user_id", params.userId);
  }

  if (!skip.has("modulo") && params.modulo) {
    query = query.eq("modulo", params.modulo);
  }

  if (!skip.has("acao") && params.acao) {
    query = query.eq("acao", params.acao);
  }

  if (isIsoDate(params.dateFrom)) {
    query = query.gte("created_at", dateStartIso(params.dateFrom));
  }

  if (isIsoDate(params.dateTo)) {
    query = query.lt("created_at", dateEndIsoExclusive(params.dateTo));
  }

  const quickFilterOr = getQuickFilterOr(params.quickFilter);
  if (quickFilterOr) {
    query = query.or(quickFilterOr);
  }

  if (params.search) {
    const safe = params.search.replace(/[%(),]/g, " ").trim();
    if (safe) {
      query = query.or(
        [
          `acao.ilike.%${safe}%`,
          `modulo.ilike.%${safe}%`,
          `ip.ilike.%${safe}%`,
          `user_agent.ilike.%${safe}%`,
        ].join(",")
      );
    }
  }

  return query;
}

async function countLogs(client: any, params: QueryParams, quickFilterOverride?: string) {
  let query = client.from("logs").select("id", { count: "exact", head: true });
  query = applySharedFilters(query, { ...params, quickFilter: quickFilterOverride ?? params.quickFilter });
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

export async function GET({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Sessao invalida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userError } = await authClient
      .from("users")
      .select("id, user_types(name)")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (userError || !userData) {
      return new Response(JSON.stringify({ error: "Usuario nao encontrado." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tipo = String((userData as any)?.user_types?.name || "").toUpperCase();
    if (!tipo.includes("ADMIN")) {
      return new Response(JSON.stringify({ error: "Acesso negado." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const pageRaw = Number(url.searchParams.get("page") || "1");
    const pageSizeRaw = Number(url.searchParams.get("page_size") || "50");
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(Math.floor(pageSizeRaw), 1), 500) : 50;
    const userId = String(url.searchParams.get("user_id") || "").trim();
    const modulo = String(url.searchParams.get("modulo") || "").trim();
    const acao = String(url.searchParams.get("acao") || "").trim();
    const dateFrom = String(url.searchParams.get("date_from") || "").trim();
    const dateTo = String(url.searchParams.get("date_to") || "").trim();
    const quickFilter = String(url.searchParams.get("quick_filter") || "").trim().toLowerCase();
    const search = String(url.searchParams.get("search") || "").trim();
    const queryParams: QueryParams = {
      userId,
      modulo,
      acao,
      dateFrom,
      dateTo,
      quickFilter,
      search,
    };

    let query = authClient
      .from("logs")
      .select(
        `
        id,
        user_id,
        acao,
        modulo,
        detalhes,
        ip,
        user_agent,
        created_at,
        users:users (nome_completo)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (userId) {
      if (!isUuid(userId)) {
        return new Response(JSON.stringify({ error: "user_id invalido." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    query = applySharedFilters(query, queryParams);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const FACET_SCAN_LIMIT = 5000;
    let modulosDisponiveis: string[] = [];
    let acoesDisponiveis: string[] = [];

    {
      let moduloQuery = authClient
        .from("logs")
        .select("modulo")
        .not("modulo", "is", null)
        .order("created_at", { ascending: false });
      moduloQuery = applySharedFilters(moduloQuery, queryParams, ["modulo"]);
      const { data: moduloRows, error: moduloErr } = await moduloQuery.range(0, FACET_SCAN_LIMIT - 1);
      if (moduloErr) throw moduloErr;
      modulosDisponiveis = Array.from(
        new Set(
          (moduloRows || [])
            .map((row: any) => String(row?.modulo || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }

    {
      let acaoQuery = authClient
        .from("logs")
        .select("acao")
        .not("acao", "is", null)
        .order("created_at", { ascending: false });
      acaoQuery = applySharedFilters(acaoQuery, queryParams, ["acao"]);
      const { data: acaoRows, error: acaoErr } = await acaoQuery.range(0, FACET_SCAN_LIMIT - 1);
      if (acaoErr) throw acaoErr;
      acoesDisponiveis = Array.from(
        new Set(
          (acaoRows || [])
            .map((row: any) => String(row?.acao || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }

    const securityTotal = await countLogs(authClient, { ...queryParams, modulo: "", acao: "" }, "security");
    const loginTotal = await countLogs(authClient, { ...queryParams, modulo: "", acao: "" }, "login");
    const mfaTotal = await countLogs(authClient, { ...queryParams, modulo: "", acao: "" }, "2fa");

    let resetCountQuery = authClient
      .from("logs")
      .select("id", { count: "exact", head: true })
      .or("acao.eq.admin_resetou_mfa,acao.eq.master_resetou_mfa");
    resetCountQuery = applySharedFilters(
      resetCountQuery,
      { ...queryParams, modulo: "", acao: "", quickFilter: "all", search: "" },
      []
    );
    const { count: resetCount, error: resetCountErr } = await resetCountQuery;
    if (resetCountErr) throw resetCountErr;

    return new Response(
      JSON.stringify({
        items: data || [],
        total: Number(count || 0),
        page,
        page_size: pageSize,
        total_pages: Math.max(1, Math.ceil(Number(count || 0) / pageSize)),
        available_modulos: modulosDisponiveis,
        available_acoes: acoesDisponiveis,
        stats: {
          total: Number(count || 0),
          security_total: securityTotal,
          login_total: loginTotal,
          mfa_total: mfaTotal,
          reset_mfa_total: Number(resetCount || 0),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Erro admin/logs", error);
    return new Response(JSON.stringify({ error: error?.message ?? error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
