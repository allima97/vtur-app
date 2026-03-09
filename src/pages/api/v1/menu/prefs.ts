import { createServerClient } from "../../../../lib/supabaseServer";

import { getSupabaseEnv } from "../../users";
import { normalizeMenuPrefs } from "../../../../lib/menuPrefs";

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

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data, error } = await client
      .from("menu_prefs")
      .select("prefs, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    const prefs = normalizeMenuPrefs(data?.prefs);

    return new Response(JSON.stringify({ prefs, updated_at: data?.updated_at ?? null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
        Vary: "Cookie",
      },
    });
  } catch (err: any) {
    console.error("Erro menu/prefs GET", err);
    return new Response("Erro ao carregar preferências do menu.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const body = safeJsonParse(await request.text()) as any;
    const nextPrefs = normalizeMenuPrefs(body?.prefs);

    const payload = {
      user_id: user.id,
      prefs: nextPrefs as any,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from("menu_prefs").upsert(payload, {
      onConflict: "user_id",
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro menu/prefs POST", err);
    return new Response("Erro ao salvar preferências do menu.", { status: 500 });
  }
}
