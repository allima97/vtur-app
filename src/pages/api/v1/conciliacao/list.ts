import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";

export const GET: APIRoute = async ({ request }) => {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin && scope.papel !== "GESTOR" && scope.papel !== "MASTER") {
      return new Response("Sem permissao.", { status: 403 });
    }

    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["Conciliação"],
        1,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const requestedCompanyId = url.searchParams.get("company_id");
    const companyId = resolveCompanyId(scope, requestedCompanyId);
    if (!companyId) return new Response(JSON.stringify([]), { status: 200 });

    const somentePendentes = url.searchParams.get("pending") === "1";

    let query = client
      .from("conciliacao_recibos")
      .select(
        "id, company_id, documento, movimento_data, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_calculada_loja, valor_visao_master, valor_opfax, valor_saldo, origem, conciliado, match_total, match_taxas, sistema_valor_total, sistema_valor_taxas, diff_total, diff_taxas, venda_id, venda_recibo_id, last_checked_at, conciliado_em, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .order("movimento_data", { ascending: false })
      .order("documento", { ascending: true })
      .limit(500);

    if (somentePendentes) query = query.eq("conciliado", false);

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=5",
        Vary: "Cookie",
      },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/list", err);
    return new Response(err?.message || "Erro ao listar conciliacao.", { status: 500 });
  }
};
