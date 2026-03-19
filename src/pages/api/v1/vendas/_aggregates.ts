import {
  fetchEffectiveConciliacaoReceipts,
} from "../../../../lib/conciliacao/source";

type ProdutoRecibo = {
  id?: string | null;
  nome?: string | null;
  tipo?: string | null;
  exibe_kpi_comissao?: boolean | null;
};

type ReciboVenda = {
  id?: string | null;
  data_venda?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
  valor_du?: number | null;
  valor_bruto_override?: number | null;
  valor_liquido_override?: number | null;
  produto_id?: string | null;
  produtos?: ProdutoRecibo | null;
};

type DestinoVenda = {
  nome?: string | null;
  tipo_produto?: string | null;
};

type VendaAggregateRow = {
  id?: string | null;
  vendedor_id?: string | null;
  destino_id?: string | null;
  data_venda?: string | null;
  valor_total?: number | null;
  valor_total_bruto?: number | null;
  valor_taxas?: number | null;
  destinos?: DestinoVenda | null;
  vendas_recibos?: ReciboVenda[] | null;
};

export type VendasAgg = {
  totalVendas: number;
  totalTaxas: number;
  totalLiquido: number;
  totalSeguro: number;
  qtdVendas: number;
  ticketMedio: number;
  timeline: Array<{ date: string; value: number }>;
  topDestinos: Array<{ name: string; value: number }>;
  porProduto: Array<{ id: string; name: string; value: number }>;
  porVendedor: Array<{ vendedor_id: string; total: number; qtd: number }>;
};

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toDateKey(value?: string | null) {
  return String(value || "").slice(0, 10);
}

function isInRange(value: string, inicio?: string | null, fim?: string | null) {
  if (!value) return false;
  if (inicio && value < inicio) return false;
  if (fim && value > fim) return false;
  return true;
}

function isSeguroProduto(produto?: ProdutoRecibo | null) {
  const tipo = String(produto?.tipo || "").toLowerCase();
  const nome = String(produto?.nome || "").toLowerCase();
  return tipo.includes("seguro") || nome.includes("seguro");
}

function hasConciliacaoOverride(recibo?: ReciboVenda | null) {
  return (
    recibo?.valor_bruto_override != null ||
    recibo?.valor_liquido_override != null
  );
}

function getReciboBruto(recibo?: ReciboVenda | null) {
  if (!recibo) return 0;
  if (hasConciliacaoOverride(recibo)) {
    return toNumber(recibo.valor_bruto_override ?? recibo.valor_total);
  }
  return toNumber(recibo.valor_total);
}

function getReciboTaxas(recibo?: ReciboVenda | null) {
  if (!recibo) return 0;
  if (hasConciliacaoOverride(recibo)) {
    return toNumber(recibo.valor_taxas);
  }
  return Math.max(0, toNumber(recibo.valor_taxas) - toNumber(recibo.valor_du));
}

