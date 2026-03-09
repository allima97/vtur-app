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
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["operacao_preferencias"],
        4,
        "Sem permissão para excluir preferências."
      );
      if (denied) return denied;
    }

    const body = safeJsonParse(await request.text()) as any;
    const id = String(body?.id || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const { error } = await client.from("minhas_preferencias").delete().eq("id", id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro preferencias/delete", err);
    return new Response("Erro ao excluir preferência.", { status: 500 });
  }
}
