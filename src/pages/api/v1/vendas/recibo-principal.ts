import {
  applyScopeToQuery,
  buildAuthClient,
  fetchGestorEquipeIdsComGestor,
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
        3,
        "Sem permissao para editar vendas."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const vendaId = String(body?.venda_id || "").trim();
    const reciboId = String(body?.recibo_id || "").trim();
    const requestedCompanyId = String(body?.company_id || "").trim();

    if (!isUuid(vendaId) || !isUuid(reciboId)) {
      return new Response("venda_id ou recibo_id invalido.", { status: 400 });
    }

    const companyId = resolveCompanyId(scope, requestedCompanyId);

    let vendaQuery = client
      .from("vendas")
      .select("id, vendedor_id, company_id")
      .eq("id", vendaId)
      .maybeSingle();
    vendaQuery = applyScopeToQuery(vendaQuery, scope, companyId);

    if (!scope.isAdmin && scope.papel === "GESTOR") {
      const ids = await fetchGestorEquipeIdsComGestor(client, scope.userId);
      if (ids.length === 0) return new Response("Venda nao encontrada.", { status: 404 });
      vendaQuery = vendaQuery.in("vendedor_id", ids);
    }

    const { data: venda, error: vendaErr } = await vendaQuery;
    if (vendaErr) throw vendaErr;
    if (!venda) return new Response("Venda nao encontrada.", { status: 404 });

    const { data: recibo, error: reciboErr } = await client
      .from("vendas_recibos")
      .select("id, venda_id, produto_resolvido_id")
      .eq("id", reciboId)
      .eq("venda_id", vendaId)
      .maybeSingle();
    if (reciboErr) throw reciboErr;
    if (!recibo) return new Response("Recibo nao encontrado.", { status: 404 });

    const produtoResolvidoId = String((recibo as any)?.produto_resolvido_id || "").trim();
    if (!isUuid(produtoResolvidoId)) {
      return new Response("Recibo sem produto valido para definir como principal.", { status: 400 });
    }

    let updateVenda = client
      .from("vendas")
      .update({ destino_id: produtoResolvidoId })
      .eq("id", vendaId);
    updateVenda = applyScopeToQuery(updateVenda, scope, companyId);

    const { data: updated, error: updateErr } = await updateVenda.select("id, destino_id").maybeSingle();
    if (updateErr) throw updateErr;
    if (!updated?.id) {
      return new Response("Nao foi possivel atualizar o recibo principal.", { status: 403 });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        venda_id: vendaId,
        recibo_id: reciboId,
        destino_id: produtoResolvidoId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Erro vendas/recibo-principal", err);
    return new Response("Erro ao atualizar recibo principal.", { status: 500 });
  }
}
