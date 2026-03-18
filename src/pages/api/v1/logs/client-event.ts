import { createServerClient } from "../../../../lib/supabaseServer";
import { registrarLogServidor } from "../../../../lib/serverLogs";
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

export async function POST({ request }: { request: Request }) {
  try {
    const body = await request.json().catch(() => null);
    const acao = String(body?.acao || "").trim();
    const modulo = String(body?.modulo || "").trim();
    const detalhes =
      body?.detalhes && typeof body.detalhes === "object" ? body.detalhes : {};
    const requestedUserId = body?.user_id ? String(body.user_id).trim() : null;

    if (!acao || !modulo) {
      return new Response(JSON.stringify({ error: "acao e modulo sao obrigatorios." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authClient = buildAuthClient(request);
    const { data: authData } = await authClient.auth.getUser();
    const authUserId = authData?.user?.id ?? null;
    if (!authUserId) {
      return new Response(JSON.stringify({ error: "Sessao invalida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const effectiveUserId =
      requestedUserId && requestedUserId === authUserId ? requestedUserId : authUserId;

    await registrarLogServidor({
      user_id: effectiveUserId,
      acao,
      modulo,
      detalhes,
      request,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro ao registrar log client-event:", error);
    return new Response(JSON.stringify({ error: "Erro ao registrar log." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
