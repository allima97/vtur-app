export type EffectiveConciliacaoReceipt = {
  id: string;
  documento: string;
  data_venda: string;
  vendedor_id: string | null;
  produto_id: string | null;
  linked_venda_id: string | null;
  linked_recibo_id: string | null;
  valor_bruto: number | null;
  valor_taxas: number | null;
  valor_meta_override: number | null;
  valor_liquido_override: number | null;
  valor_comissao_loja: number | null;
  percentual_comissao_loja: number | null;
  faixa_comissao: string | null;
  is_seguro_viagem: boolean;
  cancelado_por_conciliacao_em: string | null;
  cancelado_por_conciliacao_observacao: string | null;
  produto: { id: string; nome: string | null } | null;
};

export type ConciliacaoSyntheticVenda = {
  id: string;
  data_venda: string;
  vendedor_id: string | null;
  cancelada: boolean | null;
  valor_nao_comissionado: number | null;
  valor_total_bruto: number | null;
  valor_total_pago: number | null;
  linked_venda_id: string | null;
  linked_recibo_id: string | null;
  vendas_recibos: Array<{
    id: string;
    numero_recibo: string | null;
    data_venda: string | null;
    valor_total: number | null;
    valor_taxas: number | null;
    valor_du: number | null;
    valor_rav: number | null;
    produto_id: string | null;
    tipo_pacote: string | null;
    valor_bruto_override: number | null;
    valor_meta_override: number | null;
    valor_liquido_override: number | null;
    valor_comissao_loja: number | null;
    percentual_comissao_loja: number | null;
    faixa_comissao: string | null;
    cancelado_por_conciliacao_em: string | null;
    cancelado_por_conciliacao_observacao: string | null;
    tipo_produtos: { id: string; nome: string | null } | null;
  }>;
};

