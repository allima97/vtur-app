import { createServerClient, readEnv } from "../../../../lib/supabaseServer";
import { renderEmailHtml, renderEmailText } from "../../../../lib/emailMarkdown";
import {
  buildFromEmails,
  resolveFromEmails,
  resolveResendApiKey,
  resolveSmtpConfig,
} from "../../../../lib/emailSettings";
import { renderTemplateText } from "../../../../lib/messageTemplates";
import { resolveThemeAssetMeta } from "../../../../lib/cards/officialLibrary";
import { getSupabaseEnv } from "../../users";

type Body = {
  clienteId?: string;
  templateId?: string;
  canal?: "email" | "whatsapp";
  nomeDestinatario?: string;
  emailDestinatario?: string;
  themeId?: string | null;
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

    const { data: tpl, error: tplErr } = await authClient
      .from("user_message_templates")
      .select("id, nome, assunto, titulo, corpo, assinatura, ativo, theme_id, title_style, body_style, signature_style")
      .eq("id", templateId)
      .eq("user_id", userId)
      .maybeSingle();
    if (tplErr || !tpl) return new Response("Template não encontrado.", { status: 404 });
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
    const cardParams = new URLSearchParams({
      template_id: tpl.id,
      nome: nomeDestinatario,
      titulo: String(tpl.titulo || ""),
      corpo: String(tpl.corpo || ""),
      assinatura,
      v: String(Date.now()),
    });
    const requestedThemeId = String(body.themeId || "").trim();
    const selectedThemeId = requestedThemeId || String(tpl.theme_id || "").trim();
    if (selectedThemeId) {
      cardParams.set("theme_id", selectedThemeId);
      const { data: themeRow } = await authClient
        .from("user_message_template_themes")
        .select("nome, asset_url, width_px, height_px")
        .eq("id", selectedThemeId)
        .maybeSingle();
      const resolvedThemeAsset = resolveThemeAssetMeta(themeRow || null);
      if (resolvedThemeAsset.asset_url) cardParams.set("theme_asset_url", resolvedThemeAsset.asset_url);
      if (Number.isFinite(resolvedThemeAsset.width_px) && resolvedThemeAsset.width_px > 0) {
        cardParams.set("width", String(Math.round(resolvedThemeAsset.width_px)));
      }
      if (Number.isFinite(resolvedThemeAsset.height_px) && resolvedThemeAsset.height_px > 0) {
        cardParams.set("height", String(Math.round(resolvedThemeAsset.height_px)));
      }
    }
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
