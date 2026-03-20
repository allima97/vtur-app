import { supabaseServer, hasServiceRoleKey } from "../../../../lib/supabaseServer";
import { isConciliacaoEfetivada } from "../../../../lib/conciliacao/business";

const EPS = 0.01;

function compactNumero(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function onlyDigits(value?: string | null) {
  return String(value ?? "").replace(/\D+/g, "");
}

function reciboCoreDigits(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function stripLeadingZeros(value?: string | null) {
  const raw = String(value ?? "").replace(/^0+/, "");
  return raw || "0";
}

function extractReciboPrefix(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const prefixMatch = raw.match(/^(\d{4})\D+/);
  if (prefixMatch?.[1]) return prefixMatch[1];
  const digits = onlyDigits(raw);
  return digits.length >= 14 ? digits.slice(0, 4) : "";
}

function reciboSignificantCore(value?: string | null) {
  const core = reciboCoreDigits(value);
  return core ? stripLeadingZeros(core) : "";
}

function numeroReciboMatches(left?: string | null, right?: string | null) {
  const leftCompact = compactNumero(left);
  const rightCompact = compactNumero(right);
  if (leftCompact && rightCompact && leftCompact === rightCompact) return true;

  const leftDigits = onlyDigits(left);
  const rightDigits = onlyDigits(right);
  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;

  const leftCore = reciboCoreDigits(leftDigits);
  const rightCore = reciboCoreDigits(rightDigits);
  if (leftCore && rightCore && leftCore === rightCore) return true;

  const leftSignificantCore = stripLeadingZeros(leftCore);
  const rightSignificantCore = stripLeadingZeros(rightCore);
  if (!leftSignificantCore || !rightSignificantCore || leftSignificantCore !== rightSignificantCore) {
    return false;
  }

  const leftPrefix = extractReciboPrefix(left);
  const rightPrefix = extractReciboPrefix(right);
  if (leftPrefix && rightPrefix) return leftPrefix === rightPrefix;
  return true;
}

function buildReciboSearchPatterns(value?: string | null) {
  const digits = onlyDigits(value);
  const core = reciboCoreDigits(value);
  const significantCore = reciboSignificantCore(value);
  const prefix = extractReciboPrefix(value);

  const patterns = new Set<string>();

  if (core) patterns.add(`%${core}%`);
  if (significantCore && significantCore !== core) patterns.add(`%${significantCore}%`);
  if (prefix && core) patterns.add(`%${prefix}%${core}%`);
  if (prefix && significantCore) patterns.add(`%${prefix}%${significantCore}%`);
  if (digits && digits !== core && digits !== significantCore) patterns.add(`%${digits}%`);

  return Array.from(patterns);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function diff(a: number, b: number) {
  return round2(a - b);
}

function matches(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}

type ReciboMatchRow = {
  id: string;
  venda_id: string;
  vendedor_id: string | null;
  numero_recibo: string | null;
  valor_total: number | null;
  valor_taxas: number | null;
  data_venda: string | null;
};

type ReconcileResult = {
  checked: number;
  reconciled: number;
  updatedTaxes: number;
  stillPending: number;
};

async function persistExecutionLog(params: {
  client: any;
  companyId: string;
  actor: "cron" | "user";
  actorUserId?: string | null;
  status?: "ok" | "error";
  errorMessage?: string | null;
  result: ReconcileResult;
}) {
  const { client, companyId, actor, actorUserId = null, status = "ok", errorMessage = null, result } = params;
  try {
    await client.from("conciliacao_execucoes").insert({
      company_id: companyId,
      actor,
      actor_user_id: actorUserId,
      checked: result.checked,
      reconciled: result.reconciled,
      updated_taxes: result.updatedTaxes,
      still_pending: result.stillPending,
      status,
      error_message: errorMessage,
    } as any);
  } catch (error) {
    console.error("CONCILIACAO_EXECUCAO_LOG_ERROR", {
      message: (error as any)?.message ?? String(error),
      company_id: companyId,
      actor,
    });
  }
}

async function fetchReciboCandidates(params: {
  client: any;
  numero: string;
  companyId: string;
}): Promise<ReciboMatchRow[]> {
  const { client, numero, companyId } = params;
  const searchPatterns = buildReciboSearchPatterns(numero);
  const candidatesById = new Map<string, ReciboMatchRow>();

  const exactNumero = String(numero || "").trim();
  if (exactNumero) {
    const { data: exactRows, error: exactErr } = await client
      .from("vendas_recibos")
      .select("id, venda_id, numero_recibo, valor_total, valor_taxas, data_venda")
      .eq("numero_recibo", exactNumero)
      .limit(20);

    if (exactErr) throw exactErr;

    for (const row of exactRows || []) {
      const id = String((row as any)?.id || "").trim();
      if (!id) continue;
      candidatesById.set(id, {
        id,
        venda_id: String((row as any)?.venda_id || "").trim(),
        vendedor_id: null,
        numero_recibo: (row as any)?.numero_recibo ?? null,
        valor_total: (row as any)?.valor_total ?? null,
        valor_taxas: (row as any)?.valor_taxas ?? null,
        data_venda: (row as any)?.data_venda ?? null,
      });
    }
  }

  for (const pattern of searchPatterns) {
    const token = pattern.replace(/%/g, "").trim();
    if (!token) continue;

    const { data: rows, error } = await client
      .from("vendas_recibos")
      .select("id, venda_id, numero_recibo, valor_total, valor_taxas, data_venda")
      .ilike("numero_recibo", `%${token}%`)
      .limit(50);

    if (error) throw error;

    for (const row of rows || []) {
      const id = String((row as any)?.id || "").trim();
      if (!id || candidatesById.has(id)) continue;
      candidatesById.set(id, {
        id,
        venda_id: String((row as any)?.venda_id || "").trim(),
        vendedor_id: null,
        numero_recibo: (row as any)?.numero_recibo ?? null,
        valor_total: (row as any)?.valor_total ?? null,
        valor_taxas: (row as any)?.valor_taxas ?? null,
        data_venda: (row as any)?.data_venda ?? null,
      });
    }
  }

  const candidates = Array.from(candidatesById.values()).filter((row) => row.venda_id);
  if (candidates.length === 0) return [];

  const vendaIds = Array.from(new Set(candidates.map((row) => row.venda_id).filter(Boolean)));
  const { data: vendas, error: vendasErr } = await client
    .from("vendas")
    .select("id, company_id, vendedor_id")
    .in("id", vendaIds);

  if (vendasErr) throw vendasErr;

  const vendasMap = new Map<string, { company_id: string | null; vendedor_id: string | null }>();
  for (const row of vendas || []) {
    const id = String((row as any)?.id || "").trim();
    if (!id) continue;
    vendasMap.set(id, {
      company_id: String((row as any)?.company_id || "").trim() || null,
      vendedor_id: String((row as any)?.vendedor_id || "").trim() || null,
    });
  }

  return candidates
    .filter((row) => vendasMap.get(row.venda_id)?.company_id === companyId)
    .map((row) => ({
      ...row,
      vendedor_id: vendasMap.get(row.venda_id)?.vendedor_id || null,
    }));
}

export async function findReciboByNumero(params: {
  numero: string;
  companyId: string;
  valorLancamento?: number | null;
  valorTaxas?: number | null;
  client: any;
}): Promise<
  | {
      recibo: {
        id: string;
        venda_id: string;
        vendedor_id: string | null;
        numero_recibo: string | null;
        valor_total: number | null;
        valor_taxas: number | null;
        data_venda: string | null;
      };
      vendaCompanyId: string | null;
    }
  | null
> {
  const { numero, companyId, valorLancamento = null, valorTaxas = null, client } = params;

  const companyRecibos = await fetchReciboCandidates({ client, numero, companyId });

  const reciboExato = companyRecibos.find((item) => String(item.numero_recibo || "").trim() === numero);
  if (reciboExato) {
    return {
      recibo: {
        id: reciboExato.id,
        venda_id: reciboExato.venda_id,
        vendedor_id: reciboExato.vendedor_id,
        numero_recibo: reciboExato.numero_recibo,
        valor_total: reciboExato.valor_total,
        valor_taxas: reciboExato.valor_taxas,
        data_venda: reciboExato.data_venda,
      },
      vendaCompanyId: companyId,
    };
  }

  const compatíveis = companyRecibos.filter((item: any) =>
    numeroReciboMatches(numero, item?.numero_recibo)
  );

  if (compatíveis.length === 0) return null;

  const porValor = compatíveis.filter((item: any) =>
    valorLancamento == null ? true : matches(Number(item?.valor_total || 0), Number(valorLancamento || 0))
  );

  const porTaxa = porValor.filter((item: any) =>
    valorTaxas == null ? true : matches(Number(item?.valor_taxas || 0), Number(valorTaxas || 0))
  );

  const escolhido =
    (porTaxa.length === 1 ? porTaxa[0] : null) ||
    (porValor.length === 1 ? porValor[0] : null) ||
    (compatíveis.length === 1 ? compatíveis[0] : null);

  if (!escolhido) return null;

  return {
    recibo: {
      id: String((escolhido as any).id),
      venda_id: String((escolhido as any).venda_id),
      vendedor_id: String((escolhido as any).vendedor_id || "").trim() || null,
      numero_recibo: (escolhido as any).numero_recibo ?? null,
      valor_total: (escolhido as any).valor_total ?? null,
      valor_taxas: (escolhido as any).valor_taxas ?? null,
      data_venda: (escolhido as any).data_venda ?? null,
    },
    vendaCompanyId: companyId,
  };
}

async function reconcilePendentesCompany(params: {
  limit?: number;
  companyId: string;
  actor?: "cron" | "user";
  actorUserId?: string | null;
  client: any;
}): Promise<ReconcileResult> {
  const limit = Math.max(1, Math.min(500, Number(params.limit || 200)));
  const companyId = String(params.companyId);
  const actor = params.actor || "cron";
  const actorUserId = params.actorUserId ? String(params.actorUserId) : null;
  const dbClient = params.client;

  let query = dbClient
    .from("conciliacao_recibos")
    .select(
      "id, company_id, documento, movimento_data, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_venda_real, ranking_vendedor_id, conciliado"
    )
    .eq("conciliado", false)
    .in("status", ["BAIXA", "OPFAX"] as any)
    .eq("company_id", companyId)
    .order("movimento_data", { ascending: false })
    .limit(limit);

  const { data: pendentes, error } = await query;
  if (error) throw error;

  let checked = 0;
  let reconciled = 0;
  let updatedTaxes = 0;

  for (const row of (pendentes || []).filter((item: any) =>
    isConciliacaoEfetivada({ status: item?.status, descricao: item?.descricao })
  )) {
    checked += 1;
    const id = String((row as any).id);
    const cid = String((row as any).company_id);
    const documento = String((row as any).documento || "").trim();
    const movimentoData = String((row as any).movimento_data || "").trim() || null;
    const valorLanc = Number((row as any).valor_lancamentos || 0);
    const valorTaxas = Number((row as any).valor_taxas || 0);
    const valorDescontos = Number((row as any).valor_descontos || 0);
    const valorAbatimentos = Number((row as any).valor_abatimentos || 0);
    const valorVendaRealRaw = Number((row as any).valor_venda_real || 0);
    const valorComparacao =
      valorVendaRealRaw > 0 ? valorVendaRealRaw : Math.max(0, valorLanc - valorTaxas - valorDescontos - valorAbatimentos);

    if (!documento) {
      await dbClient
        .from("conciliacao_recibos")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", id);
      continue;
    }

    const found = await findReciboByNumero({
      numero: documento,
      companyId: cid,
      valorLancamento: valorComparacao,
      valorTaxas,
      client: dbClient,
    });

    if (!found) {
      await dbClient
        .from("conciliacao_recibos")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", id);
      continue;
    }

    const sistemaTotal = Number(found.recibo.valor_total || 0);
    const sistemaTaxas = Number(found.recibo.valor_taxas || 0);
    const sistemaDataVenda = String(found.recibo.data_venda || "").trim() || null;

    const matchTotal = matches(valorComparacao, sistemaTotal);
    const matchTaxas = matches(valorTaxas, sistemaTaxas);
    const diffTotal = diff(valorComparacao, sistemaTotal);
    const diffTaxas = diff(valorTaxas, sistemaTaxas);
    const shouldUpdateDataVenda = Boolean(movimentoData && movimentoData !== sistemaDataVenda);
    const rankingVendedorAtual = String((row as any).ranking_vendedor_id || "").trim() || null;
    const rankingVendedorResolvido = rankingVendedorAtual || found.recibo.vendedor_id || null;

    // Atualiza taxas do recibo no sistema quando o total bate, mas taxas divergem.
    // (isso é o que viabiliza comissionamento com taxas reais)
    if (matchTotal && !matchTaxas) {
      const { error: upErr } = await dbClient
        .from("vendas_recibos")
        .update({ valor_taxas: valorTaxas })
        .eq("id", found.recibo.id);
      if (!upErr) {
        updatedTaxes += 1;

        const { error: auditErr } = await dbClient
          .from("conciliacao_recibo_changes")
          .insert({
            company_id: cid,
            conciliacao_recibo_id: id,
            venda_id: found.recibo.venda_id,
            venda_recibo_id: found.recibo.id,
            numero_recibo: documento,
            field: "valor_taxas",
            old_value: sistemaTaxas,
            new_value: valorTaxas,
            actor,
            changed_by: actorUserId,
          } as any);

        if (auditErr) {
          console.error("CONCILIACAO_AUDIT_ERROR", {
            message: (auditErr as any)?.message ?? String(auditErr),
            venda_recibo_id: found.recibo.id,
            conciliacao_recibo_id: id,
          });
        }
      }
    }

    if (matchTotal && shouldUpdateDataVenda) {
      const { error: dataErr } = await dbClient
        .from("vendas_recibos")
        .update({ data_venda: movimentoData })
        .eq("id", found.recibo.id);

      if (dataErr) {
        console.error("CONCILIACAO_DATA_VENDA_UPDATE_ERROR", {
          message: (dataErr as any)?.message ?? String(dataErr),
          venda_recibo_id: found.recibo.id,
          conciliacao_recibo_id: id,
          movimento_data: movimentoData,
        });
      }
    }

    const conciliado = matchTotal; // total precisa bater; taxa pode ser ajustada

    if (conciliado) reconciled += 1;

    const updatePayload: Record<string, any> = {
      venda_id: found.recibo.venda_id,
      venda_recibo_id: found.recibo.id,
      sistema_valor_total: sistemaTotal,
      sistema_valor_taxas: matchTotal && !matchTaxas ? valorTaxas : sistemaTaxas,
      match_total: matchTotal,
      match_taxas: matchTaxas,
      diff_total: diffTotal,
      diff_taxas: diffTaxas,
      ranking_vendedor_id: rankingVendedorResolvido,
      conciliado,
      conciliado_em: conciliado ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
    };
    if (!rankingVendedorAtual && rankingVendedorResolvido) {
      updatePayload.ranking_assigned_at = new Date().toISOString();
    }

    await dbClient
      .from("conciliacao_recibos")
      .update(updatePayload)
      .eq("id", id);
  }

  const stillPending = Math.max(0, (pendentes || []).length - reconciled);
  return { checked, reconciled, updatedTaxes, stillPending };
}

export async function reconcilePendentes(params: {
  limit?: number;
  companyId?: string | null;
  actor?: "cron" | "user";
  actorUserId?: string | null;
  client?: any;
}): Promise<ReconcileResult> {
  const limit = Math.max(1, Math.min(500, Number(params.limit || 200)));
  const companyId = params.companyId ? String(params.companyId) : null;
  const actor = params.actor || "cron";
  const actorUserId = params.actorUserId ? String(params.actorUserId) : null;
  const dbClient = hasServiceRoleKey ? supabaseServer : params.client || null;

  if (!dbClient) {
    return { checked: 0, reconciled: 0, updatedTaxes: 0, stillPending: 0 };
  }

  if (companyId) {
    try {
      const result = await reconcilePendentesCompany({
        companyId,
        limit,
        actor,
        actorUserId,
        client: dbClient,
      });
      if (result.checked > 0) {
        await persistExecutionLog({
          client: dbClient,
          companyId,
          actor,
          actorUserId,
          status: "ok",
          result,
        });
      }
      return result;
    } catch (error) {
      await persistExecutionLog({
        client: dbClient,
        companyId,
        actor,
        actorUserId,
        status: "error",
        errorMessage: (error as any)?.message ?? String(error),
        result: { checked: 0, reconciled: 0, updatedTaxes: 0, stillPending: 0 },
      });
      throw error;
    }
  }

  const { data: companies, error: companiesErr } = await dbClient
    .from("companies")
    .select("id")
    .order("id", { ascending: true })
    .limit(5000);
  if (companiesErr) throw companiesErr;

  const totals: ReconcileResult = { checked: 0, reconciled: 0, updatedTaxes: 0, stillPending: 0 };

  for (const row of companies || []) {
    const nextCompanyId = String((row as any)?.id || "").trim();
    if (!nextCompanyId) continue;
    try {
      const result = await reconcilePendentesCompany({
        companyId: nextCompanyId,
        limit,
        actor,
        actorUserId,
        client: dbClient,
      });
      if (result.checked > 0) {
        await persistExecutionLog({
          client: dbClient,
          companyId: nextCompanyId,
          actor,
          actorUserId,
          status: "ok",
          result,
        });
      }
      totals.checked += result.checked;
      totals.reconciled += result.reconciled;
      totals.updatedTaxes += result.updatedTaxes;
      totals.stillPending += result.stillPending;
    } catch (error) {
      await persistExecutionLog({
        client: dbClient,
        companyId: nextCompanyId,
        actor,
        actorUserId,
        status: "error",
        errorMessage: (error as any)?.message ?? String(error),
        result: { checked: 0, reconciled: 0, updatedTaxes: 0, stillPending: 0 },
      });
      console.error("CONCILIACAO_COMPANY_RECONCILE_ERROR", {
        message: (error as any)?.message ?? String(error),
        company_id: nextCompanyId,
      });
    }
  }

  return totals;
}
