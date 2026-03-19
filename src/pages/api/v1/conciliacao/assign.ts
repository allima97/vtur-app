import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import { buildConciliacaoMetrics } from "../../../../lib/conciliacao/business";
import { fetchConciliacaoRankingOptions } from "./_ranking";

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
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
        3,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    const body = (await request.json().catch(() => null)) as {
      companyId?: string | null;
      conciliacaoId?: string | null;
      rankingVendedorId?: string | null;
      rankingProdutoId?: string | null;
      valorComissaoLoja?: number | null;
    } | null;

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const conciliacaoId = String(body?.conciliacaoId || "").trim();
    if (!isUuid(conciliacaoId)) {
      return new Response("Registro de conciliacao invalido.", { status: 400 });
    }

    const rankingVendedorId = String(body?.rankingVendedorId || "").trim() || null;
    const rankingProdutoId = String(body?.rankingProdutoId || "").trim() || null;
    const hasValorComissaoLoja = body && Object.prototype.hasOwnProperty.call(body, "valorComissaoLoja");
    const valorComissaoLoja =
      hasValorComissaoLoja && body?.valorComissaoLoja != null
        ? Number(body?.valorComissaoLoja)
        : null;

    if (rankingVendedorId && !isUuid(rankingVendedorId)) {
      return new Response("Vendedor invalido.", { status: 400 });
    }
    if (rankingProdutoId && !isUuid(rankingProdutoId)) {
      return new Response("Produto invalido.", { status: 400 });
    }
    if (hasValorComissaoLoja && valorComissaoLoja != null && !Number.isFinite(valorComissaoLoja)) {
      return new Response("Comissão da loja inválida.", { status: 400 });
    }

    const { data: registro, error: registroErr } = await client
      .from("conciliacao_recibos")
      .select(
        "id, company_id, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_comissao_loja, valor_venda_real, venda_id, venda_recibo_id, documento"
      )
      .eq("id", conciliacaoId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (registroErr) throw registroErr;
    if (!registro) return new Response("Registro nao encontrado.", { status: 404 });

    const rankingOptions = await fetchConciliacaoRankingOptions({
      client,
      scope,
      companyId,
    });

    if (rankingVendedorId) {
      if (!rankingOptions.vendedorIdSet.has(rankingVendedorId)) {
        return new Response("Vendedor fora do escopo permitido para esta equipe.", { status: 400 });
      }
    }

    if (rankingProdutoId) {
      if (!rankingOptions.produtoIdSet.has(rankingProdutoId)) {
        return new Response("Produto com meta diferenciada fora do escopo permitido.", { status: 400 });
      }
    }

    const payload = {
      ranking_vendedor_id: rankingVendedorId,
      ranking_produto_id: rankingProdutoId,
      ranking_assigned_at: new Date().toISOString(),
    } as Record<string, any>;

    if (hasValorComissaoLoja) {
      const metrics = buildConciliacaoMetrics({
        descricao: (registro as any)?.descricao,
        valorLancamentos: Number((registro as any)?.valor_lancamentos || 0),
        valorTaxas: Number((registro as any)?.valor_taxas || 0),
        valorDescontos: Number((registro as any)?.valor_descontos || 0),
        valorAbatimentos: Number((registro as any)?.valor_abatimentos || 0),
        valorSaldo: valorComissaoLoja,
      });
      payload.valor_comissao_loja = valorComissaoLoja;
      payload.percentual_comissao_loja = metrics.percentualComissaoLoja;
      payload.faixa_comissao = metrics.faixaComissao;
      payload.is_seguro_viagem = metrics.isSeguroViagem;
    }

    const { data, error } = await client
      .from("conciliacao_recibos")
      .update(payload)
      .eq("id", conciliacaoId)
      .eq("company_id", companyId)
      .select(
        "id, ranking_vendedor_id, ranking_produto_id, ranking_assigned_at, valor_comissao_loja, percentual_comissao_loja, faixa_comissao, is_seguro_viagem, ranking_vendedor:users!ranking_vendedor_id(id, nome_completo), ranking_produto:tipo_produtos!ranking_produto_id(id, nome)"
      )
      .maybeSingle();
    if (error) throw error;

    if (hasValorComissaoLoja && Number((registro as any)?.valor_comissao_loja || 0) !== Number(valorComissaoLoja || 0)) {
      await client.from("conciliacao_recibo_changes").insert({
        company_id: companyId,
        conciliacao_recibo_id: conciliacaoId,
        venda_id: (registro as any)?.venda_id || null,
        venda_recibo_id: (registro as any)?.venda_recibo_id || null,
        numero_recibo: (registro as any)?.documento || null,
        field: "valor_comissao_loja",
        old_value: Number((registro as any)?.valor_comissao_loja || 0),
        new_value: Number(valorComissaoLoja || 0),
        actor: "user",
        changed_by: user.id,
      } as any);
    }

    return new Response(JSON.stringify({ ok: true, item: data || null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/assign", err);
    return new Response(err?.message || "Erro ao atribuir recibo ao ranking.", { status: 500 });
  }
};
