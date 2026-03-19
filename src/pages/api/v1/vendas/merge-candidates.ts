import {
  applyScopeToQuery,
  buildAuthClient,
  fetchGestorEquipeIdsComGestor,
  getUserScope,
  isUuid,
  requireModuloLevel,
  resolveCompanyId,
} from "./_utils";

function parseIds(raw?: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => isUuid(id))
    .slice(0, 300);
}

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
        "Sem permissao para ver vendas."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const vendaId = String(url.searchParams.get("venda_id") || "").trim();
    const requestedCompanyId = String(url.searchParams.get("company_id") || "").trim();
    const vendorIdsParam = parseIds(url.searchParams.get("vendedor_ids"));

    if (!isUuid(vendaId)) return new Response("venda_id invalido.", { status: 400 });

    const companyId = resolveCompanyId(scope, requestedCompanyId);

    let vendaQuery = client
      .from("vendas")
      .select("id, cliente_id, vendedor_id, company_id")
      .eq("id", vendaId)
      .maybeSingle();
    vendaQuery = applyScopeToQuery(vendaQuery, scope, companyId);
    const { data: venda, error: vendaErr } = await vendaQuery;
    if (vendaErr) throw vendaErr;
    if (!venda) return new Response("Venda nao encontrada.", { status: 404 });

    let query = client
      .from("vendas")
      .select(
        "id, vendedor_id, cliente_id, destino_id, destino_cidade_id, company_id, data_lancamento, data_venda, data_embarque, data_final, valor_total, clientes(nome), destinos:produtos!destino_id (nome, cidade_id), destino_cidade:cidades!destino_cidade_id (id, nome), vendedor:users!vendedor_id (nome_completo)"
      )
      .eq("cliente_id", venda.cliente_id)
      .neq("id", venda.id)
      .order("data_venda", { ascending: false });

    query = applyScopeToQuery(query, scope, companyId);

    if (venda.vendedor_id) {
      query = query.eq("vendedor_id", venda.vendedor_id);
    }

    if (!scope.isAdmin && scope.papel === "GESTOR") {
      const ids = await fetchGestorEquipeIdsComGestor(client, scope.userId);
      if (ids.length === 0) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      query = query.in("vendedor_id", ids);
    }

    if (!scope.isAdmin && scope.papel === "MASTER" && vendorIdsParam.length > 0) {
      query = query.in("vendedor_id", vendorIdsParam);
    }

    const { data: vendasData, error } = await query;
    if (error) throw error;

    const vendaIds = (vendasData || []).map((row: any) => String(row?.id || "").trim()).filter(Boolean);

    const recibosPorVenda = new Map<string, string[]>();
    if (vendaIds.length > 0) {
      const { data: recibosData, error: recibosError } = await client
        .from("vendas_recibos")
        .select("venda_id, numero_recibo")
        .in("venda_id", vendaIds)
        .order("numero_recibo", { ascending: true });
      if (recibosError) throw recibosError;

      (recibosData || []).forEach((row: any) => {
        const vendaIdRef = String(row?.venda_id || "").trim();
        const numeroRecibo = String(row?.numero_recibo || "").trim();
        if (!vendaIdRef || !numeroRecibo) return;
        const lista = recibosPorVenda.get(vendaIdRef) || [];
        lista.push(numeroRecibo);
        recibosPorVenda.set(vendaIdRef, lista);
      });
    }

    const mapped = (vendasData || []).map((row: any) => {
      const cidadeId = row.destino_cidade_id || row.destinos?.cidade_id || "";
      const cidadeNome = row.destino_cidade?.nome || "";
      const numerosRecibo = Array.from(new Set(recibosPorVenda.get(row.id) || []));
      return {
        id: row.id,
        vendedor_id: row.vendedor_id,
        vendedor_nome: row.vendedor?.nome_completo || "",
        cliente_id: row.cliente_id,
        destino_id: row.destino_id,
        destino_cidade_id: cidadeId,
        company_id: row.company_id,
        data_lancamento: row.data_lancamento,
        data_venda: row.data_venda,
        data_embarque: row.data_embarque,
        data_final: row.data_final,
        valor_total: row.valor_total,
        cliente_nome: row.clientes?.nome || "",
        destino_nome: row.destinos?.nome || "",
        destino_cidade_nome: cidadeId ? cidadeNome || "" : "",
        numero_recibo_principal: numerosRecibo[0] || null,
        numeros_recibo: numerosRecibo,
      };
    });

    return new Response(JSON.stringify({ items: mapped }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro vendas/merge-candidates", err);
    return new Response("Erro ao carregar vendas para mesclar.", { status: 500 });
  }
}
