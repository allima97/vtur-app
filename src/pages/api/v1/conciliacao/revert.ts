import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import { hasServiceRoleKey, supabaseServer } from "../../../../lib/supabaseServer";

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
        3,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    if (!hasServiceRoleKey) {
      return new Response("Service role nao configurada para reversao.", { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as {
      companyId?: string | null;
      changeIds?: string[] | null;
      revertAll?: boolean | null;
      limit?: number | null;
    } | null;

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const revertAll = Boolean(body?.revertAll);
    const limit = Math.max(1, Math.min(500, Number(body?.limit || 200)));
    const ids = Array.isArray(body?.changeIds)
      ? body!.changeIds!.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    if (!revertAll && ids.length === 0) {
      return new Response("Nenhuma alteracao selecionada.", { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // Determina quais recibos (venda_recibo_id) serão revertidos.
    let targetReciboIds: string[] = [];

    if (revertAll) {
      const { data, error } = await supabaseServer
        .from("conciliacao_recibo_changes")
        .select("venda_recibo_id")
        .eq("company_id", companyId)
        .is("reverted_at", null)
        .limit(limit);
      if (error) throw error;
      targetReciboIds = Array.from(
        new Set(
          (data || [])
            .map((r: any) => (r?.venda_recibo_id ? String(r.venda_recibo_id) : ""))
            .filter(Boolean)
        )
      );
    } else {
      const chunk = ids.slice(0, 500);
      const { data, error } = await supabaseServer
        .from("conciliacao_recibo_changes")
        .select("venda_recibo_id")
        .in("id", chunk)
        .eq("company_id", companyId)
        .is("reverted_at", null);
      if (error) throw error;
      targetReciboIds = Array.from(
        new Set(
          (data || [])
            .map((r: any) => (r?.venda_recibo_id ? String(r.venda_recibo_id) : ""))
            .filter(Boolean)
        )
      );
    }

    if (targetReciboIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, attempted: 0, reverted: 0, errored: 0, total: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Busca todas as alterações pendentes desses recibos (para reverter para o valor original).
    const { data: pendingChanges, error: pendingErr } = await supabaseServer
      .from("conciliacao_recibo_changes")
      .select(
        "id, venda_recibo_id, conciliacao_recibo_id, old_value, changed_at"
      )
      .eq("company_id", companyId)
      .in("venda_recibo_id", targetReciboIds)
      .is("reverted_at", null)
      .order("changed_at", { ascending: true })
      .limit(2000);
    if (pendingErr) throw pendingErr;

    const changesByRecibo = new Map<
      string,
      { earliestOld: any; latestConciliacaoId: string | null; changeIds: string[] }
    >();

    (pendingChanges || []).forEach((row: any) => {
      const reciboId = row?.venda_recibo_id ? String(row.venda_recibo_id) : "";
      if (!reciboId) return;
      const bucket = changesByRecibo.get(reciboId) || {
        earliestOld: undefined,
        latestConciliacaoId: null as string | null,
        changeIds: [] as string[],
      };
      bucket.changeIds.push(String(row.id));
      if (bucket.earliestOld === undefined) bucket.earliestOld = row.old_value ?? null;
      // Como está ordenado asc, a última conciliacao_recibo_id encontrada é a mais recente.
      bucket.latestConciliacaoId = row?.conciliacao_recibo_id ? String(row.conciliacao_recibo_id) : bucket.latestConciliacaoId;
      changesByRecibo.set(reciboId, bucket);
    });

    let attempted = 0;
    let reverted = 0;
    let errored = 0;

    for (const [reciboId, meta] of changesByRecibo.entries()) {
      attempted += 1;

      const oldValue = meta.earliestOld ?? null;

      const { error: upErr } = await supabaseServer
        .from("vendas_recibos")
        .update({ valor_taxas: oldValue })
        .eq("id", reciboId);

      if (upErr) {
        errored += 1;
        continue;
      }

      if (meta.latestConciliacaoId) {
        const { data: conc, error: concErr } = await supabaseServer
          .from("conciliacao_recibos")
          .select("id, valor_taxas")
          .eq("id", meta.latestConciliacaoId)
          .maybeSingle();
        if (!concErr && conc) {
          const fileTaxas = Number((conc as any).valor_taxas || 0);
          const sysTaxas = Number(oldValue || 0);
          const matchTaxas = matches(fileTaxas, sysTaxas);
          const diffTaxas = diff(fileTaxas, sysTaxas);
          await supabaseServer
            .from("conciliacao_recibos")
            .update({
              sistema_valor_taxas: oldValue,
              match_taxas: matchTaxas,
              diff_taxas: diffTaxas,
              last_checked_at: nowIso,
            })
            .eq("id", meta.latestConciliacaoId);
        }
      }

      const { error: revErr } = await supabaseServer
        .from("conciliacao_recibo_changes")
        .update({
          reverted_at: nowIso,
          reverted_by: user.id,
          revert_reason: "manual",
        })
        .eq("company_id", companyId)
        .eq("venda_recibo_id", reciboId)
        .is("reverted_at", null);

      if (revErr) {
        errored += 1;
        continue;
      }

      reverted += 1;
    }

    return new Response(
      JSON.stringify({ ok: true, attempted, reverted, errored, total: changesByRecibo.size }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Erro conciliacao/revert", err);
    return new Response(err?.message || "Erro ao reverter alteracoes.", { status: 500 });
  }
};
