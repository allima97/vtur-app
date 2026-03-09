import { supabaseServer, createServerClient, readEnv } from "../../lib/supabaseServer";
import { renderEmailHtml, renderEmailText } from "../../lib/emailMarkdown";
import {
  resolveResendApiKey,
  resolveFromEmails,
  resolveSmtpConfig,
} from "../../lib/emailSettings";

import { getSupabaseEnv } from "./users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

const ALERTA_FROM_EMAIL = readEnv("ALERTA_FROM_EMAIL");
const SENDGRID_API_KEY = readEnv("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = readEnv("SENDGRID_FROM_EMAIL");

const TEMPLATE_NOME = "Bem-Vindo!";
const TEMPLATE_ASSUNTO = "Bem-Vindo!";

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

function limparDigitos(valor?: string | null) {
  return (valor || "").replace(/\D/g, "");
}

function validarCpf(valor?: string | null) {
  const digitos = limparDigitos(valor);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1+$/.test(digitos)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i += 1) {
    soma += Number(digitos[i]) * (10 - i);
  }
  let resto = soma % 11;
  const digito1 = resto < 2 ? 0 : 11 - resto;
  soma = 0;
  for (let i = 0; i < 10; i += 1) {
    soma += Number(digitos[i]) * (11 - i);
  }
  resto = soma % 11;
  const digito2 = resto < 2 ? 0 : 11 - resto;
  return digito1 === Number(digitos[9]) && digito2 === Number(digitos[10]);
}

function validarData(valor?: string | null) {
  if (!valor) return false;
  const timestamp = Date.parse(valor);
  return !Number.isNaN(timestamp);
}

function validarCep(valor?: string | null) {
  const digits = limparDigitos(valor);
  return digits.length === 8;
}

function validarTelefone(valor?: string | null) {
  const digits = limparDigitos(valor);
  return digits.length >= 10;
}

function validarNumero(valor?: string | null) {
  return Boolean(valor && valor.trim());
}

function perfilCompleto(perfil: {
  nome_completo?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  numero?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  estado?: string | null;
  uso_individual?: boolean | null;
}) {
  if (!perfil.nome_completo?.trim()) return false;
  if (!validarCpf(perfil.cpf)) return false;
  if (!validarData(perfil.data_nascimento)) return false;
  if (!validarCep(perfil.cep)) return false;
  if (!validarNumero(perfil.numero)) return false;
  if (!validarTelefone(perfil.telefone)) return false;
  if (!perfil.cidade?.trim()) return false;
  if (!perfil.estado?.trim()) return false;
  if (typeof perfil.uso_individual !== "boolean") return false;
  return true;
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

function responseJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function marcarEmailEnviado(userId: string) {
  const { error } = await supabaseServer
    .from("users")
    .update({ welcome_email_sent: true })
    .eq("id", userId);
  if (error) {
    console.warn("Falha ao marcar welcome_email_sent:", error.message);
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }

    const { data: perfil, error: perfilErr } = await supabaseServer
      .from("users")
      .select(
        "id, nome_completo, cpf, data_nascimento, telefone, cep, numero, cidade, estado, uso_individual, email, welcome_email_sent, companies(nome_fantasia)"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (perfilErr) {
      return new Response(`Falha ao carregar perfil: ${perfilErr.message}`, { status: 500 });
    }

    if (!perfil) {
      return new Response("Usuário não encontrado.", { status: 404 });
    }

    if (perfil.welcome_email_sent) {
      return new Response(null, { status: 204 });
    }

    if (!perfilCompleto(perfil)) {
      return new Response("Perfil incompleto.", { status: 400 });
    }

    let recipientEmail = (perfil.email || user.email || "").trim().toLowerCase();
    if (!recipientEmail) {
      try {
        const authResp = await supabaseServer.auth.admin.getUserById(user.id);
        recipientEmail = String(authResp.data?.user?.email || "").trim().toLowerCase();
        if (recipientEmail) {
          await supabaseServer.from("users").update({ email: recipientEmail }).eq("id", user.id);
        }
      } catch (err) {
        console.warn("Falha ao recuperar email via auth admin:", err);
      }
    }

    if (!recipientEmail) {
      return new Response("Usuário sem e-mail cadastrado.", { status: 400 });
    }

    let templateResp = await supabaseServer
      .from("admin_avisos_templates")
      .select("id, nome, assunto, mensagem, ativo, sender_key")
      .eq("nome", TEMPLATE_NOME)
      .limit(1)
      .maybeSingle();

    if (!templateResp.data) {
      templateResp = await supabaseServer
        .from("admin_avisos_templates")
        .select("id, nome, assunto, mensagem, ativo, sender_key")
        .eq("assunto", TEMPLATE_ASSUNTO)
        .limit(1)
        .maybeSingle();
    }

    if (templateResp.error) {
      return new Response(`Falha ao carregar template: ${templateResp.error.message}`, { status: 500 });
    }

    const template = templateResp.data;
    if (!template) {
      return new Response("Template Bem-Vindo! não encontrado.", { status: 404 });
    }
    if (!template.ativo) {
      return new Response("Template Bem-Vindo! está inativo.", { status: 400 });
    }

    const vars = {
      nome: perfil.nome_completo || "",
      email: recipientEmail,
      empresa: perfil.companies?.nome_fantasia || "",
    };

    const subject = applyTemplate(template.assunto, vars);
    const raw = applyTemplate(template.mensagem, vars);
    const text = renderEmailText(raw);
    const html = renderEmailHtml(raw);

    const smtpConfig = await resolveSmtpConfig();
    const fromEmails = (await resolveFromEmails()) || {};
    const resendApiKey = await resolveResendApiKey();

    const senderKey = String(template?.sender_key || "avisos").toLowerCase();
    const fromEmail =
      (senderKey === "financeiro"
        ? fromEmails.financeiro
        : senderKey === "suporte"
          ? fromEmails.suporte
          : senderKey === "admin"
            ? fromEmails.admin
            : fromEmails.avisos) || fromEmails.default || smtpConfig.from;

    const to = [recipientEmail];

    const resendResp = await enviarEmailResend({
      to,
      subject,
      html,
      text,
      fromEmail,
      apiKey: resendApiKey,
    });

    if (resendResp.ok) {
      await marcarEmailEnviado(user.id);
      return responseJson({ status: "sent", provider: "resend", id: resendResp.id }, 200);
    }

    const sendgridResp = await enviarEmailSendGrid({ to, subject, html, text, fromEmail });
    if (sendgridResp.ok) {
      await marcarEmailEnviado(user.id);
      return responseJson({ status: "sent", provider: "sendgrid" }, 200);
    }

    const smtpResp = await enviarEmailSMTP({ to, subject, html, text }, smtpConfig, fromEmail);
    if (smtpResp.ok) {
      await marcarEmailEnviado(user.id);
      return responseJson({ status: "sent", provider: "smtp" }, 200);
    }

    return new Response("Nenhum provedor de e-mail configurado.", { status: 500 });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
