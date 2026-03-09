import {
  applyScopeToQuery,
  buildAuthClient,
  getUserScope,
  isUuid,
  requireModuloLevel,
  resolveCompanyId,
} from "./_utils";

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
        ["vendas_consulta", "vendas"],
        4,
        "Sem permissao para cancelar vendas."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const vendaId = String(body?.venda_id || "").trim();
    if (!isUuid(vendaId)) return new Response("venda_id invalido.", { status: 400 });

    const requestedCompanyId = String(body?.company_id || "").trim();
    const companyId = resolveCompanyId(scope, requestedCompanyId);

    let vendaQuery = client
      .from("vendas")
      .select("id, vendedor_id, company_id")
      .eq("id", vendaId)
      .maybeSingle();
    vendaQuery = applyScopeToQuery(vendaQuery, scope, companyId);
    const { data: venda, error: vendaErr } = await vendaQuery;
    if (vendaErr) throw vendaErr;
    if (!venda) return new Response("Venda nao encontrada.", { status: 404 });

    const { error: recibosErr } = await client.from("vendas_recibos").delete().eq("venda_id", vendaId);
    if (recibosErr) throw recibosErr;

    let deleteVenda = client.from("vendas").delete().eq("id", vendaId);
    deleteVenda = applyScopeToQuery(deleteVenda, scope, companyId);
    const { error: deleteErr } = await deleteVenda;
    if (deleteErr) throw deleteErr;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro vendas/cancel", err);
    return new Response("Erro ao cancelar venda.", { status: 500 });
  }
}
