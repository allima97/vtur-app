import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 900_000;
const CACHE_MAX_ENTRIES = 300;
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

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  if (normalized === "consultoria_online") return "consultoria_online";
  if (normalized === "consultoria") return "consultoria";
  if (normalized === "operacao") return "operacao";
  return normalized;
}

type WidgetInput = {
  widget: string;
  visivel?: boolean;
  settings?: unknown;
};

function normalizeItems(input: unknown): WidgetInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      const widget = String((raw as any)?.widget || "").trim();
      if (!widget) return null;
      const visivel = (raw as any)?.visivel;
      const settings = (raw as any)?.settings;
      return {
        widget,
        visivel: typeof visivel === "boolean" ? visivel : undefined,
        settings: settings === undefined ? undefined : settings,
      } satisfies WidgetInput;
    })
    .filter(Boolean) as WidgetInput[];
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

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const { data: acessos, error: acessoErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id);
      if (acessoErr) throw acessoErr;

      const podeVer = (acessos || []).some(
        (row: any) =>
          row?.ativo &&
          permLevel(row?.permissao as Permissao) >= 1 &&
          normalizeModulo(row?.modulo) === "dashboard"
      );
      if (!podeVer) return new Response("Sem acesso ao Dashboard.", { status: 403 });
    }

    const cacheKey = ["v1", "dashWidgets", user.id].join("|");

    // Try KV first (900 seconds = 15 min TTL)
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=900",
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
          "Cache-Control": "private, max-age=900",
          Vary: "Cookie",
        },
      });
    }

    const { data, error } = await client
      .from("dashboard_widgets")
      .select("widget, ordem, visivel, settings")
      .eq("usuario_id", user.id)
      .order("ordem", { ascending: true });
    if (error) throw error;

    const payload = { items: data || [] };
    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 900);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=900",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro dashboard/widgets", err);
    return new Response("Erro ao carregar widgets.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
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

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const { data: acessos, error: acessoErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id)
        .eq("modulo", "dashboard");
      if (acessoErr) throw acessoErr;

      const podeVer = (acessos || []).some(
        (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 1
      );
      if (!podeVer) return new Response("Sem acesso ao Dashboard.", { status: 403 });
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody);
    const items = normalizeItems((body as any)?.items);

    if (!items.length) {
      return new Response("items obrigatorio.", { status: 400 });
    }

    const rows = items.slice(0, 80).map((it, idx) => ({
      usuario_id: user.id,
      widget: it.widget,
      ordem: idx,
      visivel: it.visivel !== false,
      settings: it.settings ?? null,
    }));

    await client.from("dashboard_widgets").delete().eq("usuario_id", user.id);
    try {
      const { error: insertErr } = await client.from("dashboard_widgets").insert(rows);
      if (insertErr) throw insertErr;
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("settings")) {
        const payloadSemSettings = rows.map((r) => {
          const clone: any = { ...r };
          delete clone.settings;
          return clone;
        });
        const { error: retryErr } = await client.from("dashboard_widgets").insert(payloadSemSettings);
        if (retryErr) throw retryErr;
      } else {
        throw err;
      }
    }

    cache.delete(["v1", "dashWidgets", user.id].join("|"));
    await kvCache.delete(["v1", "dashWidgets", user.id].join("|"));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro dashboard/widgets POST", err);
    return new Response("Erro ao salvar widgets.", { status: 500 });
  }
}
