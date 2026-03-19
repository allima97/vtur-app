import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import type { ConciliacaoLinhaInput } from "./_types";
import { findReciboByNumero, reconcilePendentes } from "./_reconcile";
import {
  buildConciliacaoMetrics,
  normalizeConciliacaoStatus,
} from "../../../../lib/conciliacao/business";
import { fetchConciliacaoRankingOptions } from "./_ranking";

function isOperacionalStatus(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  return status === "BAIXA" || status === "OPFAX";
}

function buildImportKey(params: {
  companyId: string;
  movimentoData?: string | null;
  documento?: string | null;
  descricaoChave?: string | null;
}) {
  return [
    String(params.companyId || "").trim(),
    String(params.movimentoData || "").trim(),
    String(params.documento || "").trim(),
    String(params.descricaoChave || "").trim(),
  ].join("::");
}

function buildImportFallbackKey(params: {
  companyId: string;
  movimentoData?: string | null;
  documento?: string | null;
}) {
  return [
    String(params.companyId || "").trim(),
    String(params.movimentoData || "").trim(),
    String(params.documento || "").trim(),
  ].join("::");
}

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function sameMoney(left?: number | null, right?: number | null) {
  const a = Number(left ?? 0);
  const b = Number(right ?? 0);
  return Math.abs(a - b) <= 0.01;
}

function parseImportNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "")
    .trim()
    .replace(/%/g, "");
  if (!raw) return null;

  const hasComma = raw.includes(",");
  const normalized = hasComma ? raw.replace(/\./g, "").replace(/,/g, ".") : raw.replace(/\s+/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

type ExistingImportRow = {
  id: string;
  company_id: string;
  movimento_data: string | null;
  documento: string;
  descricao_chave: string | null;
  status: string | null;
  descricao: string | null;
  valor_lancamentos: number | null;
  valor_taxas: number | null;
  valor_descontos: number | null;
  valor_abatimentos: number | null;
  valor_saldo: number | null;
  conciliado: boolean | null;
  updated_at: string | null;
  created_at: string | null;
};

function scoreExistingCandidate(
  existing: ExistingImportRow,
  incoming: Record<string, any>
) {
  let score = 0;

  if (normalizeStatus(existing.status) === normalizeStatus(incoming.status)) score += 5;
  if (normalizeText(existing.descricao) === normalizeText(incoming.descricao)) score += 4;
  if (sameMoney(existing.valor_lancamentos, incoming.valor_lancamentos)) score += 3;
  if (sameMoney(existing.valor_taxas, incoming.valor_taxas)) score += 2;
  if (sameMoney(existing.valor_descontos, incoming.valor_descontos)) score += 2;
  if (sameMoney(existing.valor_abatimentos, incoming.valor_abatimentos)) score += 2;
  if (sameMoney(existing.valor_saldo, incoming.valor_saldo)) score += 4;
  if (!existing.conciliado) score += 1;

  const updatedAt = Date.parse(String(existing.updated_at || existing.created_at || ""));
  return {
    score,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
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
        const valorLancamentos = parseImportNumber(l?.valor_lancamentos);
        const valorTaxas = parseImportNumber(l?.valor_taxas);
        const valorDescontos = parseImportNumber(l?.valor_descontos);
        const valorAbatimentos = parseImportNumber(l?.valor_abatimentos);
        const valorCalculadaLoja = parseImportNumber(l?.valor_calculada_loja);
        const valorVisaoMaster = parseImportNumber(l?.valor_visao_master);
        const valorOpfax = parseImportNumber(l?.valor_opfax);
        const valorSaldo = parseImportNumber(l?.valor_saldo);
        const valorComissaoImportada = parseImportNumber(l?.valor_comissao_loja);
        const percentualComissaoImportado = parseImportNumber(l?.percentual_comissao_loja);
        const metrics = buildConciliacaoMetrics({
          descricao,
          valorLancamentos,
          valorTaxas,
          valorDescontos,
          valorAbatimentos,
          valorSaldo,
          valorOpfax,
          valorCalculadaLoja,
          valorVisaoMaster,
          valorComissaoLoja: valorComissaoImportada,
          percentualComissaoLoja: percentualComissaoImportado,
        });

        return {
          company_id: companyId,
          documento,
          movimento_data: l?.movimento_data || movimentoData,
          status: normalizeConciliacaoStatus(l?.status || descricao || null),
          descricao,
          descricao_chave: l?.descricao_chave || metrics.descricaoChave,
          valor_lancamentos: valorLancamentos,
          valor_taxas: valorTaxas,
          valor_descontos: valorDescontos,
          valor_abatimentos: valorAbatimentos,
          valor_calculada_loja: valorCalculadaLoja,
          valor_visao_master: valorVisaoMaster,
          valor_opfax: valorOpfax,
          valor_saldo: valorSaldo,
          valor_venda_real: metrics.valorVendaReal,
          valor_comissao_loja: metrics.valorComissaoLoja,
          percentual_comissao_loja: metrics.percentualComissaoLoja,
          faixa_comissao: metrics.faixaComissao,
          is_seguro_viagem: Boolean(metrics.isSeguroViagem),
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

    const documentos = Array.from(new Set(payload.map((row) => String(row.documento || "").trim()).filter(Boolean)));
    const movimentoDatas = Array.from(
      new Set(payload.map((row) => String(row.movimento_data || "").trim()).filter(Boolean))
    );

    let existingRows: ExistingImportRow[] = [];

    if (documentos.length > 0 && movimentoDatas.length > 0) {
      const { data: existingData, error: existingErr } = await client
        .from("conciliacao_recibos")
        .select(
          "id, company_id, movimento_data, documento, descricao_chave, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_saldo, conciliado, updated_at, created_at"
        )
        .eq("company_id", companyId)
        .in("documento", documentos)
        .in("movimento_data", movimentoDatas);
      if (existingErr) throw existingErr;
      existingRows = Array.isArray(existingData) ? (existingData as ExistingImportRow[]) : [];
    }

    const exactMap = new Map<string, ExistingImportRow>();
    const fallbackMap = new Map<string, ExistingImportRow[]>();

    for (const row of existingRows) {
      const exactKey = buildImportKey({
        companyId,
        movimentoData: row.movimento_data,
        documento: row.documento,
        descricaoChave: row.descricao_chave,
      });
      exactMap.set(exactKey, row);

      const fallbackKey = buildImportFallbackKey({
        companyId,
        movimentoData: row.movimento_data,
        documento: row.documento,
      });
      const bucket = fallbackMap.get(fallbackKey) || [];
      bucket.push(row);
      fallbackMap.set(fallbackKey, bucket);
    }

    const usedExistingIds = new Set<string>();
    const rowsToInsert: Array<Record<string, any>> = [];

    for (const row of payload) {
      const exactKey = buildImportKey({
        companyId,
        movimentoData: row.movimento_data,
        documento: row.documento,
        descricaoChave: row.descricao_chave,
      });

      let existing = exactMap.get(exactKey) || null;

      if (!existing) {
        const fallbackKey = buildImportFallbackKey({
          companyId,
          movimentoData: row.movimento_data,
          documento: row.documento,
        });
        const fallbackCandidates = (fallbackMap.get(fallbackKey) || [])
          .filter((candidate) => !usedExistingIds.has(candidate.id))
          .sort((left, right) => {
            const leftRank = scoreExistingCandidate(left, row);
            const rightRank = scoreExistingCandidate(right, row);
            if (rightRank.score !== leftRank.score) return rightRank.score - leftRank.score;
            return rightRank.updatedAt - leftRank.updatedAt;
          });
        if (fallbackCandidates.length > 0) {
          existing = fallbackCandidates[0];
        }
      }

      if (!existing) {
        rowsToInsert.push(row);
        continue;
      }

      usedExistingIds.add(existing.id);

      const updatePayload = {
        ...row,
        conciliado: false,
        match_total: null,
        match_taxas: null,
        sistema_valor_total: null,
        sistema_valor_taxas: null,
        diff_total: null,
        diff_taxas: null,
        venda_id: null,
        venda_recibo_id: null,
        last_checked_at: null,
        conciliado_em: null,
      };

      const { error: updateErr } = await client
        .from("conciliacao_recibos")
        .update(updatePayload)
        .eq("id", existing.id)
        .eq("company_id", companyId);
      if (updateErr) throw updateErr;
    }

    if (rowsToInsert.length > 0) {
      const rowsWithResetState = rowsToInsert.map((row) => ({
        ...row,
        conciliado: false,
        match_total: null,
        match_taxas: null,
        sistema_valor_total: null,
        sistema_valor_taxas: null,
        diff_total: null,
        diff_taxas: null,
        venda_id: null,
        venda_recibo_id: null,
        last_checked_at: null,
        conciliado_em: null,
      }));

      const { error: insertErr } = await client.from("conciliacao_recibos").insert(rowsWithResetState as any);
      if (insertErr) throw insertErr;
    }

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
        updated: usedExistingIds.size,
        inserted: rowsToInsert.length,
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
