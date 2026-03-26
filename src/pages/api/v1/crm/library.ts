import { supabaseServer, hasServiceRoleKey } from "../../../../lib/supabaseServer";
import { buildAuthClient, getUserScope } from "../vendas/_utils";

type ScopeValue = "system" | "master" | "gestor" | "user";
const LOGO_BUCKET = "quotes";
const THEME_SELECT_WITH_LOGO =
  "id, user_id, nome, categoria, categoria_id, asset_url, logo_url, logo_path, width_px, height_px, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, title_style, body_style, signature_style, scope, company_id, ativo";
const THEME_SELECT_LEGACY =
  "id, user_id, nome, categoria, categoria_id, asset_url, width_px, height_px, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, title_style, body_style, signature_style, scope, company_id, ativo";

type ThemeRow = {
  id: string;
  user_id: string | null;
  nome: string;
  categoria: string | null;
  categoria_id: string | null;
  asset_url: string;
  logo_url: string | null;
  logo_path: string | null;
  width_px: number | null;
  height_px: number | null;
  greeting_text: string | null;
  mensagem_max_linhas: number | null;
  mensagem_max_palavras: number | null;
  assinatura_max_linhas: number | null;
  assinatura_max_palavras: number | null;
  title_style: unknown;
  body_style: unknown;
  signature_style: unknown;
  scope: string | null;
  company_id: string | null;
  ativo: boolean | null;
};

type MessageRow = {
  id: string;
  user_id: string | null;
  nome: string;
  assunto: string | null;
  titulo: string;
  corpo: string;
  assinatura: string | null;
  theme_id: string | null;
  title_style: unknown;
  body_style: unknown;
  signature_style: unknown;
  categoria: string | null;
  scope: string | null;
  company_id: string | null;
  ativo: boolean | null;
};

type BrandingSettingsRow = {
  logo_url?: string | null;
  logo_path?: string | null;
  consultor_nome?: string | null;
} | null;

function normalizeScope(value?: string | null): ScopeValue {
  const scope = String(value || "").trim().toLowerCase();
  if (scope === "system" || scope === "master" || scope === "gestor" || scope === "user") return scope;
  // Compatibilidade com base legada: escopo vazio é tratado como "system".
  return "system";
}

function inCompany(companyId: string | null, allowed: Set<string>) {
  const key = String(companyId || "").trim();
  return key ? allowed.has(key) : false;
}

function extractStoragePath(value?: string | null) {
  if (!value) return null;
  const marker = "/quotes/";
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return value.slice(index + marker.length);
}

function cleanUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return raw;
}

function isThemeLogoColumnMissingError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) return false;
  return (
    (message.includes("column") && message.includes("logo_url")) ||
    (message.includes("column") && message.includes("logo_path")) ||
    message.includes("logo_url does not exist") ||
    message.includes("logo_path does not exist")
  );
}

async function fetchThemesWithLogoFallback(client: any) {
  const withLogoResp = await client
    .from("user_message_template_themes")
    .select(THEME_SELECT_WITH_LOGO)
    .order("nome");
  if (!withLogoResp.error) {
    return {
      data: (withLogoResp.data || []) as ThemeRow[],
      error: null as any,
      logoColumnsAvailable: true,
    };
  }

  if (!isThemeLogoColumnMissingError(withLogoResp.error)) {
    return {
      data: [] as ThemeRow[],
      error: withLogoResp.error,
      logoColumnsAvailable: false,
    };
  }

  const legacyResp = await client
    .from("user_message_template_themes")
    .select(THEME_SELECT_LEGACY)
    .order("nome");
  if (legacyResp.error) {
    return {
      data: [] as ThemeRow[],
      error: legacyResp.error,
      logoColumnsAvailable: false,
    };
  }

  const normalized = ((legacyResp.data || []) as any[]).map((row) => ({
    ...row,
    logo_url: null,
    logo_path: null,
  })) as ThemeRow[];

  return {
    data: normalized,
    error: null as any,
    logoColumnsAvailable: false,
  };
}

async function resolveBrandingLogo(client: any, settings: BrandingSettingsRow) {
  if (!settings) return null;
  const rawUrl = cleanUrl(settings.logo_url);
  const logoPath = String(settings.logo_path || extractStoragePath(rawUrl) || "").trim();

  if (logoPath) {
    try {
      const signed = await client.storage.from(LOGO_BUCKET).createSignedUrl(logoPath, 3600);
      const signedUrl = cleanUrl(signed.data?.signedUrl);
      if (signedUrl) {
        return {
          ...settings,
          logo_url: signedUrl,
          logo_path: logoPath,
        };
      }
    } catch {
      // Fallback silencioso para URL já persistida.
    }
    try {
      const publicUrl = cleanUrl(client.storage.from(LOGO_BUCKET).getPublicUrl(logoPath).data.publicUrl);
      if (publicUrl) {
        return {
          ...settings,
          logo_url: publicUrl,
          logo_path: logoPath,
        };
      }
    } catch {
      // Fallback silencioso para URL já persistida.
    }
  }

  return {
    ...settings,
    logo_url: rawUrl,
    logo_path: logoPath || null,
  };
}

