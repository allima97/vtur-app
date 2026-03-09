import { buildAuthClient, getUserScope, requireModuloLevel, isUuid } from "../vendas/_utils";

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
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["operacao_documentos_viagens"],
        3,
        "Sem permissão para editar documentos."
      );
      if (denied) return denied;
    }

    const body = safeJsonParse(await request.text()) as any;
    const id = String(body?.id || "").trim();
    const displayName = String(body?.display_name || "").trim();

    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });
    if (!displayName) return new Response("display_name obrigatorio.", { status: 400 });

    const { data, error } = await client
      .from("documentos_viagens")
      .update({ display_name: displayName, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq("id", id)
      .select(
        "id, file_name, display_name, storage_bucket, storage_path, mime_type, size_bytes, created_at, updated_at"
      )
      .maybeSingle();
    if (error) throw error;

    if (!data) return new Response("Documento não encontrado.", { status: 404 });

    return new Response(JSON.stringify({ ok: true, doc: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro documentos-viagens/update", err);
    return new Response("Erro ao atualizar documento.", { status: 500 });
  }
}
