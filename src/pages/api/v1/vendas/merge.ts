import {
  applyScopeToQuery,
  buildAuthClient,
  fetchGestorEquipeIdsComGestor,
  getUserScope,
  isUuid,
  requireModuloLevel,
  resolveCompanyId,
} from "./_utils";
import { normalizeText } from "../../../../lib/normalizeText";

const DEFAULT_NAO_COMISSIONAVEIS = [
  "credito diversos",
  "credito pax",
  "credito passageiro",
  "credito de viagem",
  "credipax",
  "vale viagem",
  "carta de credito",
  "credito",
];

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeTerm(value?: string | null) {
  return normalizeText(value || "", { trim: true, collapseWhitespace: true });
}

async function carregarTermosNaoComissionaveis(client: any) {
  try {
    const { data, error } = await client
      .from("parametros_pagamentos_nao_comissionaveis")
      .select("termo, termo_normalizado, ativo")
      .eq("ativo", true)
      .order("termo", { ascending: true });
    if (error) throw error;
    const termos = (data || [])
      .map((row: any) => normalizeTerm(row?.termo_normalizado || row?.termo))
      .filter(Boolean);
    const unique = Array.from(new Set(termos));
    if (unique.length) return unique;
  } catch (err) {
    console.warn("[vendas/merge] falha termos nao comissionaveis", err);
  }
  return DEFAULT_NAO_COMISSIONAVEIS.map((termo) => normalizeTerm(termo)).filter(Boolean);
}

function isFormaNaoComissionavel(nome?: string | null, termos?: string[]) {
  const normalized = normalizeTerm(nome);
  if (!normalized) return false;
  if (normalized.includes("cartao") && normalized.includes("credito")) return false;
  const lista = termos && termos.length ? termos : DEFAULT_NAO_COMISSIONAVEIS.map(normalizeTerm);
  return lista.some((termo) => termo && normalized.includes(termo));
}

function normalizeMoneyKey(value: number | null | undefined) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function buildPagamentoKey(pagamento: any) {
  const forma = (pagamento.forma_nome || pagamento.forma_pagamento_id || "")
    .toString()
    .toLowerCase()
    .trim();
  const totalKey = normalizeMoneyKey(
    pagamento.valor_total != null ? pagamento.valor_total : pagamento.valor_bruto
  );
  const parcelas = Array.isArray(pagamento.parcelas) ? pagamento.parcelas : [];
  const parcelasKey = parcelas
    .map((parcela: any) => {
      const valor = normalizeMoneyKey(parcela?.valor);
      const venc = parcela?.vencimento || "";
      return `${valor}|${venc}`;
    })
    .join(",");
  const parcelasQtd = pagamento.parcelas_qtd ?? parcelas.length ?? 0;
  const pagaComissaoKey =
    pagamento.paga_comissao === null || pagamento.paga_comissao === undefined
      ? "na"
      : pagamento.paga_comissao
        ? "1"
        : "0";
  return [forma, totalKey, parcelasKey, String(parcelasQtd), pagaComissaoKey].join("|");
}

function dedupePagamentos(pagamentos: any[], preferVendaId?: string) {
  const mapa = new Map<string, any>();
  const duplicados: any[] = [];

  pagamentos.forEach((pagamento) => {
    const chave = buildPagamentoKey(pagamento);
    const existente = mapa.get(chave);
    if (!existente) {
      mapa.set(chave, pagamento);
      return;
    }
    if (preferVendaId && pagamento.venda_id === preferVendaId && existente.venda_id !== preferVendaId) {
      duplicados.push(existente);
      mapa.set(chave, pagamento);
      return;
    }
    duplicados.push(pagamento);
  });

  return {
    deduped: Array.from(mapa.values()),
    duplicateIds: duplicados.map((p) => p.id).filter(Boolean),
  };
}

