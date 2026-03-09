import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 20_000;
const CACHE_MAX_ENTRIES = 100;
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

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipo = String((perfil as any)?.user_types?.name || "").toUpperCase();
    if (!tipo.includes("ADMIN")) {
      return new Response("Sem acesso.", { status: 403 });
    }

    const cacheKey = ["v1", "adminSummary", user.id].join("|");
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=20",
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
          "Cache-Control": "private, max-age=20",
          Vary: "Cookie",
        },
      });
    }

    const [empRes, usersRes, billingRes, plansRes] = await Promise.all([
      client.from("companies").select("id, active"),
      client.from("users").select("id, active"),
      client
        .from("company_billing")
        .select("company_id, status, proximo_vencimento, companies(nome_fantasia, cnpj)"),
      client.from("plans").select("id, ativo"),
    ]);

    if (empRes.error || usersRes.error || billingRes.error || plansRes.error) {
      throw empRes.error || usersRes.error || billingRes.error || plansRes.error;
    }

    const companiesData = empRes.data || [];
    const usersData = usersRes.data || [];
    const billingData = (billingRes.data || []) as Array<{ status?: string; proximo_vencimento?: string | null }>;
    const plansData = plansRes.data || [];

    const empresasTotal = companiesData.length;
    const empresasAtivas = companiesData.filter((c) => c.active).length;
    const empresasInativas = empresasTotal - empresasAtivas;

    const usuariosTotal = usersData.length;
    const usuariosAtivos = usersData.filter((u) => u.active).length;
    const usuariosInativos = usuariosTotal - usuariosAtivos;

    const planosTotal = plansData.length;
    const planosAtivos = plansData.filter((p: any) => p.ativo).length;
    const planosInativos = planosTotal - planosAtivos;

    const billingCounts = {
      active: 0,
      trial: 0,
      past_due: 0,
      suspended: 0,
      canceled: 0,
    };

    const hoje = new Date();
    const atrasadas = billingData.filter((b) => {
      if (b.status === "past_due") return true;
      if (!b.proximo_vencimento) return false;
      const venc = new Date(b.proximo_vencimento);
      return venc < hoje && b.status !== "canceled";
    });

    billingData.forEach((b) => {
      const key = String(b.status || "").toLowerCase();
      if (key in billingCounts) {
        billingCounts[key as keyof typeof billingCounts] += 1;
      }
    });

    const payload = {
      empresasTotal,
      empresasAtivas,
      empresasInativas,
      usuariosTotal,
      usuariosAtivos,
      usuariosInativos,
      planosTotal,
      planosAtivos,
      planosInativos,
      cobrancasAtivas: billingCounts.active,
      cobrancasTrial: billingCounts.trial,
      cobrancasAtrasadas: Math.max(billingCounts.past_due, atrasadas.length),
      cobrancasSuspensas: billingCounts.suspended,
      cobrancasCanceladas: billingCounts.canceled,
    };

    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 20);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=20",
        Vary: "Cookie",
      },
    });
  } catch (e: any) {
    console.error("Erro admin summary:", e);
    return new Response("Erro ao carregar dados administrativos.", { status: 500 });
  }
}
