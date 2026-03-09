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
      4,
      "Sem acesso para excluir Orcamentos."
    );
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const id = String(body?.id || "").trim();
    if (!id) return new Response("ID invalido.", { status: 400 });

    const { error } = await client.from("quote").delete().eq("id", id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro orcamentos/delete", err);
    return new Response("Erro ao excluir orcamento.", { status: 500 });
  }
}
