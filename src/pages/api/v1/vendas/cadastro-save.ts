import {
  applyScopeToQuery,
  buildAuthClient,
  getUserScope,
  isUuid,
  requireModuloLevel,
} from "./_utils";
import { ensureReciboReservaUnicos } from "../../../../lib/vendas/reciboReservaValidator";
import { normalizeText } from "../../../../lib/normalizeText";

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function calcularStatusPeriodo(inicio?: string | null, fim?: string | null) {
  if (!inicio) return "planejada";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataInicio = new Date(inicio);
  const dataFim = fim ? new Date(fim) : null;

  if (dataFim && dataFim < hoje) return "concluida";
  if (dataInicio > hoje) return "confirmada";
  if (dataFim && hoje > dataFim) return "concluida";
  return "em_viagem";
}

function sanitizeLabel(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return normalizeText(raw, { trim: true, collapseWhitespace: true });
}

type ReciboPayload = {
  produto_id: string;
  produto_resolvido_id: string;
  numero_recibo: string;
  numero_reserva?: string | null;
  tipo_pacote?: string | null;
  valor_total: number;
  valor_taxas: number;
    valor_du: number;
  valor_rav: number;
  data_inicio?: string | null;
  data_fim?: string | null;
  contrato_path?: string | null;
  contrato_url?: string | null;
  produto_nome?: string | null;
  tipo_nome?: string | null;
  cidade_nome?: string | null;
};

