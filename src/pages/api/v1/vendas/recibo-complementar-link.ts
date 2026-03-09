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
        3,
        "Sem permissao para editar vendas."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const requestedCompanyId = String(body?.company_id || "").trim();
    const companyId = resolveCompanyId(scope, requestedCompanyId);

    // Formato batch: { primary_venda_id, links: [{venda_id, recibo_id}], company_id }
    if (Array.isArray(body?.links)) {
      const primaryVendaId = String(body?.primary_venda_id || "").trim();
      if (!isUuid(primaryVendaId)) {
        return new Response("primary_venda_id invalido.", { status: 400 });
      }

      const links = (body.links as any[])
        .filter((l) => l && isUuid(String(l.venda_id || "")) && isUuid(String(l.recibo_id || "")))
        .map((l) => ({ venda_id: String(l.venda_id), recibo_id: String(l.recibo_id) }));

      if (links.length === 0) {
        return new Response("Sem links validos.", { status: 400 });
      }

      // Valida acesso à venda primária
      let vendaQuery = client
        .from("vendas")
        .select("id, company_id")
        .eq("id", primaryVendaId)
        .maybeSingle();
      vendaQuery = applyScopeToQuery(vendaQuery, scope, companyId);
      const { data: venda, error: vendaErr } = await vendaQuery;
      if (vendaErr) throw vendaErr;
      if (!venda) return new Response("Venda nao encontrada.", { status: 404 });

      const { error: batchError } = await client
        .from("vendas_recibos_complementares")
        .upsert(links, { onConflict: "venda_id,recibo_id", ignoreDuplicates: true });
      if (batchError) throw batchError;

      return new Response(JSON.stringify({ ok: true, total: links.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Formato legado: { venda_id, recibo_id, venda_cruzada_id, recibo_cruzado_id, ... }
    const vendaId = String(body?.venda_id || "").trim();
    const reciboId = String(body?.recibo_id || "").trim();
    const vendaCruzadaId = String(body?.venda_cruzada_id || "").trim();
    const reciboCruzadoId = String(body?.recibo_cruzado_id || "").trim();
    const cruzadoJaVinculado = Boolean(body?.cruzado_ja_vinculado);

    if (!isUuid(vendaId) || !isUuid(reciboId)) {
      return new Response("venda_id ou recibo_id invalido.", { status: 400 });
    }
    if (vendaCruzadaId && !isUuid(vendaCruzadaId)) {
      return new Response("venda_cruzada_id invalido.", { status: 400 });
    }
    if (reciboCruzadoId && !isUuid(reciboCruzadoId)) {
      return new Response("recibo_cruzado_id invalido.", { status: 400 });
    }

    let vendaQuery = client
      .from("vendas")
      .select("id, vendedor_id, company_id")
      .eq("id", vendaId)
      .maybeSingle();
    vendaQuery = applyScopeToQuery(vendaQuery, scope, companyId);
    const { data: venda, error: vendaErr } = await vendaQuery;
    if (vendaErr) throw vendaErr;
    if (!venda) return new Response("Venda nao encontrada.", { status: 404 });

    if (vendaCruzadaId) {
      let vendaCruzadaQuery = client
        .from("vendas")
        .select("id")
        .eq("id", vendaCruzadaId)
        .maybeSingle();
      vendaCruzadaQuery = applyScopeToQuery(vendaCruzadaQuery, scope, companyId);
      const { data: vendaCruzada, error: vendaCruzadaErr } = await vendaCruzadaQuery;
      if (vendaCruzadaErr) throw vendaCruzadaErr;
      if (!vendaCruzada) return new Response("Venda cruzada nao encontrada.", { status: 404 });
    }

    const vinculoPrimario = { venda_id: vendaId, recibo_id: reciboId };
    const { error: primarioError } = await client
      .from("vendas_recibos_complementares")
      .upsert(vinculoPrimario, { onConflict: "venda_id,recibo_id", ignoreDuplicates: true });
    if (primarioError) throw primarioError;

    if (!cruzadoJaVinculado && vendaCruzadaId && reciboCruzadoId) {
      const vinculoCruzado = { venda_id: vendaCruzadaId, recibo_id: reciboCruzadoId };
      const { error: cruzadoError } = await client
        .from("vendas_recibos_complementares")
        .upsert(vinculoCruzado, { onConflict: "venda_id,recibo_id", ignoreDuplicates: true });
      if (cruzadoError) {
        await client.from("vendas_recibos_complementares").delete().match(vinculoPrimario);
        throw cruzadoError;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro vendas/recibo-complementar-link", err);
    return new Response("Erro ao vincular recibo complementar.", { status: 500 });
  }
}
