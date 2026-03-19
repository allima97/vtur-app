import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import type { ConciliacaoLinhaInput } from "./_types";
import { findReciboByNumero, reconcilePendentes } from "./_reconcile";
import { buildConciliacaoMetrics, normalizeConciliacaoStatus } from "../../../../lib/conciliacao/business";
import { fetchConciliacaoRankingOptions } from "./_ranking";

function isOperacionalStatus(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  return status === "BAIXA" || status === "OPFAX";
}

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
        2,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    const body = (await request.json()) as {
      companyId?: string | null;
      origem?: string | null;
      movimentoData?: string | null; // ISO
      linhas?: ConciliacaoLinhaInput[] | null;
    };

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const origem = String(body?.origem || "").trim() || null;
    const movimentoData = String(body?.movimentoData || "").trim() || null;

    const linhas = Array.isArray(body?.linhas) ? body.linhas : [];
    const rankingOptions = await fetchConciliacaoRankingOptions({
      client,
      scope,
      companyId,
    });

    const payloadBase = linhas
      .map((l) => {
        const documento = String(l?.documento || "").trim();
        const descricao = l?.descricao ?? null;
        const metrics = buildConciliacaoMetrics({
          descricao,
          valorLancamentos: l?.valor_lancamentos ?? null,
          valorTaxas: l?.valor_taxas ?? null,
          valorDescontos: l?.valor_descontos ?? null,
          valorAbatimentos: l?.valor_abatimentos ?? null,
          valorSaldo: l?.valor_saldo ?? null,
          valorOpfax: l?.valor_opfax ?? null,
        });

        return {
          company_id: companyId,
          documento,
          movimento_data: l?.movimento_data || movimentoData,
          status: normalizeConciliacaoStatus(l?.status || descricao || null),
          descricao,
          descricao_chave: l?.descricao_chave || metrics.descricaoChave,
          valor_lancamentos: l?.valor_lancamentos ?? null,
          valor_taxas: l?.valor_taxas ?? null,
          valor_descontos: l?.valor_descontos ?? null,
          valor_abatimentos: l?.valor_abatimentos ?? null,
          valor_calculada_loja: l?.valor_calculada_loja ?? null,
          valor_visao_master: l?.valor_visao_master ?? null,
          valor_opfax: l?.valor_opfax ?? null,
          valor_saldo: l?.valor_saldo ?? null,
          valor_venda_real: l?.valor_venda_real ?? metrics.valorVendaReal,
          valor_comissao_loja: l?.valor_comissao_loja ?? metrics.valorComissaoLoja,
          percentual_comissao_loja:
            l?.percentual_comissao_loja ?? metrics.percentualComissaoLoja,
          faixa_comissao: l?.faixa_comissao ?? metrics.faixaComissao,
          is_seguro_viagem: Boolean(l?.is_seguro_viagem ?? metrics.isSeguroViagem),
          ranking_vendedor_id: l?.ranking_vendedor_id ?? null,
          ranking_produto_id: l?.ranking_produto_id ?? null,
          origem: l?.origem ?? origem,
          raw: l?.raw ?? null,
          imported_by: user.id,
        };
      })
      .filter((row) => row.documento && row.movimento_data && isOperacionalStatus(row.status));

    const payload = await Promise.all(
      payloadBase.map(async (row) => {
        if (String(row.ranking_vendedor_id || "").trim()) return row;

        const found = await findReciboByNumero({
          numero: row.documento,
          companyId,
          valorLancamento: row.valor_lancamentos,
          valorTaxas: row.valor_taxas,
          client,
        });

        const vendedorId = String(found?.recibo?.vendedor_id || "").trim();
        if (!vendedorId) return row;

        return {
          ...row,
          ranking_vendedor_id: vendedorId,
        };
      })
    );

    const missingAssigneeDocs = payload
      .filter((row) => !String(row.ranking_vendedor_id || "").trim())
      .map((row) => row.documento)
      .slice(0, 10);
    if (missingAssigneeDocs.length > 0) {
      return new Response(
        `Atribua o vendedor/gestor de cada recibo antes da importação. Exemplos pendentes: ${missingAssigneeDocs.join(", ")}.`,
        { status: 400 }
      );
    }

    const invalidAssignee = payload.find(
      (row) =>
        row.ranking_vendedor_id &&
        !rankingOptions.vendedorIdSet.has(String(row.ranking_vendedor_id).trim())
    );
    if (invalidAssignee) {
      return new Response(
        `O vendedor informado no recibo ${invalidAssignee.documento} não pertence ao escopo permitido da equipe.`,
        { status: 400 }
      );
    }

    const invalidProduto = payload.find(
      (row) =>
        row.ranking_produto_id &&
        !rankingOptions.produtoIdSet.has(String(row.ranking_produto_id).trim())
    );
    if (invalidProduto) {
      return new Response(
        `O produto com meta diferenciada informado no recibo ${invalidProduto.documento} não está disponível para esta equipe.`,
        { status: 400 }
      );
    }

    if (payload.length === 0) {
      return new Response(JSON.stringify({ imported: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error: upErr } = await client
      .from("conciliacao_recibos")
      .upsert(payload as any, { onConflict: "company_id,movimento_data,documento,descricao_chave" });
    if (upErr) throw upErr;

    // Tentativa imediata: conciliar pendentes (inclui as recém importadas)
    const result = await reconcilePendentes({
      companyId,
      limit: 200,
      actor: "user",
      actorUserId: user.id,
      client,
    });

    return new Response(
      JSON.stringify({
        imported: payload.length,
        ...result,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Erro conciliacao/import", err);
    return new Response(err?.message || "Erro ao importar conciliacao.", { status: 500 });
  }
};