export async function fetchVendasAggregateRows(
  client: any,
  options: {
    companyId?: string | null;
    vendedorIds?: string[] | null;
  }
): Promise<VendaAggregateRow[]> {
  const { companyId, vendedorIds } = options;

  let query = client
    .from("vendas")
    .select(
      `
        id,
        vendedor_id,
        destino_id,
        data_venda,
        valor_total,
        valor_total_bruto,
        valor_taxas,
        destinos:produtos!destino_id (nome, tipo_produto),
        vendas_recibos (
          id,
          data_venda,
          valor_total,
          valor_taxas,
          valor_du,
          produto_id,
          produtos:tipo_produtos!produto_id (id, nome, tipo, exibe_kpi_comissao)
        )
      `
    )
    .eq("cancelada", false);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }
  if (vendedorIds && vendedorIds.length > 0) {
    query = query.in("vendedor_id", vendedorIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as VendaAggregateRow[];
}

async function fetchConciliacaoOverrideFlag(client: any, companyId?: string | null) {
  if (!companyId) return false;
  const { data } = await client
    .from("parametros_comissao")
    .select("conciliacao_sobrepoe_vendas")
    .eq("company_id", companyId)
    .maybeSingle();
  return Boolean(data?.conciliacao_sobrepoe_vendas);
}

export async function fetchVendasAggregateRowsResolved(
  client: any,
  options: {
    companyId?: string | null;
    vendedorIds?: string[] | null;
    inicio?: string | null;
    fim?: string | null;
  }
): Promise<VendaAggregateRow[]> {
  const { companyId, vendedorIds, inicio, fim } = options;
  const rows = await fetchVendasAggregateRows(client, { companyId, vendedorIds });
  const usarConciliacao = await fetchConciliacaoOverrideFlag(client, companyId);

  if (!usarConciliacao || !companyId || !inicio || !fim) {
    return rows;
  }

  const concReceipts = await fetchEffectiveConciliacaoReceipts({
    client,
    companyId,
    inicio,
    fim,
    vendedorIds: vendedorIds || null,
  });

  if (concReceipts.length === 0) {
    return rows;
  }

  const baseRowsById = new Map<string, VendaAggregateRow>();
  rows.forEach((row) => {
    const id = String(row?.id || "").trim();
    if (!id) return;
    baseRowsById.set(id, row);
  });

  const overriddenReceiptIds = new Set(
    concReceipts.map((item) => String(item.linked_recibo_id || "").trim()).filter(Boolean)
  );

  const baseRows = rows.flatMap((row) => {
    const recibosOriginais = Array.isArray(row?.vendas_recibos) ? row.vendas_recibos : [];
    if (recibosOriginais.length === 0) return [row];
    const recibos = recibosOriginais.filter(
      (recibo) => !overriddenReceiptIds.has(String(recibo?.id || "").trim())
    );
    if (recibos.length === 0) return [];
    return [{ ...row, vendas_recibos: recibos }];
  });

  const syntheticRows: VendaAggregateRow[] = concReceipts.map((item) => {
    const linkedSale = item.linked_venda_id ? baseRowsById.get(String(item.linked_venda_id).trim()) : null;
    return {
      id: item.id,
      vendedor_id: item.vendedor_id,
      destino_id: linkedSale?.destino_id ?? null,
      data_venda: item.data_venda,
      valor_total: item.valor_bruto,
      valor_total_bruto: item.valor_bruto,
      valor_taxas: item.valor_taxas,
      destinos: linkedSale?.destinos ?? null,
      vendas_recibos: [
        {
          id: item.linked_recibo_id || `${item.id}:recibo`,
          data_venda: item.data_venda,
          valor_total: item.valor_bruto,
          valor_taxas: item.valor_taxas,
          valor_du: 0,
          valor_bruto_override: item.valor_bruto,
          valor_liquido_override: item.valor_liquido_override,
          produto_id: item.produto_id,
          produtos: item.produto
            ? {
                id: item.produto.id,
                nome: item.produto.nome,
                tipo: item.is_seguro_viagem ? "Seguro" : null,
                exibe_kpi_comissao: true,
              }
            : null,
        },
      ],
    };
  });

  return [...baseRows, ...syntheticRows];
}

export async function fetchAndComputeVendasAgg(
  client: any,
  options: {
    companyId?: string | null;
    vendedorIds?: string[] | null;
    inicio?: string | null;
    fim?: string | null;
  }
): Promise<VendasAgg> {
  const rows = await fetchVendasAggregateRowsResolved(client, options);
  return computeVendasAggFromRows(rows, {
    inicio: options.inicio ?? null,
    fim: options.fim ?? null,
  });
}

export function computeVendasAggFromRows(
  rows: VendaAggregateRow[],
  options: {
    inicio?: string | null;
    fim?: string | null;
  } = {}
): VendasAgg {
  const { inicio, fim } = options;

  let totalVendas = 0;
  let totalTaxas = 0;
  let totalSeguro = 0;
  let qtdVendas = 0;

  const timelineMap = new Map<string, number>();
  const destinoMap = new Map<string, number>();
  const produtoMap = new Map<string, { id: string; name: string; value: number }>();
  const vendedorMap = new Map<string, { vendedor_id: string; total: number; qtd: number }>();

  rows.forEach((venda) => {
    const vendaDate = toDateKey(venda?.data_venda);
    const recibosAll = Array.isArray(venda?.vendas_recibos) ? venda.vendas_recibos : [];
    const saleHasOverride = recibosAll.some((recibo) => hasConciliacaoOverride(recibo));
    const valorTotalRef = toNumber(venda?.valor_total_bruto ?? venda?.valor_total);
    const totalBrutoAll = recibosAll.reduce((sum, recibo) => sum + toNumber(recibo?.valor_total), 0);
    const fator =
      !saleHasOverride && totalBrutoAll > 0 && valorTotalRef > 0
        ? clamp01(valorTotalRef / totalBrutoAll)
        : 1;
    const destinoNome = String(venda?.destinos?.nome || "Sem destino");
    const vendedorId = String(venda?.vendedor_id || "unknown");

    const recibosPeriodo = recibosAll.filter((recibo) => {
      const reciboDate = toDateKey(recibo?.data_venda) || vendaDate;
      return isInRange(reciboDate, inicio, fim);
    });

    if (recibosPeriodo.length === 0) {
      if (recibosAll.length > 0 || !isInRange(vendaDate, inicio, fim)) return;

      const vendaTotal = valorTotalRef;
      const vendaTaxas = toNumber(venda?.valor_taxas);
      totalVendas += vendaTotal;
      totalTaxas += vendaTaxas;
      qtdVendas += vendaTotal > 0 ? 1 : 0;

      if (vendaDate) {
        timelineMap.set(vendaDate, (timelineMap.get(vendaDate) || 0) + vendaTotal);
      }
      destinoMap.set(destinoNome, (destinoMap.get(destinoNome) || 0) + vendaTotal);

      const produtoId = String(venda?.destinos?.tipo_produto || "").trim();
      const produtoKey = produtoId || `nome:${destinoNome.toLowerCase()}`;
      const currentProduto = produtoMap.get(produtoKey);
      if (!currentProduto) {
        produtoMap.set(produtoKey, { id: produtoKey, name: destinoNome, value: vendaTotal });
      } else {
        currentProduto.value += vendaTotal;
      }

      const currentVend =
        vendedorMap.get(vendedorId) || { vendedor_id: vendedorId, total: 0, qtd: 0 };
      currentVend.total += vendaTotal;
      currentVend.qtd += vendaTotal > 0 ? 1 : 0;
      vendedorMap.set(vendedorId, currentVend);
      return;
    }

    recibosPeriodo.forEach((recibo) => {
      const reciboDate = toDateKey(recibo?.data_venda) || vendaDate;
      const bruto = getReciboBruto(recibo) * fator;
      const taxasEfetivas = getReciboTaxas(recibo) * fator;
      const produto = recibo?.produtos || null;

      totalVendas += bruto;
      totalTaxas += taxasEfetivas;
      qtdVendas += 1;

      if (reciboDate) {
        timelineMap.set(reciboDate, (timelineMap.get(reciboDate) || 0) + bruto);
      }
      destinoMap.set(destinoNome, (destinoMap.get(destinoNome) || 0) + bruto);

      if (produto?.exibe_kpi_comissao !== false) {
        const produtoNome = String(produto?.nome || "Produto");
        const produtoId = String(produto?.id || recibo?.produto_id || "").trim();
        const produtoKey = produtoId || `nome:${produtoNome.toLowerCase()}`;
        const currentProduto = produtoMap.get(produtoKey);
        if (!currentProduto) {
          produtoMap.set(produtoKey, { id: produtoKey, name: produtoNome, value: bruto });
        } else {
          currentProduto.value += bruto;
        }
      }

      if (isSeguroProduto(produto)) {
        totalSeguro += bruto;
      }

      const currentVend =
        vendedorMap.get(vendedorId) || { vendedor_id: vendedorId, total: 0, qtd: 0 };
      currentVend.total += bruto;
      currentVend.qtd += 1;
      vendedorMap.set(vendedorId, currentVend);
    });
  });

  const totalLiquido = totalVendas - totalTaxas;
  const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;

  return {
    totalVendas,
    totalTaxas,
    totalLiquido,
    totalSeguro,
    qtdVendas,
    ticketMedio,
    timeline: Array.from(timelineMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date, value })),
    topDestinos: Array.from(destinoMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    porProduto: Array.from(produtoMap.values()).sort((a, b) => b.value - a.value),
    porVendedor: Array.from(vendedorMap.values()).sort((a, b) => b.total - a.total),
  };
}
