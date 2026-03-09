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
        3,
        "Sem permissão para compartilhar preferências."
      );
      if (denied) return denied;
    }

    const companyId = scope.companyId;
    if (!companyId) return new Response("Empresa inválida.", { status: 400 });

    const body = safeJsonParse(await request.text()) as any;
    const preferenciaId = String(body?.preferencia_id || "").trim();
    const sharedWith = String(body?.shared_with || "").trim();

    if (!isUuid(preferenciaId)) return new Response("preferencia_id invalido.", { status: 400 });
    if (!isUuid(sharedWith)) return new Response("shared_with invalido.", { status: 400 });

    const payload = {
      company_id: companyId,
      preferencia_id: preferenciaId,
      shared_by: user.id,
      shared_with: sharedWith,
      status: "pending",
      accepted_at: null,
      revoked_at: null,
    };

    const { data, error } = await client
      .from("minhas_preferencias_shares")
      .upsert(payload, { onConflict: "preferencia_id,shared_with" })
      .select("id, preferencia_id, shared_by, shared_with, status, created_at, accepted_at, revoked_at")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, share: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro preferencias/share", err);
    return new Response("Erro ao compartilhar preferência.", { status: 500 });
  }
}
