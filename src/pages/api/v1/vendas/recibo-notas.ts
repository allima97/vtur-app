import {
  applyScopeToQuery,
  buildAuthClient,
  getUserScope,
  isUuid,
  requireModuloLevel,
} from "./_utils";

export async function GET({ request }: { request: Request }) {
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
        ["vendas_consulta", "vendas"],
        1,
        "Sem acesso a Vendas."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const vendaId = String(url.searchParams.get("venda_id") || "").trim();
    if (!isUuid(vendaId)) return new Response("venda_id invalido.", { status: 400 });

    let query = client
      .from("vendas_recibos_notas")
      .select("recibo_id, notas")
      .eq("venda_id", vendaId);
    query = applyScopeToQuery(query, scope, scope.companyId);

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ items: data || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro vendas/recibo-notas", err);
    return new Response("Erro ao carregar notas de recibo.", { status: 500 });
  }
}
