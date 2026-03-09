import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await requireModuloLevel(
      client,
      user.id,
      ["orcamentos", "vendas"],
      3,
      "Sem acesso para editar Orcamentos."
    );
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const id = String(body?.id || "").trim();
    if (!id) return new Response("ID invalido.", { status: 400 });

    const payload = {
      last_interaction_at: body?.last_interaction_at ?? null,
      last_interaction_notes: body?.last_interaction_notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from("quote").update(payload).eq("id", id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, payload }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro orcamentos/interaction", err);
    return new Response("Erro ao salvar interacao.", { status: 500 });
  }
}
