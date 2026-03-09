import { createServerClient } from "../../../../lib/supabaseServer";
import { clearMaintenanceCache } from "../../../../lib/maintenance";
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

async function requireAdmin(client: any, userId: string) {
  const { data: perfil, error: perfilErr } = await client
    .from("users")
    .select("id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (perfilErr) throw perfilErr;

  const tipo = String((perfil as any)?.user_types?.name || "").toUpperCase();
  if (!tipo.includes("ADMIN")) {
    return false;
  }
  return true;
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const isAdmin = await requireAdmin(client, user.id);
    if (!isAdmin) return new Response("Sem acesso.", { status: 403 });

    const { data, error } = await client
      .from("admin_system_settings")
      .select("maintenance_enabled, maintenance_message, updated_at")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw error;

    return new Response(
      JSON.stringify({
        maintenance_enabled: Boolean(data?.maintenance_enabled),
        maintenance_message: data?.maintenance_message ?? null,
        updated_at: data?.updated_at ?? null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("Erro admin maintenance", e);
    return new Response("Erro ao carregar manutencao.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const isAdmin = await requireAdmin(client, user.id);
    if (!isAdmin) return new Response("Sem acesso.", { status: 403 });

    const body = (await request.json()) as { maintenance_enabled?: boolean; maintenance_message?: string | null };

    const payload = {
      singleton: true,
      maintenance_enabled: Boolean(body?.maintenance_enabled),
      maintenance_message: body?.maintenance_message ?? null,
      updated_by: user.id,
    };

    const { error } = await client
      .from("admin_system_settings")
      .upsert(payload, { onConflict: "singleton" });
    if (error) throw error;

    clearMaintenanceCache();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Erro admin maintenance POST", e);
    return new Response("Erro ao salvar manutencao.", { status: 500 });
  }
}
