import { fetchEffectiveConciliacaoReceipts } from "../conciliacao/source";

type ReportProduto = {
  id?: string | null;
  nome?: string | null;
  tipo?: string | null;
};

type ReportRecibo = {
  id?: string | null;
  numero_recibo?: string | null;
  produto_id?: string | null;
  data_venda?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
  valor_du?: number | null;
  valor_bruto_override?: number | null;
  valor_liquido_override?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: string | null;
  produtos?: ReportProduto | null;
};

type ReportSale = {
  id?: string | null;
  vendedor_id?: string | null;
  cliente_id?: string | null;
  destino_id?: string | null;
  destino_cidade_id?: string | null;
  data_venda?: string | null;
  valor_total?: number | null;
  valor_total_bruto?: number | null;
  status?: string | null;
  clientes?: { nome?: string | null; cpf?: string | null } | null;
  destinos?: { nome?: string | null; cidade_id?: string | null } | null;
  destino_cidade?: { nome?: string | null } | null;
  vendas_recibos?: ReportRecibo[] | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getReciboValorBruto(recibo?: ReportRecibo | null) {
  if (!recibo) return 0;
  if (recibo.valor_bruto_override != null) {
    return Math.max(0, toNumber(recibo.valor_bruto_override));
  }
  return Math.max(0, toNumber(recibo.valor_total));
}

export function getReciboValorTaxas(recibo?: ReportRecibo | null) {
  if (!recibo) return 0;
  if (recibo.valor_bruto_override != null || recibo.valor_liquido_override != null) {
    return Math.max(0, toNumber(recibo.valor_taxas));
  }
  return Math.max(0, toNumber(recibo.valor_taxas) - toNumber(recibo.valor_du));
}

export async function fetchConciliacaoOverrideFlag(client: any, companyId?: string | null) {
  if (!companyId) return false;
  const { data } = await client
    .from("parametros_comissao")
    .select("conciliacao_sobrepoe_vendas")
    .eq("company_id", companyId)
    .maybeSingle();
  return Boolean(data?.conciliacao_sobrepoe_vendas);
}

export async function applyConciliacaoOverridesToSales<T extends ReportSale>(
  client: any,
  sales: T[],
  params: {
    companyId?: string | null;
    inicio?: string | null;
    fim?: string | null;
    vendedorIds?: string[] | null;
  }
): Promise<T[]> {
  const { companyId, inicio, fim, vendedorIds } = params;
  if (!companyId || !inicio || !fim || !Array.isArray(sales) || sales.length === 0) {
    return sales;
  }

  const concReceipts = await fetchEffectiveConciliacaoReceipts({
    client,
    companyId,
    inicio,
    fim,
    vendedorIds: vendedorIds || null,
  });

  if (concReceipts.length === 0) {
    return sales;
  }

  const bySaleId = new Map<string, T>();
  sales.forEach((sale) => {
    const saleId = String(sale?.id || "").trim();
    if (!saleId) return;
    bySaleId.set(saleId, {
      ...sale,
      vendas_recibos: Array.isArray(sale?.vendas_recibos) ? [...sale.vendas_recibos] : [],
    });
  });

  const overriddenReceiptIds = new Set(
    concReceipts.map((item) => String(item.linked_recibo_id || "").trim()).filter(Boolean)
  );

  const baseSales = Array.from(bySaleId.values()).flatMap((sale) => {
    const recibos = (sale.vendas_recibos || []).filter(
      (recibo) => !overriddenReceiptIds.has(String(recibo?.id || "").trim())
    );
    if ((sale.vendas_recibos || []).length > 0 && recibos.length === 0) {
      return [{ ...sale, vendas_recibos: [] as ReportRecibo[] }];
    }
    return [{ ...sale, vendas_recibos: recibos }];
  });

  const finalBySaleId = new Map<string, T>();
  baseSales.forEach((sale) => {
    const saleId = String(sale?.id || "").trim();
    if (!saleId) return;
    finalBySaleId.set(saleId, sale as T);
  });

  concReceipts.forEach((item) => {
    const linkedSaleId = String(item.linked_venda_id || "").trim();
    const syntheticRecibo: ReportRecibo = {
      id: item.linked_recibo_id || `${item.id}:recibo`,
      numero_recibo: item.documento,
      produto_id: item.produto_id,
      data_venda: item.data_venda,
      valor_total: item.valor_bruto,
      valor_taxas: item.valor_taxas,
      valor_du: 0,
      valor_bruto_override: item.valor_bruto,
      valor_liquido_override: item.valor_liquido_override,
      valor_comissao_loja: item.valor_comissao_loja,
      percentual_comissao_loja: item.percentual_comissao_loja,
      faixa_comissao: item.faixa_comissao,
      produtos: item.produto
        ? {
            id: item.produto.id,
            nome: item.produto.nome,
            tipo: item.is_seguro_viagem ? "Seguro" : null,
          }
        : null,
    };

    if (linkedSaleId && finalBySaleId.has(linkedSaleId)) {
      const sale = finalBySaleId.get(linkedSaleId)!;
      finalBySaleId.set(linkedSaleId, {
        ...sale,
        vendas_recibos: [...(sale.vendas_recibos || []), syntheticRecibo],
      } as T);
      return;
    }

    finalBySaleId.set(item.id, {
      id: item.id,
      vendedor_id: item.vendedor_id,
      cliente_id: null,
      destino_id: null,
      destino_cidade_id: null,
      data_venda: item.data_venda,
      valor_total: item.valor_bruto,
      valor_total_bruto: item.valor_bruto,
      status: null,
      clientes: null,
      destinos: null,
      destino_cidade: null,
      vendas_recibos: [syntheticRecibo],
    } as T);
  });

  return Array.from(finalBySaleId.values());
}