function toStr(value: unknown) {
  return String(value || "").trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPositive(value: unknown) {
  return toNumber(value) > 0;
}

function toMonthKey(value?: string | null) {
  const raw = toStr(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0, 7) : "";
}

export function isReciboCanceladoMesmoMes(params: {
  data_venda?: string | null;
  cancelado_por_conciliacao_em?: string | null;
}) {
  const vendaMonth = toMonthKey(params.data_venda);
  const cancelMonth = toMonthKey(params.cancelado_por_conciliacao_em);
  return Boolean(vendaMonth && cancelMonth && vendaMonth === cancelMonth);
}

export function filterRecibosCanceladosMesmoMes<
  T extends {
    data_venda?: string | null;
    cancelado_por_conciliacao_em?: string | null;
  },
>(recibos: T[]) {
  return recibos.filter(
    (recibo) =>
      !isReciboCanceladoMesmoMes({
        data_venda: recibo.data_venda,
        cancelado_por_conciliacao_em: recibo.cancelado_por_conciliacao_em,
      })
  );
}

export async function fetchEffectiveConciliacaoReceipts(params: {
  client: any;
  companyId: string | null;
  inicio: string;
  fim: string;
  vendedorIds?: string[] | null;
}) {
  const { client, companyId, inicio, fim, vendedorIds } = params;
  if (!companyId) return [] as EffectiveConciliacaoReceipt[];

  const pageSize = 1000;
  const relevantDocs = new Set<string>();

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const { data, error } = await client
      .from("conciliacao_recibos")
      .select("documento")
      .eq("company_id", companyId)
      .in("status", ["BAIXA"] as any)
      .gte("movimento_data", inicio)
      .lte("movimento_data", fim)
      .order("movimento_data", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    chunk.forEach((row: any) => {
      const documento = toStr(row?.documento);
      if (documento) relevantDocs.add(documento);
    });

    if (chunk.length < pageSize) break;
  }

  if (relevantDocs.size === 0) return [] as EffectiveConciliacaoReceipt[];

  const concRows: any[] = [];
  const documentos = Array.from(relevantDocs);

  for (let i = 0; i < documentos.length; i += 200) {
    const batch = documentos.slice(i, i + 200);
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const { data, error } = await client
        .from("conciliacao_recibos")
        .select(
          "id, documento, descricao, movimento_data, status, conciliado, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_venda_real, valor_comissao_loja, percentual_comissao_loja, faixa_comissao, is_seguro_viagem, venda_id, venda_recibo_id, ranking_vendedor_id, ranking_produto_id"
        )
        .eq("company_id", companyId)
        .in("documento", batch)
        .order("movimento_data", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      const chunk = Array.isArray(data) ? data : [];
      concRows.push(...chunk);
      if (chunk.length < pageSize) break;
    }
  }

  if (concRows.length === 0) return [] as EffectiveConciliacaoReceipt[];

  const vendaIds = Array.from(
    new Set(concRows.map((row) => toStr(row?.venda_id)).filter(Boolean))
  );
  const reciboIds = Array.from(
    new Set(concRows.map((row) => toStr(row?.venda_recibo_id)).filter(Boolean))
  );

  const vendasMap = new Map<string, { vendedor_id: string | null }>();
  if (vendaIds.length > 0) {
    const { data, error } = await client.from("vendas").select("id, vendedor_id").in("id", vendaIds);
    if (error) throw error;
    (data || []).forEach((row: any) => {
      const id = toStr(row?.id);
      if (!id) return;
      vendasMap.set(id, { vendedor_id: toStr(row?.vendedor_id) || null });
    });
  }

  const recibosMap = new Map<string, { produto_id: string | null }>();
  if (reciboIds.length > 0) {
    const { data, error } = await client
      .from("vendas_recibos")
      .select("id, produto_id, data_venda, cancelado_por_conciliacao_em, cancelado_por_conciliacao_observacao")
      .in("id", reciboIds);
    if (error) throw error;
    (data || []).forEach((row: any) => {
      const id = toStr(row?.id);
      if (!id) return;
      recibosMap.set(id, {
        produto_id: toStr(row?.produto_id) || null,
        data_venda: toStr(row?.data_venda) || null,
        cancelado_por_conciliacao_em: toStr(row?.cancelado_por_conciliacao_em) || null,
        cancelado_por_conciliacao_observacao:
          toStr(row?.cancelado_por_conciliacao_observacao) || null,
      } as any);
    });
  }

  const produtoIds = Array.from(
    new Set(
      concRows
        .map((row) => {
          const reciboId = toStr(row?.venda_recibo_id);
          const linkedProdutoId = reciboId ? recibosMap.get(reciboId)?.produto_id || null : null;
          return linkedProdutoId || (toStr(row?.ranking_produto_id) || null);
        })
        .filter(Boolean)
    )
  );

  let seguroFallbackId: string | null = null;
  const { data: seguroRows, error: seguroErr } = await client
    .from("tipo_produtos")
    .select("id, nome")
    .ilike("nome", "%seguro%")
    .limit(10);
  if (seguroErr) throw seguroErr;
  seguroFallbackId =
    Array.isArray(seguroRows) && seguroRows.length > 0 ? toStr(seguroRows[0]?.id) || null : null;
  if (seguroFallbackId) {
    produtoIds.push(seguroFallbackId);
  }

  const produtosMap = new Map<string, { id: string; nome: string | null }>();
  if (produtoIds.length > 0) {
    const { data, error } = await client.from("tipo_produtos").select("id, nome").in("id", produtoIds);
    if (error) throw error;
    (data || []).forEach((row: any) => {
      const id = toStr(row?.id);
      if (!id) return;
      produtosMap.set(id, { id, nome: row?.nome ? String(row.nome) : null });
    });
  }

  const allowedVendedores =
    vendedorIds && vendedorIds.length > 0 ? new Set(vendedorIds.map((id) => toStr(id)).filter(Boolean)) : null;

  const concRowsByDocumento = new Map<string, any[]>();
  concRows.forEach((row: any) => {
    const documento = toStr(row?.documento);
    if (!documento) return;
    const bucket = concRowsByDocumento.get(documento) || [];
    bucket.push(row);
    concRowsByDocumento.set(documento, bucket);
  });

  return Array.from(concRowsByDocumento.entries())
    .map(([documento, rows]) => {
      const sortedRows = [...rows].sort((a, b) =>
        toStr(a?.movimento_data).localeCompare(toStr(b?.movimento_data))
      );
      const baixaRows = sortedRows.filter((row) => toStr(row?.status).toUpperCase() === "BAIXA");
      const estornoRows = sortedRows.filter((row) => toStr(row?.status).toUpperCase() === "ESTORNO");
      const valuedBaixa = baixaRows.find((row) =>
        isPositive(row?.valor_venda_real) || isPositive(row?.valor_lancamentos)
      );
      const sourceRow = valuedBaixa || baixaRows[0] || null;

      if (!sourceRow) return null;

      const effectiveDate = toStr(sourceRow?.movimento_data);
      if (!effectiveDate || effectiveDate < inicio || effectiveDate > fim) return null;

      const linkedVendaId = sortedRows.map((row) => toStr(row?.venda_id)).find(Boolean) || null;
      const linkedReciboId = sortedRows.map((row) => toStr(row?.venda_recibo_id)).find(Boolean) || null;
      const linkedVendedorId = linkedVendaId ? vendasMap.get(linkedVendaId)?.vendedor_id || null : null;
      const rankingVendedorId =
        sortedRows.map((row) => toStr(row?.ranking_vendedor_id)).find(Boolean) || null;
      const vendedorId = linkedVendedorId || rankingVendedorId || null;

      if (allowedVendedores && (!vendedorId || !allowedVendedores.has(vendedorId))) {
        return null;
      }

      const linkedProdutoId = linkedReciboId ? recibosMap.get(linkedReciboId)?.produto_id || null : null;
      const linkedReciboMeta = linkedReciboId ? (recibosMap.get(linkedReciboId) as any) || null : null;
      const canceladoMesmoMes =
        estornoRows.some((row) => toMonthKey(row?.movimento_data) === toMonthKey(effectiveDate)) ||
        isReciboCanceladoMesmoMes({
          data_venda: linkedReciboMeta?.data_venda || effectiveDate,
          cancelado_por_conciliacao_em: linkedReciboMeta?.cancelado_por_conciliacao_em || null,
        });
      if (canceladoMesmoMes) return null;
      const manualProdutoId = sortedRows.map((row) => toStr(row?.ranking_produto_id)).find(Boolean) || null;
      const isSeguro = sortedRows.some((row) => Boolean(row?.is_seguro_viagem));
      const produtoId = linkedProdutoId || manualProdutoId || (isSeguro ? seguroFallbackId : null);
      const produto = produtoId ? produtosMap.get(produtoId) || null : null;

      const valorMeta = toNumber(sourceRow?.valor_venda_real);
      const valorTaxas = toNumber(sourceRow?.valor_taxas);
      const valorBruto = isPositive(sourceRow?.valor_lancamentos)
        ? toNumber(sourceRow?.valor_lancamentos)
        : valorMeta > 0
        ? valorMeta + valorTaxas
        : 0;

      return {
        id: `conc:${documento}`,
        documento,
        data_venda: effectiveDate,
        vendedor_id: vendedorId,
        produto_id: produtoId,
        linked_venda_id: linkedVendaId,
        linked_recibo_id: linkedReciboId,
        valor_bruto: valorBruto || null,
        valor_taxas: valorTaxas || null,
        valor_meta_override: valorMeta || null,
        valor_liquido_override: valorMeta || null,
        valor_comissao_loja: sourceRow?.valor_comissao_loja ?? null,
        percentual_comissao_loja: sourceRow?.percentual_comissao_loja ?? null,
        faixa_comissao: toStr(sourceRow?.faixa_comissao) || null,
        is_seguro_viagem: isSeguro,
        cancelado_por_conciliacao_em: linkedReciboMeta?.cancelado_por_conciliacao_em || null,
        cancelado_por_conciliacao_observacao:
          linkedReciboMeta?.cancelado_por_conciliacao_observacao || null,
        produto,
      } satisfies EffectiveConciliacaoReceipt;
    })
    .filter((row): row is EffectiveConciliacaoReceipt => Boolean(row));
}

export function buildConciliacaoSyntheticVendas(items: EffectiveConciliacaoReceipt[]) {
  return items.map((item) => ({
    id: item.id,
    data_venda: item.data_venda,
    vendedor_id: item.vendedor_id,
    cancelada: false,
    valor_nao_comissionado: 0,
    valor_total_bruto: item.valor_bruto,
    valor_total_pago: item.valor_bruto,
    linked_venda_id: item.linked_venda_id,
    linked_recibo_id: item.linked_recibo_id,
    vendas_recibos: [
      {
        id: item.linked_recibo_id || `${item.id}:recibo`,
        numero_recibo: item.documento,
        data_venda: item.data_venda,
        valor_total: item.valor_bruto,
        valor_taxas: item.valor_taxas,
        valor_du: null,
        valor_rav: null,
        produto_id: item.produto_id,
        tipo_pacote: null,
        valor_bruto_override: item.valor_bruto,
        valor_meta_override: item.valor_meta_override,
        valor_liquido_override: item.valor_liquido_override,
        valor_comissao_loja: item.valor_comissao_loja,
        percentual_comissao_loja: item.percentual_comissao_loja,
        faixa_comissao: item.faixa_comissao,
        cancelado_por_conciliacao_em: item.cancelado_por_conciliacao_em,
        cancelado_por_conciliacao_observacao: item.cancelado_por_conciliacao_observacao,
        tipo_produtos: item.produto,
      },
    ],
  })) satisfies ConciliacaoSyntheticVenda[];
}

export function hasConciliacaoOverride(recibo: {
  valor_bruto_override?: number | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: string | null;
}) {
  return (
    recibo.valor_bruto_override != null ||
    recibo.valor_meta_override != null ||
    recibo.valor_liquido_override != null
  );
}