function calcularValorPagamento(pagamento: any) {
  const total = Number(pagamento.valor_total || 0);
  if (total > 0) return total;
  const bruto = Number(pagamento.valor_bruto || 0);
  const desconto = Number(pagamento.desconto_valor || 0);
  if (bruto > 0) return Math.max(0, bruto - desconto);
  return 0;
}

function calcularTotalPagamentos(pagamentos: any[]) {
  return pagamentos.reduce((acc, pagamento) => acc + calcularValorPagamento(pagamento), 0);
}

function parseIds(raw?: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => isUuid(id))
    .slice(0, 300);
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);

    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["vendas_consulta", "vendas"],
        3,
        "Sem permissao para editar vendas."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const vendaId = String(body?.venda_id || "").trim();
    const mergeIdsRaw = Array.isArray(body?.merge_ids) ? body.merge_ids : [];
    const mergeIds = mergeIdsRaw.map((id: any) => String(id || "").trim()).filter((id: string) => isUuid(id));
    const requestedCompanyId = String(body?.company_id || "").trim();
    const vendorIdsParam = Array.isArray(body?.vendedor_ids)
      ? body.vendedor_ids.map((id: any) => String(id || "").trim()).filter((id: string) => isUuid(id))
      : parseIds(String(body?.vendedor_ids || ""));

    if (!isUuid(vendaId)) return new Response("venda_id invalido.", { status: 400 });

    const vendasFilhas = mergeIds.filter((id: string) => id && id !== vendaId);
    if (!vendasFilhas.length) return new Response("merge_ids vazio.", { status: 400 });

    const vendaIds = [vendaId, ...vendasFilhas];
    const companyId = resolveCompanyId(scope, requestedCompanyId);

    let vendasQuery = client
      .from("vendas")
      .select("id, vendedor_id, desconto_comercial_aplicado, desconto_comercial_valor, data_embarque, data_final")
      .in("id", vendaIds);
    vendasQuery = applyScopeToQuery(vendasQuery, scope, companyId);

    if (!scope.isAdmin && scope.papel === "GESTOR") {
      const ids = await fetchGestorEquipeIdsComGestor(client, scope.userId);
      if (ids.length === 0) {
        return new Response("Sem vendas para mesclar.", { status: 403 });
      }
      vendasQuery = vendasQuery.in("vendedor_id", ids);
    }

    if (!scope.isAdmin && scope.papel === "MASTER" && vendorIdsParam.length > 0) {
      vendasQuery = vendasQuery.in("vendedor_id", vendorIdsParam);
    }

    const { data: vendasData, error: vendasError } = await vendasQuery;
    if (vendasError) throw vendasError;

    const vendasLista = (vendasData || []) as any[];
    const foundIds = new Set(vendasLista.map((v) => v.id));
    const missing = vendaIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      return new Response("Vendas invalidas para mescla.", { status: 404 });
    }

    const vendaPrincipal = vendasLista.find((v) => v.id === vendaId);
    if (!vendaPrincipal) return new Response("Venda principal nao encontrada.", { status: 404 });

    const { data: recibosData, error: recibosError } = await client
      .from("vendas_recibos")
      .select("id, venda_id, valor_total, valor_taxas, data_inicio, data_fim")
      .in("venda_id", vendaIds);
    if (recibosError) throw recibosError;

    const { data: pagamentosData, error: pagamentosError } = await client
      .from("vendas_pagamentos")
      .select(
        "id, venda_id, forma_pagamento_id, forma_nome, valor_total, valor_bruto, desconto_valor, parcelas, parcelas_qtd, parcelas_valor, paga_comissao, operacao, plano"
      )
      .in("venda_id", vendaIds);
    if (pagamentosError) throw pagamentosError;

    const pagamentosLista = (pagamentosData || []) as any[];
    const { deduped, duplicateIds } = dedupePagamentos(pagamentosLista, vendaId);

    if (duplicateIds.length > 0) {
      const { error: dupErr } = await client
        .from("vendas_pagamentos")
        .delete()
        .in("id", duplicateIds);
      if (dupErr) throw dupErr;
    }

    if (vendasFilhas.length > 0) {
      const { error: updatePag } = await client
        .from("vendas_pagamentos")
        .update({ venda_id: vendaId })
        .in("venda_id", vendasFilhas);
      if (updatePag) throw updatePag;

      const { error: updateNotas } = await client
        .from("vendas_recibos_notas")
        .update({ venda_id: vendaId })
        .in("venda_id", vendasFilhas);
      if (updateNotas) throw updateNotas;

      const { error: updateRecibos } = await client
        .from("vendas_recibos")
        .update({ venda_id: vendaId })
        .in("venda_id", vendasFilhas);
      if (updateRecibos) throw updateRecibos;

      const { error: updateViagens } = await client
        .from("viagens")
        .update({ venda_id: vendaId })
        .in("venda_id", vendasFilhas);
      if (updateViagens) throw updateViagens;
    }

    if (vendasFilhas.length > 0) {
      let deleteVenda = client.from("vendas").delete().in("id", vendasFilhas);
      deleteVenda = applyScopeToQuery(deleteVenda, scope, companyId);
      const { error: deleteErr } = await deleteVenda;
      if (deleteErr) throw deleteErr;
    }

    const recibosLista = (recibosData || []) as any[];
    const totalBrutoRecibos = recibosLista.reduce((acc, r) => acc + (r.valor_total || 0), 0);
    const totalTaxasRecibos = recibosLista.reduce((acc, r) => acc + (r.valor_taxas || 0), 0);
    const totalPago = calcularTotalPagamentos(deduped);
    const totalPagoFinal = totalPago > 0 ? totalPago : totalBrutoRecibos;
    const termosNaoComissionaveis = await carregarTermosNaoComissionaveis(client);
    const valorNaoComissionado = deduped.reduce((acc: number, pagamento: any) => {
      const naoComissiona =
        pagamento.paga_comissao === false ||
        isFormaNaoComissionavel(pagamento.forma_nome, termosNaoComissionaveis);
      if (!naoComissiona) return acc;
      return acc + calcularValorPagamento(pagamento);
    }, 0);
    const valorComissionavel =
      totalPagoFinal > 0 ? Math.max(0, totalPagoFinal - valorNaoComissionado) : 0;

    const descontoTotal = vendasLista.reduce(
      (acc, venda) => acc + Number(venda.desconto_comercial_valor || 0),
      0
    );
    const vendaPrincipalMeta = vendaPrincipal;
    const datasInicio = recibosLista
      .map((r) => r.data_inicio)
      .filter((v: string | null | undefined): v is string => Boolean(v));
    const datasFim = recibosLista
      .map((r) => r.data_fim)
      .filter((v: string | null | undefined): v is string => Boolean(v));
    const dataEmbarque =
      datasInicio.length > 0
        ? datasInicio.sort()[0]
        : vendaPrincipalMeta?.data_embarque || null;
    const dataFinal =
      datasFim.length > 0 ? datasFim.sort().slice(-1)[0] : vendaPrincipalMeta?.data_final || null;

    let updateVenda = client
      .from("vendas")
      .update({
        valor_total_bruto: totalBrutoRecibos || null,
        valor_total_pago: totalPagoFinal || null,
        valor_taxas: totalTaxasRecibos || null,
        valor_nao_comissionado: valorNaoComissionado || null,
        valor_total: valorComissionavel || null,
        desconto_comercial_aplicado: descontoTotal > 0,
        desconto_comercial_valor: descontoTotal || null,
        data_embarque: dataEmbarque || null,
        data_final: dataFinal || null,
      })
      .eq("id", vendaId);
    updateVenda = applyScopeToQuery(updateVenda, scope, companyId);
    const { error: updateErr } = await updateVenda;
    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        ok: true,
        removed_pagamentos: duplicateIds.length,
        total_bruto: totalBrutoRecibos,
        total_taxas: totalTaxasRecibos,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Erro vendas/merge", err);
    return new Response("Erro ao mesclar vendas.", { status: 500 });
  }
}
