import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import { isConciliacaoEfetivada } from "../../../../lib/conciliacao/business";

function startOfMonth(value: string) {
  return `${value}-01`;
}

function endOfMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const d = new Date(year, month, 0);
  return d.toISOString().slice(0, 10);
}

function buildDateSeries(inicio: string, fim: string) {
  const out: string[] = [];
  const current = new Date(`${inicio}T12:00:00`);
  const limit = new Date(`${fim}T12:00:00`);
  while (current <= limit) {
    out.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return out;
}

function isOperacionalStatus(row: any) {
  return isConciliacaoEfetivada({
    status: row?.status,
    descricao: row?.descricao,
  });
}

function isPendingConciliacao(row: any) {
  return isOperacionalStatus(row) && !Boolean(row?.conciliado);
}

function isRankingPending(row: any) {
  if (!isOperacionalStatus(row)) return false;
  const vendaId = String(row?.venda_id || "").trim();
  const rankingVendedorId = String(row?.ranking_vendedor_id || "").trim();
  return !vendaId && !rankingVendedorId;
}

async function fetchResumoRows(client: any, companyId: string, historyStart: string) {
  const pageSize = 1000;
  const rows: any[] = [];

  for (let offset = 0; offset < 50000; offset += pageSize) {
    const { data, error } = await client
      .from("conciliacao_recibos")
      .select("id, movimento_data, status, descricao, conciliado, venda_id, ranking_vendedor_id")
      .eq("company_id", companyId)
      .gte("movimento_data", historyStart)
      .order("movimento_data", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
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
    const today = now.toISOString().slice(0, 10);

    const rows = await fetchResumoRows(client, companyId, historyStart);

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
        pendentesConciliacao: 0,
        pendentesImportacao: 0,
        pendentesRanking: 0,
        atribuidosRanking: 0,
        encontradosSistema: 0,
        hasBaixa: false,
      };
      monthBucket.total += 1;
      if (isOperacionalStatus(row)) monthBucket.hasBaixa = true;
      if (row?.conciliado) monthBucket.conciliadosSistema += 1;
      if (isPendingConciliacao(row)) monthBucket.pendentesConciliacao += 1;
      if (isRankingPending(row)) monthBucket.pendentesRanking += 1;
      if (String(row?.venda_id || "").trim()) {
        monthBucket.encontradosSistema += 1;
      }
      if (!String(row?.venda_id || "").trim() && String(row?.ranking_vendedor_id || "").trim()) {
        monthBucket.atribuidosRanking += 1;
      }
      byMonthMap.set(monthKey, monthBucket);

      if (monthKey === selectedMonth) {
        const dayBucket = byDayMap.get(date) || {
          date,
          total: 0,
          conciliadosSistema: 0,
          pendentesConciliacao: 0,
          pendentesImportacao: 0,
          pendentesRanking: 0,
          atribuidosRanking: 0,
          encontradosSistema: 0,
          status: "OK",
          hasBaixa: false,
        };
        dayBucket.total += 1;
        if (isOperacionalStatus(row)) dayBucket.hasBaixa = true;
        if (row?.conciliado) dayBucket.conciliadosSistema += 1;
        if (isPendingConciliacao(row)) dayBucket.pendentesConciliacao += 1;
        if (isRankingPending(row)) dayBucket.pendentesRanking += 1;
        if (!String(row?.venda_id || "").trim() && String(row?.ranking_vendedor_id || "").trim()) {
          dayBucket.atribuidosRanking += 1;
        }
        byDayMap.set(date, dayBucket);
      }
    });

    const selectedMonthStart = startOfMonth(selectedMonth);
    const selectedMonthEnd = selectedMonth === today.slice(0, 7) ? today : endOfMonth(selectedMonth);

    buildDateSeries(selectedMonthStart, selectedMonthEnd).forEach((date) => {
      const existing = byDayMap.get(date);
      if (!existing) {
        byDayMap.set(date, {
          date,
          total: 0,
          conciliadosSistema: 0,
          pendentesConciliacao: 0,
          pendentesImportacao: 1,
          pendentesRanking: 0,
          atribuidosRanking: 0,
          status: "IMPORTACAO_PENDENTE",
        });
        const monthBucket = byMonthMap.get(selectedMonth) || {
          month: selectedMonth,
          total: 0,
          conciliadosSistema: 0,
          pendentesConciliacao: 0,
          pendentesImportacao: 0,
          pendentesRanking: 0,
          atribuidosRanking: 0,
          encontradosSistema: 0,
        };
        monthBucket.pendentesImportacao += 1;
        byMonthMap.set(selectedMonth, monthBucket);
        return;
      }

      if (!existing.hasBaixa) {
        existing.pendentesImportacao = 1;
        existing.status = "IMPORTACAO_PENDENTE";
        const monthBucket = byMonthMap.get(selectedMonth) || {
          month: selectedMonth,
          total: 0,
          conciliadosSistema: 0,
          pendentesConciliacao: 0,
          pendentesImportacao: 0,
          pendentesRanking: 0,
          atribuidosRanking: 0,
          encontradosSistema: 0,
          hasBaixa: false,
        };
        monthBucket.pendentesImportacao += 1;
        byMonthMap.set(selectedMonth, monthBucket);
      } else {
        existing.pendentesImportacao = 0;
        existing.status = existing.pendentesConciliacao > 0 ? "CONCILIACAO_PENDENTE" : "OK";
      }
      byDayMap.set(date, existing);
    });

    const selectedMonthBucket = byMonthMap.get(selectedMonth) || {
      month: selectedMonth,
      total: 0,
      conciliadosSistema: 0,
      pendentesConciliacao: 0,
      pendentesImportacao: 0,
      pendentesRanking: 0,
      atribuidosRanking: 0,
      encontradosSistema: 0,
      hasBaixa: false,
    };

    const totals = {
      importados: selectedMonthBucket.total,
      conciliadosSistema: selectedMonthBucket.conciliadosSistema,
      pendentesConciliacao: selectedMonthBucket.pendentesConciliacao,
      pendentesImportacao: selectedMonthBucket.pendentesImportacao,
      pendentesRanking: selectedMonthBucket.pendentesRanking,
      encontradosSistema: selectedMonthBucket.encontradosSistema,
      atribuidosRanking: selectedMonthBucket.atribuidosRanking,
    };

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
