import type { APIRoute } from "astro";
import { hasServiceRoleKey, supabaseServer, readEnv } from "../../lib/supabaseServer";
import { resolveFromEmails, resolveResendApiKey, resolveSmtpConfig } from "../../lib/emailSettings";
import {
  getConsultoriaLembreteLabel,
  getConsultoriaLembreteMinutes,
} from "../../lib/consultoriaLembretes";

type CronBody = {
  windowMinutes?: number;
  dryRun?: boolean;
  timeZone?: string;
};

type ConsultoriaRow = {
  id: string;
  cliente_nome: string;
  data_hora: string;
  lembrete: string;
  destino: string | null;
  created_by: string | null;
  lembrete_envios?: Record<string, any> | null;
  lembrete_enviado_em?: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  nome_completo: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
};

const CRON_SECRET = (readEnv("CRON_SECRET_CONSULTORIA") || readEnv("CRON_SECRET")) as string;
const ALERTA_FROM_EMAIL = readEnv("ALERTA_FROM_EMAIL");
const SENDGRID_API_KEY = readEnv("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = readEnv("SENDGRID_FROM_EMAIL");
const TWILIO_ACCOUNT_SID = readEnv("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = readEnv("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_SMS = readEnv("TWILIO_FROM_SMS");
const TWILIO_FROM_WHATSAPP = readEnv("TWILIO_FROM_WHATSAPP");
const DEFAULT_COUNTRY_CODE = (readEnv("DEFAULT_COUNTRY_CODE") || "55") as string;
const VAPID_PUBLIC_KEY = readEnv("PUBLIC_VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = readEnv("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = readEnv("VAPID_SUBJECT");

const MAX_LEMBRETE_MINUTOS = 1440;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formatarDataHoraEmail(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  });
}

function normalizePhone(numero?: string | null, countryCode = DEFAULT_COUNTRY_CODE) {
  if (!numero) return "";
  const digits = numero.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith(countryCode)) return `+${digits}`;
  if (digits.length <= 11) return `+${countryCode}${digits}`;
  return `+${digits}`;
}

async function enviarEmailResend({
  to,
  subject,
  html,
  text,
  fromEmail,
  apiKey,
}: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
  apiKey?: string;
}) {
  const from = fromEmail || ALERTA_FROM_EMAIL;
  const key = apiKey;
  if (!key || !from) {
    return { status: "skipped" };
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        text,
      }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(`Resend status ${resp.status}: ${JSON.stringify(j)}`);
    }
    return { status: "sent", id: j?.id };
  } catch (err: any) {
    console.error("Erro ao enviar e-mail (Resend):", err);
    return { status: "failed", error: err?.message || "erro" };
  }
}

async function enviarEmailSendGrid({
  to,
  subject,
  html,
  text,
  fromEmail,
}: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
}) {
  const from = fromEmail || SENDGRID_FROM_EMAIL || ALERTA_FROM_EMAIL;
  if (!SENDGRID_API_KEY || !from) {
    return { status: "skipped" };
  }
  try {
    const personalizations = to.map((dest) => ({ to: [{ email: dest }] }));
    const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations,
        from: { email: from },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`SendGrid status ${resp.status}: ${body}`);
    }
    return { status: "sent" };
  } catch (err: any) {
    console.error("Erro ao enviar e-mail (SendGrid):", err);
    return { status: "failed", error: err?.message || "erro" };
  }
}

async function enviarEmailSMTP(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  smtpConfig: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string };
  fromEmail?: string;
}) {
  // Cloudflare Workers nao suportam SMTP (TCP). Use Resend/SendGrid.
  if (!params.smtpConfig.host || !params.smtpConfig.user || !params.smtpConfig.pass) {
    return { status: "skipped" };
  }
  return { status: "failed", error: "smtp_not_supported" };
}

async function enviarEmailComFallback({
  to,
  subject,
  html,
  text,
  smtpConfig,
  fromEmail,
}: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  smtpConfig: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string };
  fromEmail?: string;
  resendApiKey?: string;
}) {
  const respResend = await enviarEmailResend({ to, subject, html, text, fromEmail, apiKey: resendApiKey });
  if (respResend.status === "sent") return { status: "sent", provider: "resend", raw: respResend };

  const respSendGrid = await enviarEmailSendGrid({ to, subject, html, text, fromEmail });
  if (respSendGrid.status === "sent") return { status: "sent", provider: "sendgrid", raw: respSendGrid };

  const respSmtp = await enviarEmailSMTP({ to, subject, html, text, smtpConfig, fromEmail });
  if (respSmtp.status === "sent") return { status: "sent", provider: "smtp", raw: respSmtp };

  const fallback =
    respSendGrid.status !== "skipped"
      ? { status: respSendGrid.status, provider: "sendgrid", raw: respSendGrid }
      : respResend.status !== "skipped"
        ? { status: respResend.status, provider: "resend", raw: respResend }
        : { status: respSmtp.status, provider: "smtp", raw: respSmtp };

  return fallback;
}

