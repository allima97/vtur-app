import { supabaseServer, createServerClient, hasServiceRoleKey } from "../../../lib/supabaseServer";

import { getSupabaseEnv } from "../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type BodyPayload = {
  invite_id?: string | null;
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

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function isTableMissing(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || message.includes("does not exist");
}

function isMissingColumn(error: any, column: string) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" && message.includes(column.toLowerCase());
}

export async function POST({ request }: { request: Request }) {
  try {
    const requestUser = await getUserFromRequest(request);
    if (!requestUser) return new Response("Sessao invalida.", { status: 401 });

    if (!hasServiceRoleKey) {
      return new Response(
        "SUPABASE_SERVICE_ROLE_KEY ausente no servidor. Necessario para aceitar convites.",
        { status: 500 }
      );
    }

    const body = (await request.json()) as BodyPayload;
    const inviteId = String(body.invite_id || "").trim();
    if (!inviteId) return new Response("invite_id e obrigatorio.", { status: 400 });
    if (!isUuid(inviteId)) return new Response("invite_id invalido.", { status: 400 });

    const email = String(requestUser.email || "").trim().toLowerCase();
    if (!email) return new Response("Conta sem e-mail.", { status: 400 });

    const { data: convite, error: conviteErr } = await supabaseServer
      .from("user_convites")
      .select(
        "id, status, invited_email, invited_user_id, company_id, user_type_id, invited_by_role, expires_at"
      )
      .eq("id", inviteId)
      .limit(1)
      .maybeSingle();
    if (conviteErr) {
      if (isTableMissing(conviteErr)) {
        return new Response(
          "Tabela public.user_convites nao existe. Aplique a migration database/migrations/20260211_user_convites.sql.",
          { status: 500 }
        );
      }
      if (isMissingColumn(conviteErr, "expires_at")) {
        return new Response(
          "Coluna public.user_convites.expires_at ausente. Aplique a migration database/migrations/20260311_user_convites_expiration.sql.",
          { status: 500 }
        );
      }
      throw conviteErr;
    }
    if (!convite?.id) return new Response("Convite nao encontrado.", { status: 404 });

    const status = String((convite as any)?.status || "").toLowerCase();
    if (status !== "pending") {
      return new Response("Convite nao esta pendente.", { status: 409 });
    }

    const invitedEmail = String((convite as any)?.invited_email || "").trim().toLowerCase();
    if (invitedEmail !== email) {
      return new Response("Convite nao corresponde a este e-mail.", { status: 403 });
    }

    const expiresAtRaw = String((convite as any)?.expires_at || "");
    if (expiresAtRaw) {
      const expiresAt = new Date(expiresAtRaw);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        await supabaseServer
          .from("user_convites")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", inviteId);
        return new Response("Convite expirado. Solicite um novo convite.", { status: 410 });
      }
    }

    const alreadyBoundId = (convite as any)?.invited_user_id as string | null;
    if (alreadyBoundId && alreadyBoundId !== requestUser.id) {
      return new Response("Convite ja foi associado a outro usuario.", { status: 409 });
    }

    const companyId = String((convite as any)?.company_id || "").trim();
    const userTypeId = String((convite as any)?.user_type_id || "").trim();
    if (!companyId || !userTypeId) {
      return new Response("Convite invalido (empresa/cargo ausente).", { status: 400 });
    }

    const { data: perfilExistente, error: perfilErr } = await supabaseServer
      .from("users")
      .select("id, company_id, uso_individual")
      .eq("id", requestUser.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const companyAtual = String((perfilExistente as any)?.company_id || "").trim();
    const usoAtual = (perfilExistente as any)?.uso_individual as boolean | null | undefined;

    if (companyAtual && companyAtual !== companyId && usoAtual === false) {
      return new Response("Usuario ja vinculado a outra empresa.", { status: 409 });
    }

    const createdByGestor = String((convite as any)?.invited_by_role || "").toUpperCase() === "GESTOR";

    if (!perfilExistente?.id) {
      const { error: insertErr } = await supabaseServer.from("users").insert({
        id: requestUser.id,
        email,
        uso_individual: false,
        company_id: companyId,
        user_type_id: userTypeId,
        active: true,
        created_by_gestor: createdByGestor,
      });
      if (insertErr) throw insertErr;
    } else {
      const { error: updateErr } = await supabaseServer
        .from("users")
        .update({
          email,
          uso_individual: false,
          company_id: companyId,
          user_type_id: userTypeId,
          active: true,
          created_by_gestor: createdByGestor,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestUser.id);
      if (updateErr) throw updateErr;
    }

    await supabaseServer
      .from("user_convites")
      .update({ invited_user_id: requestUser.id })
      .eq("id", inviteId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
