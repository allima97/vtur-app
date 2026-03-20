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
import {
  resolveConciliacaoBandRule,
  sanitizeConciliacaoBandRules,
  type ParametrosComissao,
} from "../../../../lib/comissaoUtils";
import { fetchConciliacaoRankingOptions } from "./_ranking";

function isOperacionalStatus(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  return status === "BAIXA" || status === "OPFAX" || status === "ESTORNO";
}

function requiresRankingAssignment(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  return status === "BAIXA";
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

function formatDateBR(value?: string | null) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [ano, mes, dia] = raw.split("-");
  return `${dia}/${mes}/${ano}`;
}

function toMonthKey(value?: string | null) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0, 7) : "";
}

async function syncReciboCancelamentoConciliacao(params: {
  client: any;
  companyId: string;
  documentos: string[];
}) {
  const { client, companyId, documentos } = params;
  if (!documentos.length) return;

  const { data: rows, error: rowsErr } = await client
    .from("conciliacao_recibos")
    .select("documento, movimento_data, status, venda_id, venda_recibo_id")
    .eq("company_id", companyId)
    .in("documento", documentos);
  if (rowsErr) throw rowsErr;

  const grouped = new Map<string, any[]>();
  for (const row of rows || []) {
    const documento = String((row as any)?.documento || "").trim();
    if (!documento) continue;
    const bucket = grouped.get(documento) || [];
    bucket.push(row);
    grouped.set(documento, bucket);
  }

  const reciboIds = Array.from(
    new Set(
      (rows || [])
        .map((row: any) => String(row?.venda_recibo_id || "").trim())
        .filter(Boolean)
    )
  );
  if (reciboIds.length === 0) return;

  const { data: recibosData, error: recibosErr } = await client
    .from("vendas_recibos")
    .select("id, venda_id, data_venda")
    .in("id", reciboIds);
  if (recibosErr) throw recibosErr;

  const reciboMap = new Map<string, { venda_id: string | null; data_venda: string | null }>();
  for (const recibo of recibosData || []) {
    const reciboId = String((recibo as any)?.id || "").trim();
    if (!reciboId) continue;
    reciboMap.set(reciboId, {
      venda_id: String((recibo as any)?.venda_id || "").trim() || null,
      data_venda: String((recibo as any)?.data_venda || "").trim() || null,
    });
  }

  const affectedByRecibo = new Map<
    string,
    { vendaId: string | null; canceladoEm: string | null; observacao: string | null }
  >();

  for (const bucket of grouped.values()) {
    const linkedReciboId =
      bucket.map((row: any) => String(row?.venda_recibo_id || "").trim()).find(Boolean) || null;
    if (!linkedReciboId) continue;

    const recibo = reciboMap.get(linkedReciboId);
    const originalDate = recibo?.data_venda || null;
    const estornoDates = bucket
      .filter((row: any) => String(row?.status || "").trim().toUpperCase() === "ESTORNO")
      .map((row: any) => String(row?.movimento_data || "").trim())
      .filter(Boolean)
      .sort();

    if (estornoDates.length === 0) {
      affectedByRecibo.set(linkedReciboId, {
        vendaId: recibo?.venda_id || null,
        canceladoEm: null,
        observacao: null,
      });
      continue;
    }

    const canceladoEm = estornoDates[0];
    const mesmoMes = toMonthKey(canceladoEm) === toMonthKey(originalDate);
    const observacao = mesmoMes
      ? `Cancelado pela conciliação em ${formatDateBR(canceladoEm)} na mesma competência do recibo original.`
      : `Cancelado pela conciliação em ${formatDateBR(canceladoEm)} após o fechamento da competência original.`;

    affectedByRecibo.set(linkedReciboId, {
      vendaId: recibo?.venda_id || null,
      canceladoEm,
      observacao,
    });
  }

  const existingNotesMap = new Map<string, any>();
  const vendaReciboPairs = Array.from(affectedByRecibo.entries())
    .map(([reciboId, meta]) => ({
      reciboId,
      vendaId: meta.vendaId,
    }))
    .filter((item) => item.vendaId);

  if (vendaReciboPairs.length > 0) {
    const vendaIds = Array.from(new Set(vendaReciboPairs.map((item) => item.vendaId as string)));
    const { data: notesData, error: notesErr } = await client
      .from("vendas_recibos_notas")
      .select("venda_id, recibo_id, notas")
      .in("venda_id", vendaIds);
    if (notesErr) throw notesErr;
    for (const item of notesData || []) {
      const key = `${String((item as any)?.venda_id || "").trim()}::${String((item as any)?.recibo_id || "").trim()}`;
      existingNotesMap.set(key, (item as any)?.notas && typeof (item as any).notas === "object" ? (item as any).notas : {});
    }
  }

  for (const [reciboId, meta] of affectedByRecibo.entries()) {
    const { error: updateReciboErr } = await client
      .from("vendas_recibos")
      .update({
        cancelado_por_conciliacao_em: meta.canceladoEm,
        cancelado_por_conciliacao_observacao: meta.observacao,
      })
      .eq("id", reciboId);
    if (updateReciboErr) throw updateReciboErr;

    if (!meta.vendaId) continue;

    const noteKey = `${meta.vendaId}::${reciboId}`;
    const existingNotes = existingNotesMap.get(noteKey) || {};
    const nextNotes = { ...existingNotes };

    if (meta.canceladoEm) {
      nextNotes.conciliacao_cancelamento = {
        origem: "conciliacao",
        cancelado_em: meta.canceladoEm,
        observacao: meta.observacao,
      };
    } else {
      delete nextNotes.conciliacao_cancelamento;
    }

    if (Object.keys(nextNotes).length === 0) {
      const { error: deleteNoteErr } = await client
        .from("vendas_recibos_notas")
        .delete()
        .eq("venda_id", meta.vendaId)
        .eq("recibo_id", reciboId);
      if (deleteNoteErr) throw deleteNoteErr;
      continue;
    }

    const { error: upsertNoteErr } = await client.from("vendas_recibos_notas").upsert(
      {
        venda_id: meta.vendaId,
        recibo_id: reciboId,
        company_id: companyId,
        notas: nextNotes,
      },
      { onConflict: "venda_id,recibo_id" }
    );
    if (upsertNoteErr) throw upsertNoteErr;
  }
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
    const { data: paramsData } = await client
      .from("parametros_comissao")
      .select(
        "usar_taxas_na_meta, foco_valor, foco_faturamento, conciliacao_sobrepoe_vendas, conciliacao_regra_ativa, conciliacao_tipo, conciliacao_meta_nao_atingida, conciliacao_meta_atingida, conciliacao_super_meta, conciliacao_tiers, conciliacao_faixas_loja"
      )
      .eq("company_id", companyId)
      .maybeSingle();
    const parametrosConciliacao: ParametrosComissao | null = paramsData
      ? {
          usar_taxas_na_meta: Boolean((paramsData as any).usar_taxas_na_meta),
          foco_valor: (paramsData as any).foco_valor === "liquido" ? "liquido" : "bruto",
          foco_faturamento:
            (paramsData as any).foco_faturamento === "liquido" ? "liquido" : "bruto",
          conciliacao_sobrepoe_vendas: Boolean((paramsData as any).conciliacao_sobrepoe_vendas),
          conciliacao_regra_ativa: Boolean((paramsData as any).conciliacao_regra_ativa),
          conciliacao_tipo:
            (paramsData as any).conciliacao_tipo === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL",
          conciliacao_meta_nao_atingida:
            (paramsData as any).conciliacao_meta_nao_atingida != null
              ? Number((paramsData as any).conciliacao_meta_nao_atingida)
              : null,
          conciliacao_meta_atingida:
            (paramsData as any).conciliacao_meta_atingida != null
              ? Number((paramsData as any).conciliacao_meta_atingida)
              : null,
          conciliacao_super_meta:
            (paramsData as any).conciliacao_super_meta != null
              ? Number((paramsData as any).conciliacao_super_meta)
              : null,
          conciliacao_tiers: Array.isArray((paramsData as any).conciliacao_tiers)
            ? (paramsData as any).conciliacao_tiers
            : [],
          conciliacao_faixas_loja: sanitizeConciliacaoBandRules(
            (paramsData as any).conciliacao_faixas_loja,
            {
              usar_taxas_na_meta: Boolean((paramsData as any).usar_taxas_na_meta),
              conciliacao_regra_ativa: Boolean((paramsData as any).conciliacao_regra_ativa),
              conciliacao_tipo:
                (paramsData as any).conciliacao_tipo === "ESCALONAVEL"
                  ? "ESCALONAVEL"
                  : "GERAL",
              conciliacao_meta_nao_atingida:
                (paramsData as any).conciliacao_meta_nao_atingida != null
                  ? Number((paramsData as any).conciliacao_meta_nao_atingida)
                  : null,
              conciliacao_meta_atingida:
                (paramsData as any).conciliacao_meta_atingida != null
                  ? Number((paramsData as any).conciliacao_meta_atingida)
                  : null,
              conciliacao_super_meta:
                (paramsData as any).conciliacao_super_meta != null
                  ? Number((paramsData as any).conciliacao_super_meta)
                  : null,
              conciliacao_tiers: Array.isArray((paramsData as any).conciliacao_tiers)
                ? (paramsData as any).conciliacao_tiers
                : [],
            }
          ),
        }
      : null;

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
        const matchedBand = resolveConciliacaoBandRule(parametrosConciliacao, {
          faixa_comissao: typeof l?.faixa_comissao === "string" ? l.faixa_comissao : null,
          percentual_comissao_loja: metrics.percentualComissaoLoja,
          is_seguro_viagem: metrics.isSeguroViagem,
        });
        const faixaComissao = matchedBand?.faixa_loja || metrics.faixaComissao;
        const isSeguroViagem =
          matchedBand?.tipo_calculo === "PRODUTO_DIFERENCIADO"
            ? true
            : Boolean(metrics.isSeguroViagem);

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
          faixa_comissao: faixaComissao,
          is_seguro_viagem: isSeguroViagem,
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
          venda_id: found?.recibo?.venda_id || null,
          venda_recibo_id: found?.recibo?.id || null,
        };
      })
    );

    const missingAssigneeDocs = payload
      .filter(
        (row) =>
          requiresRankingAssignment(row.status) &&
          !String(row.ranking_vendedor_id || "").trim()
      )
      .map((row) => row.documento)
      .slice(0, 10);
    if (missingAssigneeDocs.length > 0) {
      return new Response(
        `Atribua o vendedor/gestor de cada recibo em BAIXA antes da importação. Exemplos pendentes: ${missingAssigneeDocs.join(", ")}.`,
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

    await syncReciboCancelamentoConciliacao({
      client,
      companyId,
      documentos,
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