async function enviarSmsTwilio({
  to,
  body,
}: {
  to: string;
  body: string;
}) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_SMS) {
    return { status: "skipped" };
  }
  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const payload = new URLSearchParams({
      From: TWILIO_FROM_SMS,
      To: to,
      Body: body,
    });
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Twilio SMS ${resp.status}: ${text}`);
    }
    return { status: "sent" };
  } catch (err: any) {
    console.error("Erro ao enviar SMS (Twilio):", err);
    return { status: "failed", error: err?.message || "erro" };
  }
}

async function enviarWhatsAppTwilio({
  to,
  body,
}: {
  to: string;
  body: string;
}) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_WHATSAPP) {
    return { status: "skipped" };
  }
  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const payload = new URLSearchParams({
      From: TWILIO_FROM_WHATSAPP,
      To: `whatsapp:${to}`,
      Body: body,
    });
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Twilio WhatsApp ${resp.status}: ${text}`);
    }
    return { status: "sent" };
  } catch (err: any) {
    console.error("Erro ao enviar WhatsApp (Twilio):", err);
    return { status: "failed", error: err?.message || "erro" };
  }
}

async function enviarPushWeb({
  subscriptions,
  payload,
}: {
  subscriptions: { endpoint: string; keys: { p256dh: string; auth: string } }[];
  payload: Record<string, any>;
}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { status: "skipped", invalid: [] as string[] };
  }
  // Cloudflare Workers nao suportam a lib `web-push` (Node). Para habilitar push em producao,
  // mova o envio para um ambiente Node (ex: worker/cron externo) ou implemente VAPID+encryption com WebCrypto.
  void subscriptions;
  void payload;
  return { status: "failed", error: "push_not_supported", invalid: [] as string[] };
}

