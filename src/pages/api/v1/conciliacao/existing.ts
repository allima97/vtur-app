import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";

export const POST: APIRoute = async ({ request }) => {
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

    const body = (await request.json()) as {
      companyId?: string | null;
      documentos?: string[] | null;
      movimentoData?: string | null;
    };

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const documentos = Array.isArray(body?.documentos)
      ? body.documentos.map((d) => String(d || "").trim()).filter(Boolean)
      : [];

    if (documentos.length === 0) {
      return new Response(JSON.stringify({ records: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sem filtro de data: busca cross-date para herdar valores financeiros de importações anteriores
    const { data, error } = await client
      .from("conciliacao_recibos")
      .select(
        "id, documento, movimento_data, ranking_vendedor_id, ranking_produto_id, venda_id, venda_recibo_id, conciliado, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_calculada_loja, valor_visao_master, valor_opfax, valor_saldo"
      )
      .eq("company_id", companyId)
      .in("documento", documentos)
      .order("movimento_data", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const records: Record<string, {
      ranking_vendedor_id: string | null;
      ranking_produto_id: string | null;
      venda_id: string | null;
      venda_recibo_id: string | null;
      conciliado: boolean;
      valor_lancamentos: number | null;
      valor_taxas: number | null;
      valor_descontos: number | null;
      valor_abatimentos: number | null;
      valor_calculada_loja: number | null;
      valor_visao_master: number | null;
      valor_opfax: number | null;
      valor_saldo: number | null;
    }> = {};

    for (const row of (data || []) as any[]) {
      const doc = String(row?.documento || "").trim();
      if (!doc) continue;
      const existing = records[doc];

      const rowHasFinancial =
        Math.abs(Number(row?.valor_lancamentos || 0)) > 0.001 ||
        Math.abs(Number(row?.valor_taxas || 0)) > 0.001;

      if (existing) {
        // Já temos um registro: só sobrescreve se o novo tem dados melhores
        if (existing.conciliado && !row?.conciliado) continue;
        const existingHasFinancial =
          Math.abs(Number(existing.valor_lancamentos || 0)) > 0.001 ||
          Math.abs(Number(existing.valor_taxas || 0)) > 0.001;
        if (existingHasFinancial && !rowHasFinancial) continue;
        if (!row?.ranking_vendedor_id && !row?.venda_recibo_id && !rowHasFinancial) continue;
      }

      records[doc] = {
        ranking_vendedor_id: row?.ranking_vendedor_id ?? null,
        ranking_produto_id: row?.ranking_produto_id ?? null,
        venda_id: row?.venda_id ?? null,
        venda_recibo_id: row?.venda_recibo_id ?? null,
        conciliado: Boolean(row?.conciliado),
        valor_lancamentos: row?.valor_lancamentos ?? null,
        valor_taxas: row?.valor_taxas ?? null,
        valor_descontos: row?.valor_descontos ?? null,
        valor_abatimentos: row?.valor_abatimentos ?? null,
        valor_calculada_loja: row?.valor_calculada_loja ?? null,
        valor_visao_master: row?.valor_visao_master ?? null,
        valor_opfax: row?.valor_opfax ?? null,
        valor_saldo: row?.valor_saldo ?? null,
      };
    }

    return new Response(JSON.stringify({ records }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/existing", err);
    return new Response(err?.message || "Erro ao buscar registros existentes.", { status: 500 });
  }
};
