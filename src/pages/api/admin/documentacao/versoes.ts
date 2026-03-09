import { createServerClient, supabaseServer } from "../../../../lib/supabaseServer";
import { DOC_SLUGS } from "../../../../lib/systemName";

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
    throw new Error("PUBLIC_SUPABASE_URL ou PUBLIC_SUPABASE_ANON_KEY não configurados.");
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
    console.error("Não foi possível obter usuário da sessão", error);
    return null;
  }
  return data?.user ?? null;
}

async function isAdminUser(userId: string) {
  const { data, error } = await supabaseServer
    .from("users")
    .select("id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const tipo = String((data as any)?.user_types?.name || "").toUpperCase();
  return tipo.includes("ADMIN");
}

export async function GET({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return new Response("Apenas administradores podem acessar o histórico.", { status: 403 });
    }

    const { data, error } = await supabaseServer
      .from("system_documentation_versions")
      .select("id, action, created_at, created_by, users:created_by (id, nome_completo, email)")
      .in("slug", [...DOC_SLUGS])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    return new Response(JSON.stringify({ items: data || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
