import { supabaseServer, hasServiceRoleKey } from "../../../../lib/supabaseServer";

const EPS = 0.01;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function diff(a: number, b: number) {
  return round2(a - b);
}

function matches(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}

async function findReciboByNumero(params: {
  numero: string;
  companyId: string;
}): Promise<
  | {
      recibo: {
        id: string;
        venda_id: string;
        numero_recibo: string | null;
        valor_total: number | null;
        valor_taxas: number | null;
      };
      vendaCompanyId: string | null;
    }
  | null
> {
  const { numero, companyId } = params;

  const { data: recibo, error } = await supabaseServer
    .from("vendas_recibos")
    .select("id, venda_id, numero_recibo, valor_total, valor_taxas")
    .eq("numero_recibo", numero)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!recibo) return null;

  const { data: venda, error: vendaErr } = await supabaseServer
    .from("vendas")
    .select("company_id")
    .eq("id", recibo.venda_id)
    .maybeSingle();
  if (vendaErr) throw vendaErr;

  const vendaCompanyId = (venda as any)?.company_id ? String((venda as any).company_id) : null;
  if (!vendaCompanyId || vendaCompanyId !== companyId) return null;

  return {
    recibo: {
      id: String((recibo as any).id),
      venda_id: String((recibo as any).venda_id),
      numero_recibo: (recibo as any).numero_recibo ?? null,
      valor_total: (recibo as any).valor_total ?? null,
      valor_taxas: (recibo as any).valor_taxas ?? null,
    },
    vendaCompanyId,
  };
}

export async function reconcilePendentes(params: {
  limit?: number;
  companyId?: string | null;
  actor?: "cron" | "user";
  actorUserId?: string | null;
}): Promise<{
  checked: number;
  reconciled: number;
  updatedTaxes: number;
  stillPending: number;
}> {
  const limit = Math.max(1, Math.min(500, Number(params.limit || 200)));
  const companyId = params.companyId ? String(params.companyId) : null;
  const actor = params.actor || "cron";
  const actorUserId = params.actorUserId ? String(params.actorUserId) : null;

  if (!hasServiceRoleKey) {
    // Sem service role, o cron não consegue operar com segurança (sem sessão/RLS).
    return { checked: 0, reconciled: 0, updatedTaxes: 0, stillPending: 0 };
  }

  let query = supabaseServer
    .from("conciliacao_recibos")
    .select(
      "id, company_id, documento, status, valor_lancamentos, valor_taxas, conciliado"
    )
    .eq("conciliado", false)
    .in("status", ["BAIXA", "OPFAX"] as any)
    .order("movimento_data", { ascending: false })
    .limit(limit);

  if (companyId) query = query.eq("company_id", companyId);

  const { data: pendentes, error } = await query;
  if (error) throw error;

  let checked = 0;
  let reconciled = 0;
  let updatedTaxes = 0;

  for (const row of pendentes || []) {
    checked += 1;
    const id = String((row as any).id);
    const cid = String((row as any).company_id);
    const documento = String((row as any).documento || "").trim();
    const valorLanc = Number((row as any).valor_lancamentos || 0);
    const valorTaxas = Number((row as any).valor_taxas || 0);

    if (!documento) {
      await supabaseServer
        .from("conciliacao_recibos")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", id);
      continue;
    }

    const found = await findReciboByNumero({ numero: documento, companyId: cid });

    if (!found) {
      await supabaseServer
        .from("conciliacao_recibos")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", id);
      continue;
    }

    const sistemaTotal = Number(found.recibo.valor_total || 0);
    const sistemaTaxas = Number(found.recibo.valor_taxas || 0);

    const matchTotal = matches(valorLanc, sistemaTotal);
    const matchTaxas = matches(valorTaxas, sistemaTaxas);
    const diffTotal = diff(valorLanc, sistemaTotal);
    const diffTaxas = diff(valorTaxas, sistemaTaxas);

    // Atualiza taxas do recibo no sistema quando o total bate, mas taxas divergem.
    // (isso é o que viabiliza comissionamento com taxas reais)
    if (matchTotal && !matchTaxas) {
      const { error: upErr } = await supabaseServer
        .from("vendas_recibos")
        .update({ valor_taxas: valorTaxas })
        .eq("id", found.recibo.id);
      if (!upErr) {
        updatedTaxes += 1;

        const { error: auditErr } = await supabaseServer
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

    const conciliado = matchTotal; // total precisa bater; taxa pode ser ajustada

    if (conciliado) reconciled += 1;

    await supabaseServer
      .from("conciliacao_recibos")
      .update({
        venda_id: found.recibo.venda_id,
        venda_recibo_id: found.recibo.id,
        sistema_valor_total: sistemaTotal,
        sistema_valor_taxas: matchTotal && !matchTaxas ? valorTaxas : sistemaTaxas,
        match_total: matchTotal,
        match_taxas: matchTaxas,
        diff_total: diffTotal,
        diff_taxas: diffTaxas,
        conciliado,
        conciliado_em: conciliado ? new Date().toISOString() : null,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  const stillPending = Math.max(0, (pendentes || []).length - reconciled);
  return { checked, reconciled, updatedTaxes, stillPending };
}
