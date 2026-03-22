import { supabaseServer, readEnv } from "./supabaseServer";

export type EmailSettingsRow = {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  alerta_from_email: string | null;
  admin_from_email: string | null;
  avisos_from_email: string | null;
  financeiro_from_email: string | null;
  suporte_from_email: string | null;
  resend_api_key: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
};

function isEmailLike(value?: string | null) {
  const raw = String(value || "").trim();
  return raw.includes("@") ? raw : "";
}

function looksLikeResendSmtp(settings?: Partial<EmailSettingsRow> | null) {
  const host = String(settings?.smtp_host || "").trim().toLowerCase();
  const user = String(settings?.smtp_user || "").trim().toLowerCase();
  return host === "smtp.resend.com" && user === "resend";
}

export type SmtpConfig = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
};

export type FromEmails = {
  default?: string;
  admin?: string;
  avisos?: string;
  financeiro?: string;
  suporte?: string;
};

export type ImapConfig = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
};

export async function getEmailSettings(): Promise<EmailSettingsRow | null> {
  try {
    const { data, error } = await supabaseServer
      .from("admin_email_settings")
      .select(
        "smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, alerta_from_email, admin_from_email, avisos_from_email, financeiro_from_email, suporte_from_email, resend_api_key, imap_host, imap_port, imap_secure"
      )
      .eq("singleton", true)
      .maybeSingle();
    if (error) {
      console.warn("Falha ao carregar admin_email_settings:", error.message);
      return null;
    }
    return (data as EmailSettingsRow) || null;
  } catch (err) {
    console.warn("Erro ao carregar admin_email_settings:", err);
    return null;
  }
}

export async function resolveSmtpConfig(): Promise<SmtpConfig> {
  const settings = await getEmailSettings();

  const host = settings?.smtp_host || readEnv("SMTP_HOST");
  const portRaw = settings?.smtp_port ?? Number(readEnv("SMTP_PORT") || 0);
  const port = Number(portRaw || 0) || 465;
  const secure =
    typeof settings?.smtp_secure === "boolean"
      ? settings.smtp_secure
      : String(readEnv("SMTP_SECURE") ?? "true") === "true";
  const user = settings?.smtp_user || readEnv("SMTP_USER");
  const pass = settings?.smtp_pass || readEnv("SMTP_PASS");
  const from =
    settings?.alerta_from_email ||
    readEnv("ALERTA_FROM_EMAIL") ||
    user;

  return { host, port, secure, user, pass, from };
}

export function buildFromEmails(settings: Partial<EmailSettingsRow> | null): FromEmails {
  const smtpUserEmail = isEmailLike(settings?.smtp_user) || isEmailLike(readEnv("SMTP_USER"));
  const defaultFrom =
    settings?.alerta_from_email ||
    settings?.admin_from_email ||
    readEnv("ALERTA_FROM_EMAIL") ||
    readEnv("ADMIN_FROM_EMAIL") ||
    smtpUserEmail;

  const avisos = settings?.avisos_from_email || readEnv("AVISOS_FROM_EMAIL") || defaultFrom;
  const financeiro =
    settings?.financeiro_from_email ||
    readEnv("FINANCEIRO_FROM_EMAIL") ||
    defaultFrom;
  const suporte = settings?.suporte_from_email || readEnv("SUPORTE_FROM_EMAIL") || defaultFrom;
  const admin = settings?.admin_from_email || readEnv("ADMIN_FROM_EMAIL") || defaultFrom;

  return {
    default: defaultFrom,
    avisos,
    financeiro,
    admin,
    suporte,
  };
}

export async function resolveFromEmails(): Promise<FromEmails> {
  const settings = await getEmailSettings();
  return buildFromEmails(settings);
}

export async function resolveResendApiKey(): Promise<string | undefined> {
  const settings = await getEmailSettings();
  const dbKey = settings?.resend_api_key?.trim();
  const smtpCompatKey =
    !dbKey && looksLikeResendSmtp(settings) ? String(settings?.smtp_pass || "").trim() : "";
  return dbKey || smtpCompatKey || readEnv("RESEND_API_KEY");
}

export async function resolveImapConfig(): Promise<ImapConfig> {
  const settings = await getEmailSettings();

  const host = settings?.imap_host || readEnv("IMAP_HOST");
  const portRaw = settings?.imap_port ?? Number(readEnv("IMAP_PORT") || 0);
  const port = Number(portRaw || 0) || 993;
  const secure =
    typeof settings?.imap_secure === "boolean"
      ? settings.imap_secure
      : String(readEnv("IMAP_SECURE") ?? "true") === "true";
  const user = settings?.smtp_user || readEnv("SMTP_USER");
  const pass = settings?.smtp_pass || readEnv("SMTP_PASS");

  return { host, port, secure, user, pass };
}
