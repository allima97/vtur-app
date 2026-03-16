import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 250;
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

function isIsoDate(value: string) {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value);
}

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

function normalizeModulo(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return MODULO_ALIASES[raw] || raw;
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

type AgendaEventItem = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  descricao: string | null;
  allDay: boolean;
};

type RangePayload = {
  inicio: string;
  fim: string;
  items: AgendaEventItem[];
};

function parseDateToUTC(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return new Date(NaN);
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix?.[1]) return new Date(`${isoPrefix[1]}T00:00:00Z`);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  }
  const datePart = raw.split("T")[0].split(" ")[0];
  return new Date(`${datePart}T00:00:00Z`);
}

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function safeISODate(year: number, month: number, day: number) {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    day = 28;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function mapRowToEvent(row: any): AgendaEventItem | null {
  const id = String(row?.id || "").trim();
  if (!id) return null;
  const title = String(row?.titulo || "").trim();
  const start = String(row?.start_at || row?.start_date || "").trim();
  if (!start) return null;
  const endValue = row?.end_at || row?.end_date || row?.start_at || row?.start_date || null;
  const end = endValue ? String(endValue).trim() : null;
  const descricao = row?.descricao == null ? null : String(row.descricao);
  const allDay = row?.all_day == null ? !String(row?.start_at || "").trim() : Boolean(row.all_day);
  return { id, title, start, end, descricao, allDay };
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, company_id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const { data: acessos, error: acessoErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id);
      if (acessoErr) throw acessoErr;

      const allowed = new Set(["operacao_agenda", "operacao"]);
      const podeVer = (acessos || []).some((row: any) => {
        if (!row?.ativo) return false;
        if (permLevel(row?.permissao as Permissao) < 1) return false;
        const key = normalizeModulo(row?.modulo);
        if (key && allowed.has(key)) return true;
        const rawKey = String(row?.modulo || "").trim().toLowerCase();
        return rawKey ? allowed.has(rawKey) : false;
      });
      if (!podeVer) return new Response("Sem acesso a Agenda.", { status: 403 });
    }

    const url = new URL(request.url);
    const inicio = String(url.searchParams.get("inicio") || "").trim();
    const fim = String(url.searchParams.get("fim") || "").trim();
    if (!inicio || !fim) {
      return new Response("inicio e fim sao obrigatorios.", { status: 400 });
    }
    if (!isIsoDate(inicio) || !isIsoDate(fim)) {
      return new Response("inicio e fim devem estar no formato YYYY-MM-DD.", { status: 400 });
    }

    let companyId: string | null = null;
    try {
      const { data: currentCompany, error: currentCompanyErr } = await client.rpc("current_company_id");
      if (currentCompanyErr) throw currentCompanyErr;
      companyId = currentCompany ? String(currentCompany) : null;
    } catch {}

    if (!companyId) {
      companyId = (perfil as any)?.company_id ? String((perfil as any).company_id) : null;
    }

    const cacheKey = ["v1", "agendaRange", user.id, companyId || "no-company", inicio, fim].join("|");

    // Try KV first (10 seconds TTL)
    const kvCached = await kvCache.get<RangePayload>(cacheKey);
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

    // Fall back to local cache
    const localCached = readCache(cacheKey);
    if (localCached) {
      return new Response(JSON.stringify(localCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=10",
          Vary: "Cookie",
        },
      });
    }

    const filterOverlap = [
      `and(start_date.lte.${fim},end_date.gte.${inicio})`,
      `and(start_date.gte.${inicio},start_date.lte.${fim},end_date.is.null)`,
    ].join(",");

    const { data, error } = await client
      .from("agenda_itens")
      .select("id, tipo, titulo, descricao, start_date, end_date, start_at, end_at, all_day")
      .eq("tipo", "evento")
      .eq("user_id", user.id)
      .or(filterOverlap)
      .order("start_date", { ascending: true });

    if (error) throw error;

    const items =
      (data || [])
        .map(mapRowToEvent)
        .filter(Boolean) as AgendaEventItem[];

    // Aniversários (sempre como evento all-day, por empresa atual)
    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    if (!usoIndividual && companyId) {
      try {
        const { data: bdayUsers, error: bdayErr } = await client
          .from("users")
          .select("id, nome_completo, data_nascimento, active, uso_individual, company_id")
          .eq("company_id", companyId)
          .or("active.is.null,active.eq.true")
          .or("uso_individual.is.null,uso_individual.eq.false")
          .not("data_nascimento", "is", null)
          .order("nome_completo", { ascending: true })
          .limit(5000);
        if (bdayErr) throw bdayErr;

        const startYear = Number(inicio.slice(0, 4));
        const endYear = Number(fim.slice(0, 4));
        const birthdayEvents: AgendaEventItem[] = [];

        (bdayUsers || []).forEach((row: any) => {
          const userId = String(row?.id || "").trim();
          const nome = String(row?.nome_completo || "").trim() || "(Sem nome)";
          const nascimento = String(row?.data_nascimento || "").trim();
          if (!userId || !nascimento) return;

          const dt = parseDateToUTC(nascimento);
          if (Number.isNaN(dt.getTime())) return;
          const month = dt.getUTCMonth() + 1;
          const day = dt.getUTCDate();
          if (!month || !day) return;

          for (let year = startYear; year <= endYear; year++) {
            const dateISO = safeISODate(year, month, day);
            if (dateISO < inicio || dateISO > fim) continue;
            birthdayEvents.push({
              id: `birthday:${userId}:${dateISO}`,
              title: `🎂 ${nome}`,
              start: dateISO,
              end: null,
              descricao: "Aniversário",
              allDay: true,
            });
          }
        });

        items.push(...birthdayEvents);
      } catch (error: any) {
        const code = String(error?.code || "");
        const msg = String(error?.message || "");
        if (code !== "42501" && !msg.toLowerCase().includes("row-level security")) {
          console.warn("Falha ao carregar aniversários para agenda:", error);
        }
      }
    }

    items.sort((a, b) => String(a.start).localeCompare(String(b.start)));

    const payload: RangePayload = { inicio, fim, items };
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
    console.error("Erro agenda/range", err);
    return new Response("Erro ao carregar agenda.", { status: 500 });
  }
}
