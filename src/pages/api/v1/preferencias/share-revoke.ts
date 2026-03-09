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
        1,
        "Sem acesso a Minhas Preferências."
      );
      if (denied) return denied;
    }

    const body = safeJsonParse(await request.text()) as any;
    const shareId = String(body?.share_id || "").trim();
    if (!isUuid(shareId)) return new Response("share_id invalido.", { status: 400 });

    const { data, error } = await client
      .from("minhas_preferencias_shares")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", shareId)
      .or(`shared_by.eq.${user.id},shared_with.eq.${user.id}`)
      .select("id, status, revoked_at")
      .maybeSingle();
    if (error) throw error;

    if (!data) return new Response("Compartilhamento não encontrado.", { status: 404 });

    return new Response(JSON.stringify({ ok: true, share: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro preferencias/share-revoke", err);
    return new Response("Erro ao revogar compartilhamento.", { status: 500 });
  }
}