export const POST: APIRoute = async ({ request }) => {
  if (!hasServiceRoleKey) {
    return new Response("Falta SUPABASE_SERVICE_ROLE_KEY", { status: 500 });
  }

  const secret = request.headers.get("x-cron-secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CronBody;
  const smtpConfig = await resolveSmtpConfig();
  const fromEmails = await resolveFromEmails();
  const resendApiKey = await resolveResendApiKey();
  const fromEmail = fromEmails.avisos || smtpConfig.from;
  const windowMinutes =
    typeof body.windowMinutes === "number" && body.windowMinutes > 0
      ? Math.min(body.windowMinutes, 60)
      : 5;
  const dryRun = !!body.dryRun;
  const timeZone = body.timeZone || "America/Sao_Paulo";

  const supabase = supabaseServer;

  const agora = new Date();
  const agoraMs = agora.getTime();
  const windowMs = windowMinutes * 60 * 1000;
  const limite = new Date(agoraMs + (MAX_LEMBRETE_MINUTOS + windowMinutes) * 60 * 1000);

  const { data: consultorias, error } = await supabase
    .from("consultorias_online")
    .select("id, cliente_nome, data_hora, lembrete, destino, created_by, lembrete_envios, lembrete_enviado_em")
    .neq("lembrete", "none")
    .eq("fechada", false)
    .gte("data_hora", agora.toISOString())
    .lte("data_hora", limite.toISOString())
    .order("data_hora", { ascending: true })
    .limit(200);

  if (error) {
    return new Response(`Erro ao buscar consultorias: ${error.message}`, { status: 500 });
  }

  const pendentes = (consultorias || []).filter((item: any) => {
    const minutos = getConsultoriaLembreteMinutes(item.lembrete);
    if (!minutos) return false;
    const lembreteAt = new Date(item.data_hora).getTime() - minutos * 60 * 1000;
    return lembreteAt <= agoraMs && lembreteAt >= agoraMs - windowMs;
  }) as ConsultoriaRow[];

  if (pendentes.length === 0) {
    return jsonResponse({ status: "ok", pendentes: 0 });
  }

  const userIds = Array.from(new Set(pendentes.map((p) => p.created_by).filter(Boolean))) as string[];
  const { data: usersData } = userIds.length
    ? await supabase.from("users").select("id, email, nome_completo, telefone, whatsapp").in("id", userIds)
    : { data: [] as UserRow[] };
  const userMap = new Map<string, UserRow>(
    (usersData || []).map((u: any) => [u.id, u as UserRow])
  );

  const { data: subsData } = userIds.length
    ? await supabase
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth, active")
        .in("user_id", userIds)
        .eq("active", true)
    : { data: [] as any[] };
  const subsByUser = new Map<string, { endpoint: string; keys: { p256dh: string; auth: string } }[]>();
  (subsData || []).forEach((sub: any) => {
    if (!sub?.user_id || !sub?.endpoint || !sub?.p256dh || !sub?.auth) return;
    const list = subsByUser.get(sub.user_id) || [];
    list.push({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
    subsByUser.set(sub.user_id, list);
  });

  type Canal = "email" | "sms" | "whatsapp" | "push";
  const agrupado = new Map<string, Record<Canal, ConsultoriaRow[]> & { all: ConsultoriaRow[] }>();

  pendentes.forEach((item) => {
    if (!item.created_by) return;
    const bucket =
      agrupado.get(item.created_by) ||
      ({ all: [], email: [], sms: [], whatsapp: [], push: [] } as Record<Canal, ConsultoriaRow[]> & {
        all: ConsultoriaRow[];
      });
    bucket.all.push(item);
    const envios = item.lembrete_envios || {};
    if (envios?.email?.status !== "sent") bucket.email.push(item);
    if (envios?.sms?.status !== "sent") bucket.sms.push(item);
    if (envios?.whatsapp?.status !== "sent") bucket.whatsapp.push(item);
    if (envios?.push?.status !== "sent") bucket.push.push(item);
    agrupado.set(item.created_by, bucket);
  });

  const resultados: any[] = [];
  const agoraIso = agora.toISOString();

  const enviosUpdate = new Map<string, Record<string, any>>();
  const updatedIds = new Set<string>();
  const sentIds = new Set<string>();

  pendentes.forEach((item) => {
    enviosUpdate.set(item.id, { ...(item.lembrete_envios || {}) });
  });

  const marcarEnvios = (items: ConsultoriaRow[], canal: Canal, status: string, extra?: Record<string, any>) => {
    if (!items.length) return;
    items.forEach((item) => {
      const envios = enviosUpdate.get(item.id) || {};
      envios[canal] = { status, at: agoraIso, ...(extra || {}) };
      enviosUpdate.set(item.id, envios);
      updatedIds.add(item.id);
      if (status === "sent") sentIds.add(item.id);
    });
  };

  const montarResumo = (itens: ConsultoriaRow[]) => {
    const listaHtml = itens
      .map((i) => {
        const dataFmt = formatarDataHoraEmail(i.data_hora, timeZone);
        const lembreteLabel = getConsultoriaLembreteLabel(i.lembrete);
        const destino = i.destino ? ` - ${i.destino}` : "";
        return `<li><strong>${i.cliente_nome}</strong> — ${dataFmt} (${lembreteLabel})${destino}</li>`;
      })
      .join("");

    const listaTexto = itens
      .map((i) => {
        const dataFmt = formatarDataHoraEmail(i.data_hora, timeZone);
        const lembreteLabel = getConsultoriaLembreteLabel(i.lembrete);
        const destino = i.destino ? ` - ${i.destino}` : "";
        return `• ${i.cliente_nome} — ${dataFmt} (${lembreteLabel})${destino}`;
      })
      .join("\n");

    return { listaHtml, listaTexto };
  };

  for (const [userId, buckets] of agrupado.entries()) {
    const user = userMap.get(userId);
    const email = user?.email || "";
    const telefone = normalizePhone(user?.telefone || "");
    const whatsapp = normalizePhone(user?.whatsapp || user?.telefone || "");
    const subs = subsByUser.get(userId) || [];

    // EMAIL
    if (buckets.email.length) {
      const { listaHtml, listaTexto } = montarResumo(buckets.email);
      const saudacao = user?.nome_completo ? `Olá, ${user.nome_completo}!` : "Olá!";
      const subject =
        buckets.email.length === 1
          ? `Lembrete de consultoria - ${buckets.email[0].cliente_nome}`
          : `Lembretes de consultoria (${buckets.email.length})`;
      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a;">
          <p>${saudacao}</p>
          <p>Você possui lembretes de consultoria agendados:</p>
          <ul>${listaHtml}</ul>
          <p>Acesse o sistema para mais detalhes.</p>
        </div>
      `;
      const text = `${saudacao}\n\nVocê possui lembretes de consultoria agendados:\n${listaTexto}\n\nAcesse o sistema para mais detalhes.`;

      let status = "dry_run";
      let providerStatus: any = null;
      if (!email) {
        status = "no_email";
      } else if (!dryRun) {
        const resp = await enviarEmailComFallback({
          to: [email],
          subject,
          html,
          text,
          smtpConfig,
          fromEmail,
          resendApiKey,
        });
        status = resp.status;
        providerStatus = resp;
      }

      const providerLabel = providerStatus?.provider || providerStatus?.status || status;
      resultados.push({ userId, canal: "email", email, status, total: buckets.email.length, provider: providerLabel });
      if (!dryRun) marcarEnvios(buckets.email, "email", status, { to: email, provider: providerLabel });
    }

    // SMS
    if (buckets.sms.length) {
      const { listaTexto } = montarResumo(buckets.sms);
      const corpo = `Lembrete de consultoria:\n${listaTexto}`;
      let status = "dry_run";
      let providerStatus: any = null;
      if (!telefone) {
        status = "no_phone";
      } else if (!dryRun) {
        const respSms = await enviarSmsTwilio({ to: telefone, body: corpo });
        status = respSms.status;
        providerStatus = respSms;
      }
      resultados.push({ userId, canal: "sms", telefone, status, total: buckets.sms.length, provider: providerStatus?.status || status });
      if (!dryRun) marcarEnvios(buckets.sms, "sms", status, { to: telefone, provider: providerStatus?.status || status });
    }

    // WHATSAPP
    if (buckets.whatsapp.length) {
      const { listaTexto } = montarResumo(buckets.whatsapp);
      const corpo = `Lembrete de consultoria:\n${listaTexto}`;
      let status = "dry_run";
      let providerStatus: any = null;
      if (!whatsapp) {
        status = "no_whatsapp";
      } else if (!dryRun) {
        const respZap = await enviarWhatsAppTwilio({ to: whatsapp, body: corpo });
        status = respZap.status;
        providerStatus = respZap;
      }
      resultados.push({ userId, canal: "whatsapp", whatsapp, status, total: buckets.whatsapp.length, provider: providerStatus?.status || status });
      if (!dryRun) marcarEnvios(buckets.whatsapp, "whatsapp", status, { to: whatsapp, provider: providerStatus?.status || status });
    }

    // PUSH
    if (buckets.push.length) {
      const primeiro = buckets.push[0];
      const dataFmt = formatarDataHoraEmail(primeiro.data_hora, timeZone);
      const body =
        buckets.push.length === 1
          ? `${primeiro.cliente_nome} - ${dataFmt}`
          : `${buckets.push.length} consultorias com lembrete agora.`;
      let status = "dry_run";
      let providerStatus: any = null;
      let invalidEndpoints: string[] = [];
      if (!subs.length) {
        status = "no_subscription";
      } else if (!dryRun) {
        const respPush = await enviarPushWeb({
          subscriptions: subs,
          payload: {
            title: "Lembrete de consultoria",
            body,
            url: "/consultoria-online",
          },
        });
        status = respPush.status;
        providerStatus = respPush;
        invalidEndpoints = respPush.invalid || [];
      }
      resultados.push({ userId, canal: "push", status, total: buckets.push.length, provider: providerStatus?.status || status });
      if (!dryRun) marcarEnvios(buckets.push, "push", status, { provider: providerStatus?.status || status });

      if (!dryRun && invalidEndpoints.length) {
        await supabase.from("push_subscriptions").update({ active: false }).in("endpoint", invalidEndpoints);
      }
    }
  }

  if (!dryRun && updatedIds.size) {
    await Promise.all(
      Array.from(updatedIds).map((id) => {
        const payload: any = { lembrete_envios: enviosUpdate.get(id) || {} };
        if (sentIds.has(id)) payload.lembrete_enviado_em = agoraIso;
        return supabase.from("consultorias_online").update(payload).eq("id", id);
      })
    );
  }

  return jsonResponse({ status: "ok", pendentes: pendentes.length, resultados });
};
