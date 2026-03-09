import { supabaseServer, createServerClient, readEnv } from "../../../../lib/supabaseServer";
import { renderEmailHtml, renderEmailText } from "../../../../lib/emailMarkdown";
import {
  buildFromEmails,
  resolveResendApiKey,
  resolveFromEmails,
  resolveSmtpConfig,
} from "../../../../lib/emailSettings";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

const ALERTA_FROM_EMAIL = readEnv("ALERTA_FROM_EMAIL");
const SENDGRID_API_KEY = readEnv("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = readEnv("SENDGRID_FROM_EMAIL");

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

function applyTemplate(text: string, vars: Record<string, string>) {
  return text
    .replace(/{{\s*nome\s*}}/gi, vars.nome || "")
    .replace(/{{\s*email\s*}}/gi, vars.email || "")
    .replace(/{{\s*empresa\s*}}/gi, vars.empresa || "");
}


async function enviarEmailResend(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
  apiKey?: string;
}) {
  const fromEmail = params.fromEmail || ALERTA_FROM_EMAIL;
  const key = params.apiKey;
  if (!key || !fromEmail) {
    return { ok: false, status: "resend_not_configured" };
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Erro Resend:", resp.status, data);
    return { ok: false, status: String(resp.status), error: data };
  }
  if (!data?.id) {
    console.error("Resposta Resend sem ID:", data);
    return { ok: false, status: "resend_invalid_response", error: data };
  }
  return { ok: true, status: String(resp.status), id: data?.id };
}

async function enviarEmailSendGrid(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
}) {
  const fromEmail = params.fromEmail || SENDGRID_FROM_EMAIL || ALERTA_FROM_EMAIL;
  if (!SENDGRID_API_KEY || !fromEmail) {
    return { ok: false, status: "sendgrid_not_configured" };
  }
  const personalizations = params.to.map((dest) => ({ to: [{ email: dest }] }));
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations,
      from: { email: fromEmail },
      subject: params.subject,
      content: [
        { type: "text/plain", value: params.text },
        { type: "text/html", value: params.html },
      ],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Erro SendGrid:", resp.status, errText);
    return { ok: false, status: String(resp.status) };
  }
  return { ok: true, status: String(resp.status) };
}

async function enviarEmailSMTP(
  params: { to: string[]; subject: string; html: string; text: string },
  smtpConfig: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string },
  fromEmail?: string
) {
  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    return { ok: false, status: "smtp_not_configured" };
  }
  // Cloudflare Workers nao suportam SMTP (TCP). Use Resend/SendGrid.
  void params;
  void fromEmail;
  return { ok: false, status: "smtp_not_supported" };
}

export async function POST({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }

    const isAdmin = await isAdminUser(authClient, user.id);
    if (!isAdmin) {
      return new Response("Acesso negado.", { status: 403 });
    }

    const body = (await request.json()) as { userId?: string; templateId?: string };
    const userId = body.userId?.trim();
    const templateId = body.templateId?.trim();

    if (!userId || !templateId) {
      return new Response("Usuário e template são obrigatórios.", { status: 400 });
    }

    const { data: template, error: templateErr } = await authClient
      .from("admin_avisos_templates")
      .select("id, nome, assunto, mensagem, ativo, sender_key")
      .eq("id", templateId)
      .single();
    if (templateErr || !template) {
      return new Response("Template não encontrado.", { status: 404 });
    }
    if (!template.ativo) {
      return new Response("Template inativo.", { status: 400 });
    }

    const { data: userRow, error: userErr } = await authClient
      .from("users")
      .select("id, nome_completo, email, companies(nome_fantasia)")
      .eq("id", userId)
      .single();
    if (userErr || !userRow) {
      return new Response("Usuário não encontrado.", { status: 404 });
    }
    let recipientEmail = userRow.email || "";
    if (!recipientEmail) {
      try {
        const authResp = await supabaseServer.auth.admin.getUserById(userId);
        recipientEmail = authResp.data?.user?.email || "";
        if (recipientEmail) {
          await supabaseServer.from("users").update({ email: recipientEmail }).eq("id", userId);
        }
      } catch (err) {
        console.warn("Falha ao recuperar email via auth admin:", err);
      }
    }
    if (!recipientEmail) {
      return new Response("Usuário sem e-mail cadastrado.", { status: 400 });
    }

    const vars = {
      nome: userRow.nome_completo || "",
      email: userRow.email || "",
      empresa: userRow.companies?.nome_fantasia || "",
    };

    const subject = applyTemplate(template.assunto, vars);
    const raw = applyTemplate(template.mensagem, vars);
    const text = renderEmailText(raw);
    const html = renderEmailHtml(raw);

    const to = [recipientEmail];
    const { data: settings } = await authClient
      .from("admin_email_settings")
      .select(
        "resend_api_key, alerta_from_email, admin_from_email, avisos_from_email, financeiro_from_email, suporte_from_email, smtp_user"
      )
      .eq("singleton", true)
      .maybeSingle();

    const smtpConfig = await resolveSmtpConfig();
    const fromEmails = settings ? buildFromEmails(settings) : await resolveFromEmails();
    const resendApiKey = settings?.resend_api_key?.trim() || (await resolveResendApiKey());
    const senderKey = String(template?.sender_key || "avisos").toLowerCase();
    const fromEmail =
      (senderKey === "financeiro"
        ? fromEmails.financeiro
        : senderKey === "suporte"
          ? fromEmails.suporte
          : senderKey === "admin"
            ? fromEmails.admin
            : fromEmails.avisos) || fromEmails.default || smtpConfig.from;

    const resendResp = await enviarEmailResend({ to, subject, html, text, fromEmail, apiKey: resendApiKey });
    if (resendResp.ok) {
      return new Response(JSON.stringify({ status: "sent", provider: "resend", id: resendResp.id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sendgridResp = await enviarEmailSendGrid({ to, subject, html, text, fromEmail });
    if (sendgridResp.ok) {
      return new Response(JSON.stringify({ status: "sent", provider: "sendgrid" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const smtpResp = await enviarEmailSMTP({ to, subject, html, text }, smtpConfig, fromEmail);
    if (smtpResp.ok) {
      return new Response(JSON.stringify({ status: "sent", provider: "smtp" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Nenhum provedor de e-mail configurado.", { status: 500 });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
