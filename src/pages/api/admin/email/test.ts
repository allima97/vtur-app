import { createServerClient, readEnv } from "../../../../lib/supabaseServer";
import { buildFromEmails, resolveResendApiKey } from "../../../../lib/emailSettings";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
const ALERTA_FROM_EMAIL = readEnv("ALERTA_FROM_EMAIL");

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

async function isAdminUser(authClient: ReturnType<typeof buildAuthClient>, userId: string) {
  const { data, error } = await authClient
    .from("users")
    .select("id, user_types(name)")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Erro ao validar admin:", error);
    return false;
  }
  const role = (data?.user_types?.name || "").toUpperCase();
  return role.includes("ADMIN");
}

export async function POST({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isAdmin = await isAdminUser(authClient, user.id);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await request.json().catch(() => ({}))) as { to?: string };
    const destino = body.to?.trim() || user.email || "";
    if (!destino) {
      return new Response(JSON.stringify({ error: "Informe o e-mail de destino." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await authClient
      .from("admin_email_settings")
      .select(
        "resend_api_key, alerta_from_email, admin_from_email, avisos_from_email, financeiro_from_email, suporte_from_email, smtp_user"
      )
      .eq("singleton", true)
      .maybeSingle();

    const resendApiKey = settings?.resend_api_key?.trim() || (await resolveResendApiKey());
    const fromEmails = buildFromEmails(settings ?? null);
    const from = fromEmails.admin || fromEmails.default || ALERTA_FROM_EMAIL;

    if (!resendApiKey || !from) {
      return new Response(JSON.stringify({ error: "Resend não configurado." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const subject = "Teste de envio vtur";
    const text = "Este é um teste de envio de e-mail via Resend.";
    const html = "<p>Este é um teste de envio de e-mail via Resend.</p>";

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [destino],
        subject,
        html,
        text,
      }),
    });

    const rawText = await resp.text();
    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data, raw: rawText, status: resp.status }), {
        status: resp.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!data?.id) {
      return new Response(
        JSON.stringify({
          error: "Resposta do Resend sem ID.",
          status: resp.status,
          payload: data,
          raw: rawText,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ status: "sent", provider: "resend", id: data?.id, to: destino, from }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
