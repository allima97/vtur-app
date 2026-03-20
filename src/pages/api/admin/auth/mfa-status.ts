import { supabaseServer, createServerClient, hasServiceRoleKey } from "../../../../lib/supabaseServer";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type BodyPayload = {
  user_ids?: string[];
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

function normalizeUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(
          (item) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)
        )
    )
  );
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
          available: false,
          reason: "service_role_missing",
          statuses: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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
    const userIds = normalizeUserIds(body.user_ids);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ statuses: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const statuses: Record<string, { enabled: boolean; verified_count: number; factor_count: number }> = {};

    for (const userId of userIds) {
      const { data, error } = await supabaseServer.auth.admin.mfa.listFactors({ userId });
      if (error) {
        statuses[userId] = { enabled: false, verified_count: 0, factor_count: 0 };
        continue;
      }
      const factors = (data?.factors || []) as Array<{ status?: string | null }>;
      const verifiedCount = factors.filter((factor) => String(factor?.status || "") === "verified").length;
      statuses[userId] = {
        enabled: verifiedCount > 0,
        verified_count: verifiedCount,
        factor_count: factors.length,
      };
    }

    return new Response(JSON.stringify({ available: true, statuses }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