type PagamentoPayload = {
  forma_pagamento_id?: string | null;
  forma_nome?: string | null;
  operacao?: string | null;
  plano?: string | null;
  valor_bruto?: number | null;
  desconto_valor?: number | null;
  valor_total?: number | null;
  parcelas?: any[] | null;
  parcelas_qtd?: number | null;
  parcelas_valor?: number | null;
  vencimento_primeira?: string | null;
  paga_comissao?: boolean | null;
};

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;

    const vendaId = String(body?.venda_id || "").trim();
    const isEdit = Boolean(vendaId);

    const moduloMin = isEdit ? 3 : 2;
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["vendas", "vendas_cadastro"],
        moduloMin,
        "Sem permissao para salvar vendas."
      );
      if (denied) return denied;
    }

    const venda = body?.venda || {};
    const vendedorId = String(venda?.vendedor_id || "").trim() || user.id;
    const clienteId = String(venda?.cliente_id || "").trim();
    if (!isUuid(clienteId)) return new Response("cliente_id invalido.", { status: 400 });

    if (scope.usoIndividual && vendedorId !== user.id) {
      return new Response("Uso individual: vendedor invalido.", { status: 403 });
    }

    const recibos = Array.isArray(body?.recibos) ? body.recibos : [];
    if (!recibos.length) return new Response("recibos obrigatorio.", { status: 400 });

    const numerosLookup = recibos.map((r: any) => ({
      numero_recibo: r?.numero_recibo || null,
      numero_reserva: r?.numero_reserva || null,
      cliente_id: clienteId,
    }));

    try {
      await ensureReciboReservaUnicos({
        client,
        companyId: scope.companyId || null,
        ignoreVendaId: isEdit ? vendaId : null,
        numeros: numerosLookup,
      });
    } catch (err: any) {
      const code = err?.code || err?.message;
      if (code === "RECIBO_DUPLICADO" || code === "RESERVA_DUPLICADA") {
        return new Response(JSON.stringify({ code }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    const produtosDestinoId = String(venda?.destino_id || "").trim();
    if (!isUuid(produtosDestinoId)) return new Response("destino_id invalido.", { status: 400 });

    const vendaPayload: any = {
      vendedor_id: vendedorId,
      cliente_id: clienteId,
      destino_id: produtosDestinoId,
      destino_cidade_id: venda?.destino_cidade_id || null,
      data_lancamento: venda?.data_lancamento || null,
      data_venda: venda?.data_venda || null,
      data_embarque: venda?.data_embarque || null,
      data_final: venda?.data_final || null,
      desconto_comercial_aplicado: Boolean(venda?.desconto_comercial_aplicado),
      desconto_comercial_valor: toNullableNumber(venda?.desconto_comercial_valor),
      valor_total_bruto: toNullableNumber(venda?.valor_total_bruto),
      valor_total_pago: toNullableNumber(venda?.valor_total_pago),
      valor_total: toNullableNumber(venda?.valor_total),
      valor_taxas: toNullableNumber(venda?.valor_taxas),
      valor_nao_comissionado: toNullableNumber(venda?.valor_nao_comissionado),
    };

    if (scope.companyId) {
      vendaPayload.company_id = scope.companyId;
    }

    let vendaIdFinal = vendaId;

    if (isEdit) {
      let vendaUpdate = client.from("vendas").update(vendaPayload).eq("id", vendaId);
      vendaUpdate = applyScopeToQuery(vendaUpdate, scope, scope.companyId);
      const { data: vendaData, error: vendaErr } = await vendaUpdate.select("id").maybeSingle();
      if (vendaErr) throw vendaErr;
      if (!vendaData?.id) {
        return new Response("Venda nao encontrada ou sem permissao.", { status: 403 });
      }

      const { data: oldRecibos, error: oldRecErr } = await client
        .from("vendas_recibos")
        .select("id")
        .eq("venda_id", vendaId);
      if (oldRecErr) throw oldRecErr;
      const oldReciboIds = (oldRecibos || []).map((r: any) => r.id).filter(Boolean);
      if (oldReciboIds.length > 0) {
        const { error: cleanupError } = await client
          .from("viagens")
          .delete()
          .in("recibo_id", oldReciboIds);
        if (cleanupError) throw cleanupError;
      }

      const { error: deleteRecibosErr } = await client
        .from("vendas_recibos")
        .delete()
        .eq("venda_id", vendaId);
      if (deleteRecibosErr) throw deleteRecibosErr;
    } else {
      const { data: vendaData, error: vendaErr } = await client
        .from("vendas")
        .insert(vendaPayload)
        .select("id")
        .single();
      if (vendaErr) throw vendaErr;
      vendaIdFinal = vendaData?.id;
    }

    if (!vendaIdFinal) return new Response("Venda nao gerada.", { status: 500 });

    const pagamentos = Array.isArray(body?.pagamentos) ? body.pagamentos : [];
    const { error: pagamentosDeleteErr } = await client
      .from("vendas_pagamentos")
      .delete()
      .eq("venda_id", vendaIdFinal);
    if (pagamentosDeleteErr) throw pagamentosDeleteErr;

    for (const pagamento of pagamentos as PagamentoPayload[]) {
      if (!pagamento?.forma_pagamento_id && !pagamento?.forma_nome) continue;
      const payload = {
        venda_id: vendaIdFinal,
        company_id: scope.companyId,
        forma_pagamento_id: pagamento?.forma_pagamento_id || null,
        forma_nome: pagamento?.forma_nome || null,
        operacao: pagamento?.operacao || null,
        plano: pagamento?.plano || null,
        valor_bruto: toNullableNumber(pagamento?.valor_bruto),
        desconto_valor: toNullableNumber(pagamento?.desconto_valor),
        valor_total: toNullableNumber(pagamento?.valor_total),
        parcelas: pagamento?.parcelas && pagamento.parcelas.length ? pagamento.parcelas : null,
        parcelas_qtd: pagamento?.parcelas_qtd ?? null,
        parcelas_valor: pagamento?.parcelas_valor ?? null,
        vencimento_primeira: pagamento?.vencimento_primeira || null,
        paga_comissao: pagamento?.paga_comissao ?? null,
      };
      const { error } = await client.from("vendas_pagamentos").insert(payload);
      if (error) throw error;
    }

    const recibosRows: ReciboPayload[] = (recibos || []).map((r: any) => ({
      produto_id: String(r?.produto_id || "").trim(),
      produto_resolvido_id: String(r?.produto_resolvido_id || "").trim(),
      numero_recibo: String(r?.numero_recibo || "").trim(),
      numero_reserva: r?.numero_reserva ? String(r?.numero_reserva || "").trim() : null,
      tipo_pacote: r?.tipo_pacote ? String(r?.tipo_pacote || "").trim() : null,
      valor_total: toNumber(r?.valor_total, 0),
      valor_taxas: toNumber(r?.valor_taxas, 0),
      valor_du: toNumber(r?.valor_du, 0),
      valor_rav: toNumber(r?.valor_rav, 0),
      data_inicio: r?.data_inicio || null,
      data_fim: r?.data_fim || null,
      contrato_path: r?.contrato_path || null,
      contrato_url: r?.contrato_url || null,
      produto_nome: r?.produto_nome || null,
      tipo_nome: r?.tipo_nome || null,
      cidade_nome: r?.cidade_nome || null,
    }));

    for (const recibo of recibosRows) {
      if (!isUuid(recibo.produto_id) || !isUuid(recibo.produto_resolvido_id)) {
        return new Response("produto_id invalido.", { status: 400 });
      }
      const insertPayload = {
        venda_id: vendaIdFinal,
        produto_id: recibo.produto_id,
        produto_resolvido_id: recibo.produto_resolvido_id,
        numero_recibo: recibo.numero_recibo,
        numero_reserva: recibo.numero_reserva || null,
        tipo_pacote: recibo.tipo_pacote || null,
        valor_total: recibo.valor_total,
        valor_taxas: recibo.valor_taxas,
        valor_du: recibo.valor_du,
        valor_rav: recibo.valor_rav,
        data_inicio: recibo.data_inicio || null,
        data_fim: recibo.data_fim || null,
        contrato_path: recibo.contrato_path || null,
        contrato_url: recibo.contrato_url || null,
      };
      const { data: insertedRecibo, error: insertErr } = await client
        .from("vendas_recibos")
        .insert(insertPayload)
        .select("id, data_inicio, data_fim")
        .single();
      if (insertErr) throw insertErr;

      const statusPeriodo = calcularStatusPeriodo(insertedRecibo?.data_inicio, insertedRecibo?.data_fim);
      const cidadeNome = sanitizeLabel(recibo.cidade_nome);
      const destinoLabel = sanitizeLabel(recibo.produto_nome || recibo.tipo_nome || cidadeNome) || null;
      const origemLabel = cidadeNome && cidadeNome !== destinoLabel ? cidadeNome : destinoLabel;

      const { data: viagemData, error: viagemErr } = await client
        .from("viagens")
        .insert({
          company_id: scope.companyId,
          venda_id: vendaIdFinal,
          recibo_id: insertedRecibo?.id,
          cliente_id: clienteId,
          responsavel_user_id: vendedorId,
          origem: origemLabel || null,
          destino: destinoLabel || null,
          data_inicio: insertedRecibo?.data_inicio || null,
          data_fim: insertedRecibo?.data_fim || null,
          status: statusPeriodo,
          observacoes: recibo.numero_recibo ? `Recibo ${recibo.numero_recibo}` : null,
        })
        .select("id")
        .single();
      if (viagemErr) throw viagemErr;

      if (viagemData?.id) {
        const { error: passageiroError } = await client.from("viagem_passageiros").insert({
          viagem_id: viagemData.id,
          cliente_id: clienteId,
          company_id: scope.companyId,
          papel: "passageiro",
          created_by: user.id,
        });
        if (passageiroError) throw passageiroError;
      }
    }

    const orcamentoId = String(body?.orcamento_id || "").trim();
    if (orcamentoId && isUuid(orcamentoId)) {
      const { error: fechamentoErr } = await client
        .from("quote")
        .update({
          status_negociacao: "Fechado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orcamentoId);
      if (fechamentoErr) {
        console.error("Erro ao fechar orcamento", fechamentoErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, venda_id: vendaIdFinal }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro vendas/cadastro-save", err);
    return new Response("Erro ao salvar venda.", { status: 500 });
  }
}
