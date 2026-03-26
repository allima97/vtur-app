import { supabaseServer, hasServiceRoleKey } from "../../../../lib/supabaseServer";
import { buildAuthClient, getUserScope } from "../vendas/_utils";

type ScopeValue = "system" | "master" | "gestor" | "user";

type ThemeRow = {
  id: string;
  user_id: string | null;
  nome: string;
  categoria: string | null;
  categoria_id: string | null;
  asset_url: string;
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
      dataClient
        .from("user_message_template_themes")
        .select(
          "id, user_id, nome, categoria, categoria_id, asset_url, width_px, height_px, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, title_style, body_style, signature_style, scope, company_id, ativo"
        )
        .order("nome"),
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
        .select("logo_url, consultor_nome")
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
      if (row.ativo === false) return false;
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
      if (row.ativo === false) return false;
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

    return new Response(
      JSON.stringify({
        userId,
        currentCompanyId,
        categories: catsResp.data || [],
        themes: visibleThemes,
        messages: visibleMessages,
        signature: sigResp.data || null,
        settings: settingsResp.data || null,
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
