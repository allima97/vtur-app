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
        4,
        "Sem permissão para excluir documentos."
      );
      if (denied) return denied;
    }

    const body = safeJsonParse(await request.text()) as any;
    const id = String(body?.id || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const { data: doc, error: fetchErr } = await client
      .from("documentos_viagens")
      .select("id, storage_bucket, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!doc) return new Response("Documento não encontrado.", { status: 404 });

    const bucket = String((doc as any)?.storage_bucket || "viagens-documentos");
    const path = String((doc as any)?.storage_path || "");

    if (path) {
      const { error: storageErr } = await client.storage.from(bucket).remove([path]);
      if (storageErr) {
        console.error("Erro ao remover storage object", storageErr);
      }
    }

    const { error: delErr } = await client.from("documentos_viagens").delete().eq("id", id);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro documentos-viagens/delete", err);
    return new Response("Erro ao excluir documento.", { status: 500 });
  }
}
