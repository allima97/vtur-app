import type { APIRoute } from "astro";
import { hasServiceRoleKey, supabaseServer, readEnv } from "../../lib/supabaseServer";
import { resolveFromEmails, resolveResendApiKey, resolveSmtpConfig } from "../../lib/emailSettings";

type OpcaoCron = {
  periodoInicio?: string; // ISO (yyyy-mm-dd)
  periodoFim?: string; // ISO
  tempoPct?: number; // ex: 0.5 = metade do período
  minPct?: number; // ex: 0.5 = 50% da meta
  dryRun?: boolean;
  webhook?: string;
  canal?: string;
  destinatario?: string; // e-mail(s) adicionais (separados por vírgula)
  mensagem?: string;
};

type MetaRow = {
  vendedor_id: string;
  meta_geral: number;
};

type VendaRow = {
  id: string;
  vendedor_id: string | null;
  data_venda: string;
  cancelada: boolean | null;
  vendas_recibos?: {
    valor_total: number | null;
    valor_taxas: number | null;
    valor_du?: number | null;
    valor_rav?: number | null;
  }[];
};

const CRON_SECRET = (readEnv("CRON_SECRET_COMISSAO") || readEnv("CRON_SECRET")) as string;
const ALERTA_WEBHOOK = (readEnv("ALERTA_WEBHOOK_COMISSAO") || readEnv("ALERTA_WEBHOOK_URL")) as
  | string
  | undefined;
