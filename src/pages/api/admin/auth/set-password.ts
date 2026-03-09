import { supabaseServer, createServerClient, hasServiceRoleKey } from "../../../../lib/supabaseServer";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type BodyPayload = {
  user_id?: string;
  email?: string;
  password?: string;
  confirm_email?: boolean;
};

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
  if (error) return null;
  return data?.user ?? null;
}

async function isAdminUser(authClient: ReturnType<typeof buildAuthClient>, userId: string) {
  const { data, error } = await authClient
    .from("users")
    .select("id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  const role = String((data as any)?.user_types?.name || "").toUpperCase();
  return role.includes("ADMIN");
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = (data as any)?.users || [];
    const found = users.find(
      (u: any) => String(u?.email || "").trim().toLowerCase() === normalized
    );
    if (found?.id) return String(found.id);
    if (users.length < perPage) break;
  }
  return null;
}

export async function POST({ request }: { request: Request }) {
  try {
    const requestUser = await getUserFromRequest(request);
    if (!requestUser) {
      return new Response(JSON.stringify({ error: "Sessao invalida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!hasServiceRoleKey) {
      return new Response(
        JSON.stringify({
          error: "SUPABASE_SERVICE_ROLE_KEY ausente no servidor.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const authClient = buildAuthClient(request);
    const isAdmin = await isAdminUser(authClient, requestUser.id);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await request.json().catch(() => ({}))) as BodyPayload;
    const rawUserId = String(body.user_id || "").trim();
    const rawEmail = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const confirmEmail = body.confirm_email !== false;

    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Senha obrigatoria (minimo 6 caracteres)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!rawUserId && !rawEmail) {
      return new Response(
        JSON.stringify({ error: "Informe user_id ou email." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let targetUserId = rawUserId;
    if (targetUserId && !isUuid(targetUserId)) {
      return new Response(JSON.stringify({ error: "user_id invalido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!targetUserId) {
      targetUserId = (await findAuthUserIdByEmail(rawEmail)) || "";
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "Usuario nao encontrado no Auth." }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const { data, error } = await supabaseServer.auth.admin.updateUserById(targetUserId, {
      password,
      email_confirm: confirmEmail,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message || "Falha ao atualizar senha." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: targetUserId,
        email: data?.user?.email || null,
        email_confirmed_at: data?.user?.email_confirmed_at || null,
        updated_at: data?.user?.updated_at || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
