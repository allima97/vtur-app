import { supabaseServer, createServerClient } from "../../../lib/supabaseServer";

import { getSupabaseEnv } from "../users";
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

async function getUserFromRequest(request: Request) {
  const authClient = buildAuthClient(request);
  const { data, error } = await authClient.auth.getUser();
  if (error) {
    console.error("Nao foi possivel obter usuario da sessao", error);
    return null;
  }
  return data?.user ?? null;
}

export async function POST({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessao invalida.", { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const endpoint = body?.endpoint;
    if (!endpoint) {
      return new Response("Endpoint invalido.", { status: 400 });
    }

    const { error } = await supabaseServer
      .from("push_subscriptions")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);

    if (error) {
      return new Response(`Erro ao desativar subscription: ${error.message}`, { status: 500 });
    }

    return new Response("ok");
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