export async function GET({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData?.user?.id) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401 });
    }

    const userId = authData.user.id;
    const scope = await getUserScope(authClient, userId);
    const isMaster = scope.papel === "MASTER";
    const isAdmin = Boolean(scope.isAdmin);
    const currentCompanyId = String(scope.companyId || "").trim() || null;

    const masterCompanyIds = new Set<string>();
    if (isMaster) {
      const { data: vinculos } = await authClient
        .from("master_empresas")
        .select("company_id, status")
        .eq("master_id", userId);
      (vinculos || []).forEach((row: any) => {
        const status = String(row?.status || "").toLowerCase();
        const companyId = String(row?.company_id || "").trim();
        if (!companyId) return;
        if (status === "rejected") return;
        masterCompanyIds.add(companyId);
      });
    }
    if (currentCompanyId) masterCompanyIds.add(currentCompanyId);

    const dataClient: any = hasServiceRoleKey ? supabaseServer : authClient;

    const [catsResp, themesResp, messagesResp, sigResp, settingsResp] = await Promise.all([
      dataClient
        .from("crm_template_categories")
        .select("id, nome, icone, sort_order")
        .eq("ativo", true)
        .order("sort_order"),
      fetchThemesWithLogoFallback(dataClient),
      dataClient
        .from("user_message_templates")
        .select("id, user_id, nome, assunto, titulo, corpo, assinatura, theme_id, title_style, body_style, signature_style, categoria, scope, company_id, ativo")
        .order("nome"),
      authClient
        .from("user_crm_assinaturas")
        .select("*")
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle(),
      authClient
        .from("quote_print_settings")
        .select("logo_url, logo_path, consultor_nome")
        .eq("owner_user_id", userId)
        .maybeSingle(),
    ]);

    if (catsResp.error) {
      return new Response(JSON.stringify({ error: catsResp.error.message || "Erro ao carregar categorias." }), {
        status: 500,
      });
    }
    if (themesResp.error) {
      return new Response(JSON.stringify({ error: themesResp.error.message || "Erro ao carregar modelos." }), {
        status: 500,
      });
    }
    if (messagesResp.error) {
      return new Response(JSON.stringify({ error: messagesResp.error.message || "Erro ao carregar textos." }), {
        status: 500,
      });
    }

    const visibleThemes = ((themesResp.data || []) as ThemeRow[]).filter((row) => {
      const rowScope = normalizeScope(row.scope);
      if (isAdmin) return true;
      if (String(row.user_id || "") === userId) return true;
      if (rowScope === "system") return true;
      if (rowScope === "user") return false;
      if (rowScope === "gestor") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      if (rowScope === "master") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      return false;
    });

    const visibleMessages = ((messagesResp.data || []) as MessageRow[]).filter((row) => {
      const rowScope = normalizeScope(row.scope);
      if (isAdmin) return true;
      if (String(row.user_id || "") === userId) return true;
      if (rowScope === "system") return true;
      if (rowScope === "user") return false;
      if (rowScope === "gestor") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      if (rowScope === "master") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      return false;
    });

    let settingsRow = (settingsResp.data || null) as BrandingSettingsRow;
    if (settingsResp.error) {
      const legacySettingsResp = await authClient
        .from("quote_print_settings")
        .select("logo_url, consultor_nome")
        .eq("owner_user_id", userId)
        .maybeSingle();
      if (!legacySettingsResp.error && legacySettingsResp.data) {
        settingsRow = {
          ...legacySettingsResp.data,
          logo_path: null,
        };
      }
    }

    const resolvedSettings = await resolveBrandingLogo(authClient, settingsRow);

    return new Response(
      JSON.stringify({
        userId,
        userRole: scope.papel || null,
        isAdmin,
        currentCompanyId,
        categories: catsResp.data || [],
        themes: visibleThemes,
        messages: visibleMessages,
        signature: sigResp.data || null,
        settings: resolvedSettings,
        themeLogoColumnsAvailable: Boolean(themesResp.logoColumnsAvailable),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Falha ao carregar biblioteca CRM.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }
}
