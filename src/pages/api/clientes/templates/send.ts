import { createServerClient, readEnv, supabaseServer, hasServiceRoleKey } from "../../../../lib/supabaseServer";
import { renderEmailHtml, renderEmailText } from "../../../../lib/emailMarkdown";
import {
  buildFromEmails,
  resolveFromEmails,
  resolveResendApiKey,
  resolveSmtpConfig,
} from "../../../../lib/emailSettings";
import { renderTemplateText } from "../../../../lib/messageTemplates";
import { resolveCardStyleMap } from "../../../../lib/cards/styleConfig";
import { resolveThemeAssetMeta } from "../../../../lib/cards/themeAssetMeta";
import {
  buildCardClientGreeting,
  DEFAULT_CARD_CONSULTANT_ROLE,
  DEFAULT_CARD_FOOTER_LEAD,
} from "../../../../lib/cards/templateRuntime";
import { getSupabaseEnv } from "../../users";
import { getUserScope } from "../../v1/vendas/_utils";

type Body = {
  clienteId?: string;
  templateId?: string;
  canal?: "email" | "whatsapp";
  nomeDestinatario?: string;
  emailDestinatario?: string;
  themeId?: string | null;
};

type ScopeValue = "system" | "master" | "gestor" | "user";

function normalizeScope(value?: string | null): ScopeValue {
  const scope = String(value || "").trim().toLowerCase();
  if (scope === "system" || scope === "master" || scope === "gestor" || scope === "user") return scope;
  return "system";
}

function inCompany(companyId: string | null, allowed: Set<string>) {
  const key = String(companyId || "").trim();
  return key ? allowed.has(key) : false;
}

function canAccessScopedRow(params: {
  isAdmin: boolean;
  userId: string;
  companyIds: Set<string>;
  rowUserId?: string | null;
  rowCompanyId?: string | null;
  rowScope?: string | null;
}) {
  const { isAdmin, userId, companyIds, rowUserId, rowCompanyId, rowScope } = params;
  if (isAdmin) return true;
  if (String(rowUserId || "") === userId) return true;
  const scope = normalizeScope(rowScope);
  if (scope === "system") return true;
  if (scope === "user") return false;
  return inCompany(rowCompanyId || null, companyIds);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractSignatureTextConfig(signatureStyle?: unknown) {
  const content = isPlainObject(signatureStyle) && isPlainObject(signatureStyle.content)
    ? signatureStyle.content
    : null;
  const hasFooterLead =
    !!content && Object.prototype.hasOwnProperty.call(content, "footerLead");
  const hasConsultantRole =
    !!content && Object.prototype.hasOwnProperty.call(content, "consultantRole");

  return {
    footerLead: String(content?.footerLead || "").trim(),
    consultantRole: String(content?.consultantRole || "").trim(),
    hasFooterLead,
    hasConsultantRole,
  };
}

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
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(request);
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

async function enviarEmailResend(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
  apiKey?: string;
}) {
  if (!params.apiKey || !params.fromEmail) {
    return { ok: false, status: "resend_not_configured" };
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.id) {
    return { ok: false, status: String(resp.status || "resend_error"), error: data };
  }
  return { ok: true, status: String(resp.status), id: data.id };
}

