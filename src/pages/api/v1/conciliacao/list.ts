import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import { buildConciliacaoMetrics } from "../../../../lib/conciliacao/business";

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toUpperCase() || "OUTRO";
}

function rankDuplicateRow(row: any) {
  const metrics = buildConciliacaoMetrics({
    descricao: row?.descricao,
    valorLancamentos: row?.valor_lancamentos,
    valorTaxas: row?.valor_taxas,
    valorDescontos: row?.valor_descontos,
    valorAbatimentos: row?.valor_abatimentos,
    valorSaldo: row?.valor_saldo,
    valorOpfax: row?.valor_opfax,
    valorCalculadaLoja: row?.valor_calculada_loja,
    valorVisaoMaster: row?.valor_visao_master,
    valorComissaoLoja: row?.valor_comissao_loja,
    percentualComissaoLoja: row?.percentual_comissao_loja,
  });
  const percentual = Number(metrics.percentualComissaoLoja ?? 0);
  const comissao = Number(metrics.valorComissaoLoja ?? 0);
  const updatedAt = Date.parse(String(row?.updated_at || row?.created_at || ""));

  let score = 0;
  if (Number.isFinite(percentual) && percentual > 0) score += 4;
  if (Number.isFinite(comissao) && Math.abs(comissao) > 0.009) score += 3;
  if (row?.conciliado) score += 2;
  if (row?.venda_id || row?.venda_recibo_id) score += 1;

  return {
    score,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function dedupeConciliacaoRows(rows: any[]) {
  const grouped = new Map<string, any[]>();

  for (const row of rows) {
    const key = [
      String(row?.company_id || "").trim(),
      String(row?.movimento_data || "").trim(),
      String(row?.documento || "").trim(),
      normalizeStatus(row?.status),
    ].join("::");
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.values()).map((bucket) => {
    if (bucket.length === 1) return bucket[0];

    return [...bucket].sort((left, right) => {
      const leftRank = rankDuplicateRow(left);
      const rightRank = rankDuplicateRow(right);
      if (rightRank.score !== leftRank.score) return rightRank.score - leftRank.score;
      return rightRank.updatedAt - leftRank.updatedAt;
    })[0];
  });
}

function normalizeComputedFields(row: any) {
  const metrics = buildConciliacaoMetrics({
    descricao: row?.descricao,
    valorLancamentos: row?.valor_lancamentos,
    valorTaxas: row?.valor_taxas,
    valorDescontos: row?.valor_descontos,
    valorAbatimentos: row?.valor_abatimentos,
    valorSaldo: row?.valor_saldo,
    valorOpfax: row?.valor_opfax,
    valorCalculadaLoja: row?.valor_calculada_loja,
    valorVisaoMaster: row?.valor_visao_master,
    valorComissaoLoja: row?.valor_comissao_loja,
    percentualComissaoLoja: row?.percentual_comissao_loja,
  });

  const percentualAtual = Number(row?.percentual_comissao_loja ?? 0);
  const comissaoAtual = Number(row?.valor_comissao_loja ?? 0);
  const precisaRecalcular =
    (
      Math.abs(Number(row?.valor_saldo ?? 0)) > 0.009 ||
      Math.abs(Number(row?.valor_calculada_loja ?? 0)) > 0.009 ||
      Math.abs(Number(row?.valor_visao_master ?? 0)) > 0.009
    ) &&
    (
      !Number.isFinite(percentualAtual) ||
      percentualAtual <= 0 ||
      !Number.isFinite(comissaoAtual) ||
      Math.abs(comissaoAtual) <= 0.009
    );

  if (!precisaRecalcular) return row;

  return {
    ...row,
    valor_venda_real: metrics.valorVendaReal,
    valor_comissao_loja: metrics.valorComissaoLoja,
    percentual_comissao_loja: metrics.percentualComissaoLoja,
    faixa_comissao: metrics.faixaComissao,
    is_seguro_viagem: metrics.isSeguroViagem,
  };
}

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
    const month = String(url.searchParams.get("month") || "").trim();
    const day = String(url.searchParams.get("day") || "").trim();
    const rankingStatus = String(url.searchParams.get("ranking_status") || "all").trim();

    let query = client
      .from("conciliacao_recibos")
      .select(
        "id, company_id, documento, movimento_data, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_calculada_loja, valor_visao_master, valor_opfax, valor_saldo, valor_venda_real, valor_comissao_loja, percentual_comissao_loja, faixa_comissao, is_seguro_viagem, origem, conciliado, match_total, match_taxas, sistema_valor_total, sistema_valor_taxas, diff_total, diff_taxas, venda_id, venda_recibo_id, ranking_vendedor_id, ranking_produto_id, ranking_assigned_at, ranking_vendedor:users!ranking_vendedor_id(id, nome_completo), ranking_produto:tipo_produtos!ranking_produto_id(id, nome), last_checked_at, conciliado_em, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .order("movimento_data", { ascending: false })
      .order("documento", { ascending: true })
      .limit(500);

    if (somentePendentes) query = query.eq("conciliado", false);
    if (/^\d{4}-\d{2}$/.test(month)) {
      const [year, monthNum] = month.split("-").map(Number);
      const inicio = `${month}-01`;
      const fim = new Date(year, monthNum, 0).toISOString().slice(0, 10);
      query = query.gte("movimento_data", inicio).lte("movimento_data", fim);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      query = query.eq("movimento_data", day);
    }

    const { data, error } = await query;
    if (error) throw error;

    let rows = dedupeConciliacaoRows(Array.isArray(data) ? data : []).map(normalizeComputedFields);
    if (rankingStatus === "pending") {
      rows = rows.filter((row: any) => {
        const status = String(row?.status || "").toUpperCase();
        const vendaId = String(row?.venda_id || "").trim();
        const rankingVendedorId = String(row?.ranking_vendedor_id || "").trim();
        return (status === "BAIXA" || status === "OPFAX") && !vendaId && !rankingVendedorId;
      });
    } else if (rankingStatus === "assigned") {
      rows = rows.filter((row: any) => {
        const vendaId = String(row?.venda_id || "").trim();
        const rankingVendedorId = String(row?.ranking_vendedor_id || "").trim();
        return !vendaId && Boolean(rankingVendedorId);
      });
    } else if (rankingStatus === "system") {
      rows = rows.filter((row: any) => Boolean(String(row?.venda_id || "").trim()));
    }

    return new Response(JSON.stringify(rows), {
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
