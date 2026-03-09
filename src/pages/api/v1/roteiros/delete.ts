import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

export async function DELETE({ request }: { request: Request }) {
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
      "Sem acesso para excluir Roteiros."
    );
    if (denied) return denied;

    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    if (!id) return new Response("ID invalido.", { status: 400 });

    // Verifica ownership
    const { data: roteiro, error: findErr } = await client
      .from("roteiro_personalizado")
      .select("id")
      .eq("id", id)
      .eq("created_by", user.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!roteiro) return new Response("Roteiro nao encontrado.", { status: 404 });

    const { error } = await client
      .from("roteiro_personalizado")
      .delete()
      .eq("id", id)
      .eq("created_by", user.id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro roteiros/delete", err);
    return new Response("Erro ao excluir roteiro.", { status: 500 });
  }
}
