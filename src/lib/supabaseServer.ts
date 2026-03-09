import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

type CloudflareEnv = Record<string, unknown>;

async function tryLoadCloudflareEnv(): Promise<CloudflareEnv | null> {
  try {
    // Cloudflare Workers/Pages runtime: provides `env` at module scope.
    const mod = (await import("cloudflare:workers")) as any;
    const env = mod?.env;
    if (env && typeof env === "object") return env as CloudflareEnv;
  } catch {
    // Node/dev runtimes do not support `cloudflare:` imports.
  }
  return null;
}

const cloudflareEnv = await tryLoadCloudflareEnv();

/**
 * Lê variável de ambiente considerando:
 * - process.env (dev/Node)
 * - env do Worker (Cloudflare)
 * - bindings/env do Worker
 */
export function readEnv(key: string): string | undefined {
  // Cloudflare Workers (sem Node compatibility) não expõem `process` nativamente.
  const fromProcess = (globalThis as any)?.process?.env?.[key];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }

  // Evita acesso dinamico ao import.meta.env (nao suportado pelo module runner).
  let fromImportMeta: string | undefined;
  switch (key) {
    case "SUPABASE_URL":
      fromImportMeta = import.meta.env.SUPABASE_URL;
      break;
    case "PUBLIC_SUPABASE_URL":
      fromImportMeta = import.meta.env.PUBLIC_SUPABASE_URL;
      break;
    case "SUPABASE_SERVICE_ROLE_KEY":
      fromImportMeta = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
      break;
    case "PUBLIC_SUPABASE_ANON_KEY":
      fromImportMeta = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
      break;
    case "ENVIRONMENT":
      fromImportMeta = import.meta.env.ENVIRONMENT;
      break;
    case "NODE_ENV":
      fromImportMeta = import.meta.env.NODE_ENV;
      break;
    case "PUBLIC_NET_METRICS_PANEL":
      fromImportMeta = import.meta.env.PUBLIC_NET_METRICS_PANEL;
      break;
    case "SMTP_HOST":
      fromImportMeta = import.meta.env.SMTP_HOST;
      break;
    case "SMTP_PORT":
      fromImportMeta = import.meta.env.SMTP_PORT;
      break;
    case "SMTP_SECURE":
      fromImportMeta = import.meta.env.SMTP_SECURE;
      break;
    case "SMTP_USER":
      fromImportMeta = import.meta.env.SMTP_USER;
      break;
    case "SMTP_PASS":
      fromImportMeta = import.meta.env.SMTP_PASS;
      break;
    case "ALERTA_FROM_EMAIL":
      fromImportMeta = import.meta.env.ALERTA_FROM_EMAIL;
      break;
    case "ADMIN_FROM_EMAIL":
      fromImportMeta = import.meta.env.ADMIN_FROM_EMAIL;
      break;
    case "AVISOS_FROM_EMAIL":
      fromImportMeta = import.meta.env.AVISOS_FROM_EMAIL;
      break;
    case "FINANCEIRO_FROM_EMAIL":
      fromImportMeta = import.meta.env.FINANCEIRO_FROM_EMAIL;
      break;
    case "SUPORTE_FROM_EMAIL":
      fromImportMeta = import.meta.env.SUPORTE_FROM_EMAIL;
      break;
    case "RESEND_API_KEY":
      fromImportMeta = import.meta.env.RESEND_API_KEY;
      break;
    case "IMAP_HOST":
      fromImportMeta = import.meta.env.IMAP_HOST;
      break;
    case "IMAP_PORT":
      fromImportMeta = import.meta.env.IMAP_PORT;
      break;
    case "IMAP_SECURE":
      fromImportMeta = import.meta.env.IMAP_SECURE;
      break;
    case "CRON_SECRET_COMISSAO":
      fromImportMeta = import.meta.env.CRON_SECRET_COMISSAO;
      break;
    case "CRON_SECRET":
      fromImportMeta = import.meta.env.CRON_SECRET;
      break;
    case "ALERTA_WEBHOOK_COMISSAO":
      fromImportMeta = import.meta.env.ALERTA_WEBHOOK_COMISSAO;
      break;
    case "ALERTA_WEBHOOK_URL":
      fromImportMeta = import.meta.env.ALERTA_WEBHOOK_URL;
      break;
    case "TWILIO_ACCOUNT_SID":
      fromImportMeta = import.meta.env.TWILIO_ACCOUNT_SID;
      break;
    case "TWILIO_AUTH_TOKEN":
      fromImportMeta = import.meta.env.TWILIO_AUTH_TOKEN;
      break;
    case "TWILIO_FROM_SMS":
      fromImportMeta = import.meta.env.TWILIO_FROM_SMS;
      break;
    case "TWILIO_FROM_WHATSAPP":
      fromImportMeta = import.meta.env.TWILIO_FROM_WHATSAPP;
      break;
    case "DEFAULT_COUNTRY_CODE":
      fromImportMeta = import.meta.env.DEFAULT_COUNTRY_CODE;
      break;
    case "PUBLIC_VAPID_PUBLIC_KEY":
      fromImportMeta = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY;
      break;
    case "VAPID_PRIVATE_KEY":
      fromImportMeta = import.meta.env.VAPID_PRIVATE_KEY;
      break;
    case "VAPID_SUBJECT":
      fromImportMeta = import.meta.env.VAPID_SUBJECT;
      break;
    case "SENDGRID_API_KEY":
      fromImportMeta = import.meta.env.SENDGRID_API_KEY;
      break;
    case "SENDGRID_FROM_EMAIL":
      fromImportMeta = import.meta.env.SENDGRID_FROM_EMAIL;
      break;
    default:
      fromImportMeta = undefined;
  }

  if (typeof fromImportMeta === "string" && fromImportMeta.trim()) {
    return fromImportMeta.trim();
  }

  const fromCloudflare = cloudflareEnv?.[key];
  if (typeof fromCloudflare === "string" && fromCloudflare.trim()) {
    return fromCloudflare.trim();
  }

  return undefined;
}

const supabaseUrl =
  readEnv("SUPABASE_URL") || readEnv("PUBLIC_SUPABASE_URL");

const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

const anonKey = readEnv("PUBLIC_SUPABASE_ANON_KEY");

if (!supabaseUrl) {
  const msg =
    "SUPABASE_URL ou PUBLIC_SUPABASE_URL não configurados. " +
    "Defina SUPABASE_URL (recomendado) ou PUBLIC_SUPABASE_URL nas variáveis do Worker " +
    "(wrangler.toml ou dashboard da Cloudflare).";
  if (typeof console !== "undefined") {
    console.error("[supabaseServer] " + msg);
  }
  throw new Error(msg);
}

const supabaseKey = serviceRoleKey || anonKey;
if (!supabaseKey) {
  const msg =
    "SUPABASE_SERVICE_ROLE_KEY ou PUBLIC_SUPABASE_ANON_KEY não configurados. " +
    "Defina SUPABASE_SERVICE_ROLE_KEY (para scripts/admin) ou PUBLIC_SUPABASE_ANON_KEY.";
  if (typeof console !== "undefined") {
    console.error("[supabaseServer] " + msg);
  }
  throw new Error(msg);
}

if (!serviceRoleKey && typeof console !== "undefined") {
  console.warn(
    "[supabaseServer] SUPABASE_SERVICE_ROLE_KEY ausente. Usando anon key (RLS ativo)."
  );
}

export const supabaseServer = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const hasServiceRoleKey = Boolean(serviceRoleKey);

export { createServerClient };
