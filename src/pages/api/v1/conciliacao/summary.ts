import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";

function startOfMonth(value: string) {
  return `${value}-01`;
}

function endOfMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const d = new Date(year, month, 0);
  return d.toISOString().slice(0, 10);
}

function isOperacionalStatus(status?: string | null) {
  const raw = String(status || "").toUpperCase();
  return raw === "BAIXA" || raw === "OPFAX";
}

function isRankingPending(row: any) {
  if (!isOperacionalStatus(row?.status)) return false;
  const vendaId = String(row?.venda_id || "").trim();
  const rankingVendedorId = String(row?.ranking_vendedor_id || "").trim();
  return !vendaId && !rankingVendedorId;
}

export const GET: APIRoute = async ({ request }) => {
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
        1,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const companyId = resolveCompanyId(scope, url.searchParams.get("company_id"));
    if (!companyId) {
      return new Response(
        JSON.stringify({ totals: {}, byMonth: [], byDay: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const month = String(url.searchParams.get("month") || "").trim();
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const selectedMonth = /^\d{4}-\d{2}$/.test(month) ? month : defaultMonth;
    const historyStart = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

    const { data, error } = await client
      .from("conciliacao_recibos")
      .select("id, movimento_data, status, conciliado, venda_id, ranking_vendedor_id")
      .eq("company_id", companyId)
      .gte("movimento_data", historyStart)
      .order("movimento_data", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const totals = {
      importados: rows.length,
      conciliadosSistema: rows.filter((row: any) => Boolean(row?.conciliado)).length,
      pendentesRanking: rows.filter((row: any) => isRankingPending(row)).length,
      encontradosSistema: rows.filter((row: any) => Boolean(String(row?.venda_id || "").trim())).length,
      atribuidosRanking: rows.filter(
        (row: any) => !String(row?.venda_id || "").trim() && Boolean(String(row?.ranking_vendedor_id || "").trim())
      ).length,
    };

    const byMonthMap = new Map<string, any>();
    const byDayMap = new Map<string, any>();

    rows.forEach((row: any) => {
      const date = String(row?.movimento_data || "").trim();
      if (!date) return;
      const monthKey = date.slice(0, 7);
      const monthBucket = byMonthMap.get(monthKey) || {
        month: monthKey,
        total: 0,
        conciliadosSistema: 0,
        pendentesRanking: 0,
        atribuidosRanking: 0,
      };
      monthBucket.total += 1;
      if (row?.conciliado) monthBucket.conciliadosSistema += 1;
      if (isRankingPending(row)) monthBucket.pendentesRanking += 1;
      if (!String(row?.venda_id || "").trim() && String(row?.ranking_vendedor_id || "").trim()) {
        monthBucket.atribuidosRanking += 1;
      }
      byMonthMap.set(monthKey, monthBucket);

      if (monthKey === selectedMonth) {
        const dayBucket = byDayMap.get(date) || {
          date,
          total: 0,
          conciliadosSistema: 0,
          pendentesRanking: 0,
          atribuidosRanking: 0,
        };
        dayBucket.total += 1;
        if (row?.conciliado) dayBucket.conciliadosSistema += 1;
        if (isRankingPending(row)) dayBucket.pendentesRanking += 1;
        if (!String(row?.venda_id || "").trim() && String(row?.ranking_vendedor_id || "").trim()) {
          dayBucket.atribuidosRanking += 1;
        }
        byDayMap.set(date, dayBucket);
      }
    });

    const byMonth = Array.from(byMonthMap.values()).sort((a, b) => b.month.localeCompare(a.month));
    const byDay = Array.from(byDayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    return new Response(
      JSON.stringify({
        month: selectedMonth,
        range: { inicio: startOfMonth(selectedMonth), fim: endOfMonth(selectedMonth) },
        totals,
        byMonth,
        byDay,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=5",
          Vary: "Cookie",
        },
      }
    );
  } catch (err: any) {
    console.error("Erro conciliacao/summary", err);
    return new Response(err?.message || "Erro ao carregar resumo da conciliacao.", { status: 500 });
  }
};