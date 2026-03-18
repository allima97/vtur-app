import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import type { ConciliacaoLinhaInput } from "./_types";
import { reconcilePendentes } from "./_reconcile";
import { buildConciliacaoMetrics, normalizeConciliacaoStatus } from "../../../../lib/conciliacao/business";

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

    const payload = linhas
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
      .filter((row) => row.documento && row.movimento_data);

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
