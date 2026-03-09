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
    const status = String(body?.status || "").trim();
    if (!id || !status) return new Response("Parametros invalidos.", { status: 400 });

    const { error } = await client
      .from("quote")
      .update({ status_negociacao: status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro orcamentos/status", err);
    return new Response("Erro ao atualizar status do orcamento.", { status: 500 });
  }
}
