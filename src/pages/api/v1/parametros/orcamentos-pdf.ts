import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";

const CACHE_TTL_SECONDS = 600;
const LOGO_BUCKET = "quotes";

const DEFAULT_FOOTER =
  "Precos em real (R$) convertido ao cambio do dia sujeito a alteracao e disponibilidade da tarifa.\n" +
  "Valor da crianca valido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.\n" +
  "Este orcamento e apenas uma tomada de preco.\n" +
  "Os servicos citados nao estao reservados; a compra somente podera ser confirmada apos a confirmacao dos fornecedores.\n" +
  "Este orcamento foi feito com base na menor tarifa para os servicos solicitados, podendo sofrer alteracao devido a disponibilidade de lugares no ato da compra.\n" +
  "As regras de cancelamento de cada produto podem ser consultadas por meio do link do QR Code.";

function buildCacheKey(userId: string) {
  return ["v1", "parametrosOrcamentosPdf", userId].join("|");
}

function extractStoragePath(value?: string | null) {
  if (!value) return null;
  const marker = "/quotes/";
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return value.slice(index + marker.length);
}

async function resolvePreviewUrl(client: any, path?: string | null, url?: string | null) {
  if (path) {
    const signed = await client.storage.from(LOGO_BUCKET).createSignedUrl(path, 3600);
    return signed.data?.signedUrl || url || null;
  }
  return url || null;
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["parametros_orcamentos", "parametros"],
        1,
        "Sem acesso aos parametros de orcamento."
      );
      if (denied) return denied;
    }

    const cacheKey = buildCacheKey(user.id);
    const cached = await kvCache.get<any>(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: userRow, error: userErr } = await client
      .from("users")
      .select("company_id, nome_completo, email")
      .eq("id", user.id)
      .maybeSingle();
    if (userErr) throw userErr;

    const { data, error } = await client
      .from("quote_print_settings")
      .select(
        "id, owner_user_id, company_id, logo_url, logo_path, imagem_complementar_url, imagem_complementar_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto"
      )
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    const logoPath = data?.logo_path || extractStoragePath(data?.logo_url);
    const complementoPath =
      data?.imagem_complementar_path || extractStoragePath(data?.imagem_complementar_url);

    const payload = {
      settings: {
        id: data?.id || null,
        owner_user_id: data?.owner_user_id || user.id,
        company_id: data?.company_id || userRow?.company_id || null,
        logo_url: data?.logo_url || null,
        logo_path: logoPath || null,
        imagem_complementar_url: data?.imagem_complementar_url || null,
        imagem_complementar_path: complementoPath || null,
        consultor_nome: data?.consultor_nome || userRow?.nome_completo || "",
        filial_nome: data?.filial_nome || "",
        endereco_linha1: data?.endereco_linha1 || "",
        endereco_linha2: data?.endereco_linha2 || "",
        endereco_linha3: data?.endereco_linha3 || "",
        telefone: data?.telefone || "",
        whatsapp: data?.whatsapp || "",
        whatsapp_codigo_pais: data?.whatsapp_codigo_pais || "",
        email: data?.email || userRow?.email || "",
        rodape_texto: data?.rodape_texto || DEFAULT_FOOTER,
      },
      logo_preview_url: await resolvePreviewUrl(client, logoPath, data?.logo_url || null),
      complemento_preview_url: await resolvePreviewUrl(
        client,
        complementoPath,
        data?.imagem_complementar_url || null
      ),
    };

    await kvCache.set(cacheKey, payload, CACHE_TTL_SECONDS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro parametros/orcamentos-pdf", err);
    return new Response("Erro ao carregar parametros do orcamento.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["parametros_orcamentos", "parametros"],
        3,
        "Sem permissao para editar parametros de orcamento."
      );
      if (denied) return denied;
    }

    const body = (await request.json()) as any;

    const { data: userRow, error: userErr } = await client
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (userErr) throw userErr;

    const payload = {
      owner_user_id: user.id,
      company_id: userRow?.company_id || null,
      logo_url: body?.logo_url || null,
      logo_path: body?.logo_path || null,
      imagem_complementar_url: body?.imagem_complementar_url || null,
      imagem_complementar_path: body?.imagem_complementar_path || null,
      consultor_nome: body?.consultor_nome || "",
      filial_nome: body?.filial_nome || "",
      endereco_linha1: body?.endereco_linha1 || "",
      endereco_linha2: body?.endereco_linha2 || "",
      endereco_linha3: body?.endereco_linha3 || "",
      telefone: body?.telefone || "",
      whatsapp: body?.whatsapp || "",
      whatsapp_codigo_pais: (body?.whatsapp_codigo_pais || "").replace(/\D/g, "") || null,
      email: body?.email || "",
      rodape_texto: body?.rodape_texto || "",
    };

    const { error } = await client
      .from("quote_print_settings")
      .upsert(payload, { onConflict: "owner_user_id" });
    if (error) throw error;

    await kvCache.delete(buildCacheKey(user.id));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro parametros/orcamentos-pdf POST", err);
    return new Response("Erro ao salvar parametros do orcamento.", { status: 500 });
  }
}