export async function POST({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const body = (await request.json()) as Body;

    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData?.user?.id) return new Response("Sessão inválida.", { status: 401 });
    const userId = authData.user.id;
    const userScope = await getUserScope(authClient, userId);
    const isAdmin = Boolean(userScope.isAdmin);
    const companyIds = new Set<string>();
    if (userScope.companyId) companyIds.add(String(userScope.companyId));
    if (userScope.papel === "MASTER") {
      const { data: vinculos } = await authClient
        .from("master_empresas")
        .select("company_id, status")
        .eq("master_id", userId);
      (vinculos || []).forEach((row: any) => {
        const status = String(row?.status || "").toLowerCase();
        const companyId = String(row?.company_id || "").trim();
        if (!companyId || status === "rejected") return;
        companyIds.add(companyId);
      });
    }
    const dataClient: any = hasServiceRoleKey ? supabaseServer : authClient;

    const templateId = String(body.templateId || "").trim();
    const clienteId = String(body.clienteId || "").trim();
    const canal = body.canal || "email";
    if (!templateId || !clienteId) return new Response("templateId e clienteId são obrigatórios.", { status: 400 });
    if (canal !== "email") return new Response("Canal inválido para esta rota.", { status: 400 });

    const { data: userRow } = await authClient
      .from("users")
      .select("id, nome_completo")
      .eq("id", userId)
      .maybeSingle();
    const assinaturaPadrao = String(userRow?.nome_completo || authData.user.user_metadata?.name || "").trim();

    const { data: tpl, error: tplErr } = await dataClient
      .from("user_message_templates")
      .select("id, user_id, company_id, scope, nome, assunto, titulo, corpo, assinatura, ativo, theme_id, title_style, body_style, signature_style")
      .eq("id", templateId)
      .maybeSingle();
    if (tplErr || !tpl) return new Response("Template não encontrado.", { status: 404 });
    if (
      !canAccessScopedRow({
        isAdmin,
        userId,
        companyIds,
        rowUserId: (tpl as any)?.user_id || null,
        rowCompanyId: (tpl as any)?.company_id || null,
        rowScope: (tpl as any)?.scope || null,
      })
    ) {
      return new Response("Template não encontrado.", { status: 404 });
    }
    if (!tpl.ativo) return new Response("Template inativo.", { status: 400 });

    const nomeDestinatario = String(body.nomeDestinatario || "").trim() || "Cliente";
    const emailDestinatario = String(body.emailDestinatario || "").trim().toLowerCase();
    if (!emailDestinatario) return new Response("Destinatário sem e-mail.", { status: 400 });

    const assinatura = String(tpl.assinatura || assinaturaPadrao || "").trim();
    const assunto = renderTemplateText(String(tpl.assunto || tpl.titulo || tpl.nome || "Aviso"), {
      nomeCompleto: nomeDestinatario,
      assinatura,
    });
    const origin = new URL(request.url).origin;
    const requestedThemeId = String(body.themeId || "").trim();
    const selectedThemeId = requestedThemeId || String(tpl.theme_id || "").trim();
    const signatureTextConfig = extractSignatureTextConfig(tpl.signature_style);
    let themeRow: Record<string, any> | null = null;
    if (selectedThemeId) {
      const { data } = await dataClient
        .from("user_message_template_themes")
        .select("id, user_id, company_id, scope, nome, asset_url, width_px, height_px, title_style, body_style, signature_style")
        .eq("id", selectedThemeId)
        .maybeSingle();
      if (
        data &&
        canAccessScopedRow({
          isAdmin,
          userId,
          companyIds,
          rowUserId: (data as any)?.user_id || null,
          rowCompanyId: (data as any)?.company_id || null,
          rowScope: (data as any)?.scope || null,
        })
      ) {
        themeRow = data || null;
      }
    }
    const { data: brandingRow } = await authClient
      .from("quote_print_settings")
      .select("logo_url, logo_path")
      .eq("owner_user_id", userId)
      .maybeSingle();
    const resolvedStyleMap = resolveCardStyleMap({
      themeName: String(themeRow?.nome || "").trim() || null,
      themeBuckets: themeRow
        ? {
            title_style: themeRow.title_style,
            body_style: themeRow.body_style,
            signature_style: themeRow.signature_style,
          }
        : null,
      templateBuckets: {
        title_style: tpl.title_style,
        body_style: tpl.body_style,
        signature_style: tpl.signature_style,
      },
    });
    const cardParams = new URLSearchParams({
      theme_id: selectedThemeId,
      theme_name: String(themeRow?.nome || ""),
      nome: nomeDestinatario,
      cliente_nome: buildCardClientGreeting(nomeDestinatario),
      titulo: String(tpl.titulo || ""),
      corpo: String(tpl.corpo || ""),
      footer_lead: signatureTextConfig.hasFooterLead ? signatureTextConfig.footerLead : DEFAULT_CARD_FOOTER_LEAD,
      assinatura,
      cargo_consultor: signatureTextConfig.hasConsultantRole
        ? signatureTextConfig.consultantRole || DEFAULT_CARD_CONSULTANT_ROLE
        : DEFAULT_CARD_CONSULTANT_ROLE,
      style_overrides: JSON.stringify(resolvedStyleMap),
      v: String(Date.now()),
    });
    if (themeRow) {
      const resolvedThemeAsset = resolveThemeAssetMeta(themeRow);
      if (resolvedThemeAsset.asset_url) cardParams.set("theme_asset_url", resolvedThemeAsset.asset_url);
    }
    const brandingLogoUrl =
      String(brandingRow?.logo_url || "").trim() ||
      String(
        brandingRow?.logo_path
          ? authClient.storage.from("quotes").getPublicUrl(String(brandingRow.logo_path)).data.publicUrl || ""
          : "",
      ).trim();
    if (brandingLogoUrl) cardParams.set("logo_url", brandingLogoUrl);
    const cardUrlSvg = `${origin}/api/v1/cards/render.svg?${cardParams.toString()}`;
    const cardUrlPng = `${origin}/api/v1/cards/render.png?${cardParams.toString()}`;

    const mensagemBase = String(tpl.corpo || tpl.titulo || tpl.nome || "").trim();
    const corpo = [mensagemBase, assinatura ? assinatura : "", `Cartão PNG: ${cardUrlPng}`, `Cartão SVG: ${cardUrlSvg}`]
      .filter(Boolean)
      .join("\n\n");
    const markdown = renderTemplateText(corpo, { nomeCompleto: nomeDestinatario, assinatura });
    const text = renderEmailText(markdown);
    const html = renderEmailHtml(markdown);

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
    const fromEmail = fromEmails.avisos || fromEmails.default || smtpConfig.from || readEnv("ALERTA_FROM_EMAIL");

    const resendResp = await enviarEmailResend({
      to: [emailDestinatario],
      subject: assunto,
      html,
      text,
      fromEmail,
      apiKey: resendApiKey,
    });
    if (!resendResp.ok) {
      return new Response("Falha no envio de e-mail (Resend não configurado ou indisponível).", { status: 400 });
    }

    return new Response(JSON.stringify({ status: "sent", provider: "resend", clienteId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(e?.message || "Erro ao enviar template.", { status: 500 });
  }
}
