import { buildAuthClient, getUserScope, isUuid, requireModuloLevel } from "../vendas/_utils";

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);

    const body = safeJsonParse(await request.text()) as any;

    const id = String(body?.id || "").trim();
    const isUpdate = Boolean(id);

    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["operacao_preferencias"],
        isUpdate ? 3 : 2,
        isUpdate ? "Sem permissão para editar preferências." : "Sem permissão para criar preferências."
      );
      if (denied) return denied;
    }

    const companyId = scope.companyId;
    if (!companyId) return new Response("Empresa inválida.", { status: 400 });

    const nome = String(body?.nome || "").trim();
    if (!nome) return new Response("nome obrigatorio.", { status: 400 });

    const cidadeId = isUuid(body?.cidade_id) ? String(body?.cidade_id) : null;
    const tipoProdutoId = isUuid(body?.tipo_produto_id) ? String(body?.tipo_produto_id) : null;

    const payload: any = {
      tipo_produto_id: tipoProdutoId,
      cidade_id: cidadeId,
      nome,
      localizacao: String(body?.localizacao || "").trim() || null,
      classificacao: String(body?.classificacao || "").trim() || null,
      observacao: String(body?.observacao || "").trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (!isUpdate) {
      const insertPayload = {
        ...payload,
        company_id: companyId,
        created_by: user.id,
        updated_at: null,
        updated_by: null,
      };

      const { data, error } = await client
        .from("minhas_preferencias")
        .insert(insertPayload)
        .select(
          "id, company_id, created_by, tipo_produto_id, cidade_id, nome, localizacao, classificacao, observacao, created_at, updated_at"
        )
        .single();
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, item: data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const { data, error } = await client
      .from("minhas_preferencias")
      .update(payload)
      .eq("id", id)
      .select(
        "id, company_id, created_by, tipo_produto_id, cidade_id, nome, localizacao, classificacao, observacao, created_at, updated_at"
      )
      .maybeSingle();
    if (error) throw error;

    if (!data) return new Response("Preferência não encontrada.", { status: 404 });

    return new Response(JSON.stringify({ ok: true, item: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro preferencias/save", err);
    return new Response("Erro ao salvar preferência.", { status: 500 });
  }
}