const ALERTA_FROM_EMAIL = readEnv("ALERTA_FROM_EMAIL");
const SENDGRID_API_KEY = readEnv("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = readEnv("SENDGRID_FROM_EMAIL");

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMesAtual() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function daysDiff(a: string, b: string) {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  return Math.max(0, Math.floor((t2 - t1) / (1000 * 60 * 60 * 24)));
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
  void params;
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

export const POST: APIRoute = async ({ request }) => {
  if (!hasServiceRoleKey) {
    return new Response("Falta SUPABASE_SERVICE_ROLE_KEY", { status: 500 });
  }

  const secret = request.headers.get("x-cron-secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as OpcaoCron;

  const periodoInicio = body.periodoInicio || primeiroDiaMesAtual();
  const periodoFim = body.periodoFim || hojeISO();
  const tempoPct = typeof body.tempoPct === "number" ? Math.min(Math.max(body.tempoPct, 0), 1) : 0.5;
  const minPct = typeof body.minPct === "number" ? Math.min(Math.max(body.minPct, 0), 1) : 0.5;
  const dryRun = !!body.dryRun;
  const webhook = body.webhook || ALERTA_WEBHOOK || "";
  const canal = body.canal || "email";
  const destinatarioExtra = body.destinatario || "";
  const mensagemTemplate =
    body.mensagem ||
    "Alerta de meta: atingido {{pct}}% ({{atingido}} / {{meta}}) no período {{periodo}}. Ajuste seu foco.";

  const supabase = supabaseServer;

  const smtpConfig = await resolveSmtpConfig();
  const fromEmails = await resolveFromEmails();
  const resendApiKey = await resolveResendApiKey();
  const fromEmail = fromEmails.financeiro || smtpConfig.from;

  // Parâmetros globais
  const { data: paramsData } = await supabase
    .from("parametros_comissao")
    .select("usar_taxas_na_meta")
    .maybeSingle();
  const usarTaxas = !!paramsData?.usar_taxas_na_meta;

  // Metas do período
  const { data: metas, error: metaErr } = await supabase
    .from("metas_vendedor")
    .select("vendedor_id, meta_geral")
    .eq("periodo", periodoInicio.slice(0, 7) + "-01");
  if (metaErr) {
    return new Response(`Erro ao buscar metas: ${metaErr.message}`, { status: 500 });
  }

  // Vendas do período
  const { data: vendas, error: vendasErr } = await supabase
    .from("vendas")
    .select("id, vendedor_id, data_venda, cancelada, vendas_recibos(valor_total, valor_taxas, valor_du, valor_rav)")
    .eq("cancelada", false)
    .gte("data_venda", periodoInicio)
    .lte("data_venda", periodoFim);
  if (vendasErr) {
    return new Response(`Erro ao buscar vendas: ${vendasErr.message}`, { status: 500 });
  }

  // E-mails dos vendedores
  const vendedoresIds = (metas || []).map((m) => m.vendedor_id).filter(Boolean);
  const { data: usersData } = vendedoresIds.length
    ? await supabase.from("users").select("id, email").in("id", vendedoresIds)
    : { data: [] as any[] };
  const emailMap = new Map<string, string>(
    (usersData || []).map((u: any) => [u.id, u.email || ""])
  );

  const totaisPorVendedor: Record<string, number> = {};
  (vendas || []).forEach((v: VendaRow) => {
    if (!v.vendedor_id) return;
    const recibos = v.vendas_recibos || [];
    let total = 0;
    recibos.forEach((r) => {
      const brutoSemRav = Math.max(0, Number(r.valor_total || 0) - Number((r as any).valor_rav || 0));
      const taxasBrutas = Math.max(0, Number(r.valor_taxas || 0));
      const du = Math.max(0, Number(r.valor_du || 0));
      const taxasEfetivas = Math.max(0, taxasBrutas - du);
      const liquido = Math.max(0, brutoSemRav - taxasEfetivas);
      total += usarTaxas ? brutoSemRav : liquido;
    });
    totaisPorVendedor[v.vendedor_id] = (totaisPorVendedor[v.vendedor_id] || 0) + total;
  });

  const diasTotal = Math.max(1, daysDiff(periodoInicio, periodoFim) || 1);
  const diasPassados = Math.min(diasTotal, daysDiff(periodoInicio, hojeISO()));
  const tempoCorrentePct = diasPassados / diasTotal;

  const alertas: {
    vendedor_id: string;
    email?: string;
    meta: number;
    atingido: number;
    pct: number;
  }[] = [];

  (metas || []).forEach((m: MetaRow) => {
    const meta = Number(m.meta_geral || 0);
    if (!m.vendedor_id || meta <= 0) return;
    const atingido = Number(totaisPorVendedor[m.vendedor_id] || 0);
    const pct = meta > 0 ? atingido / meta : 0;
    if (tempoCorrentePct >= tempoPct && pct < minPct) {
      alertas.push({
        vendedor_id: m.vendedor_id,
        email: emailMap.get(m.vendedor_id),
        meta,
        atingido,
        pct,
      });
    }
  });

  // Webhook payload
  const webhookPayload = {
    periodo: { inicio: periodoInicio, fim: periodoFim },
    tempoPct,
    minPct,
    usarTaxas,
    alertas: alertas.map((a) => ({
      vendedor_id: a.vendedor_id,
      meta: a.meta,
      atingido: a.atingido,
      pct: a.pct,
      email: a.email || "",
    })),
  };

  if (dryRun) {
    return new Response(JSON.stringify({ ...webhookPayload, dryRun: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // Envio de e-mail por vendedor (resumo individual)
  const emailStatuses: Record<string, string> = {};
  for (const a of alertas) {
    const toList = [
      ...(a.email ? [a.email] : []),
      ...destinatarioExtra
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ];
    if (!toList.length) {
      emailStatuses[a.vendedor_id] = "no_email";
      continue;
    }
    const pctStr = (a.pct * 100).toFixed(1);
    const msg = mensagemTemplate
      .replace("{{pct}}", pctStr)
      .replace("{{atingido}}", a.atingido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
      .replace("{{meta}}", a.meta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
      .replace("{{periodo}}", `${periodoInicio} a ${periodoFim}`);

    const subject = "Alerta de Meta - vtur - Sistema de Gerenciamento de Vendas";
    const html = `<p>${msg}</p><p>Período: ${periodoInicio} a ${periodoFim}</p>`;
    const text = `${msg}\nPeríodo: ${periodoInicio} a ${periodoFim}`;

    const resp = await enviarEmailComFallback({
      to: toList,
      subject,
      html,
      text,
      smtpConfig,
      fromEmail,
      resendApiKey,
    });
    emailStatuses[a.vendedor_id] = resp.status || "unknown";
  }

  // Webhook opcional
  let webhookStatus = "skipped";
  if (webhook) {
    try {
      const resp = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });
      webhookStatus = `sent:${resp.status}`;
    } catch (err) {
      webhookStatus = `failed:${(err as Error)?.message || "erro"}`;
    }
  }

  // Log leve
  try {
    await supabase.from("cron_log_alertas").insert({
      tipo: "comissao_alerta",
      total: metas?.length || 0,
      pendentes: alertas.length,
      gerados: alertas.length,
      webhook_status: webhookStatus,
      email_status: JSON.stringify(emailStatuses),
      dry_run: false,
      canal,
      destinatario: destinatarioExtra,
      criado_em: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Log de execução não gravado (cron_log_alertas) para comissao.", err);
  }

  return new Response(
    JSON.stringify({
      periodo: { inicio: periodoInicio, fim: periodoFim },
      tempoPct,
      minPct,
      usarTaxas,
      alertas: alertas.length,
      webhook: webhookStatus,
      email: emailStatuses,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

export const GET: APIRoute = async ({ request }) => {
  // GET atua como dry-run
  const secret = request.headers.get("x-cron-secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  return await POST({ request } as any);
};
