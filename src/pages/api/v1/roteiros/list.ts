import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await requireModuloLevel(
      client,
      user.id,
      ["orcamentos", "vendas"],
      1,
      "Sem acesso a Roteiros."
    );
    if (denied) return denied;

    const { data, error } = await client
      .from("roteiro_personalizado")
      .select("id, nome, duracao, inicio_cidade, fim_cidade, created_at, updated_at")
      .eq("created_by", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    return new Response(JSON.stringify({ roteiros: data || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro roteiros/list", err);
    return new Response("Erro ao carregar roteiros.", { status: 500 });
  }
}
