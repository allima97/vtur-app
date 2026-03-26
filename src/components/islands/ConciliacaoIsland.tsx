import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProgressSpinner } from "primereact/progressspinner";
import { Paginator } from "primereact/paginator";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import ConfirmDialog from "../ui/ConfirmDialog";
import {
  buildConciliacaoMetrics,
  inferConciliacaoStatus,
  isConciliacaoEfetivada,
  isConciliacaoImportavel,
  normalizeConciliacaoDescricaoKey,
  resolveConciliacaoStatus,
} from "../../lib/conciliacao/business";

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

type CompanyRow = {
  id: string;
  nome_fantasia: string | null;
};

type UserCtx = {
  userId: string;
  papel: Papel;
  companyId: string | null;
  companyNome: string | null;
};

type ConciliacaoItem = {
  id: string;
  company_id: string;
  documento: string;
  movimento_data: string | null;
  status: string;
  descricao: string | null;
  valor_lancamentos: number | null;
  valor_taxas: number | null;
  valor_descontos: number | null;
  valor_abatimentos: number | null;
  valor_calculada_loja: number | null;
  valor_visao_master: number | null;
  valor_opfax: number | null;
  valor_saldo: number | null;
  valor_venda_real: number | null;
  valor_comissao_loja: number | null;
  percentual_comissao_loja: number | null;
  faixa_comissao: string | null;
  is_seguro_viagem: boolean;
  origem: string | null;
  conciliado: boolean;
  match_total: boolean | null;
  match_taxas: boolean | null;
  sistema_valor_total: number | null;
  sistema_valor_taxas: number | null;
  diff_total: number | null;
  diff_taxas: number | null;
  venda_id: string | null;
  venda_recibo_id: string | null;
  ranking_vendedor_id: string | null;
  ranking_produto_id: string | null;
  ranking_assigned_at: string | null;
  ranking_vendedor?: { id: string; nome_completo: string | null } | null;
  ranking_produto?: { id: string; nome: string | null } | null;
  last_checked_at: string | null;
  conciliado_em: string | null;
  created_at: string;
  updated_at: string;
};

type RankingAssigneeOption = {
  id: string;
  nome_completo: string;
  tipo?: string | null;
};

type RankingProdutoOption = {
  id: string;
  nome: string;
};

type ConciliacaoResumoMes = {
  month: string;
  total: number;
  conciliadosSistema: number;
  pendentesConciliacao: number;
  pendentesImportacao?: number;
  pendentesRanking: number;
  atribuidosRanking: number;
};

type ConciliacaoResumoDia = {
  date: string;
  total: number;
  conciliadosSistema: number;
  pendentesConciliacao: number;
  pendentesImportacao?: number;
  pendentesRanking: number;
  atribuidosRanking: number;
  status?: string;
};

type ConciliacaoResumo = {
  month: string;
  totals?: {
    importados?: number;
    conciliadosSistema?: number;
    pendentesConciliacao?: number;
    pendentesImportacao?: number;
    pendentesRanking?: number;
    encontradosSistema?: number;
    atribuidosRanking?: number;
  };
  byMonth?: ConciliacaoResumoMes[];
  byDay?: ConciliacaoResumoDia[];
};

type ConciliacaoExecucao = {
  id: string;
  company_id: string;
  actor: string;
  actor_user_id: string | null;
  checked: number;
  reconciled: number;
  updated_taxes: number;
  still_pending: number;
  status: string;
  error_message: string | null;
  created_at: string;
  actor_user?: { nome_completo?: string | null; email?: string | null } | null;
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type ConciliacaoSection = "registros" | "resumo" | "importacao" | "alteracoes" | "pendentes" | "pendentes_ranking" | "visao_geral";
type ConciliacaoShortcut =
  | "importados"
  | "pendentes_conciliacao"
  | "dias_pendentes_importacao"
  | "pendentes_ranking"
  | "conciliados_sistema"
  | "atribuidos_ranking";
type ConciliacaoListFilters = {
  somentePendentes: boolean;
  monthFilter: string;
  dayFilter: string;
  rankingStatusFilter: "all" | "pending" | "assigned" | "system";
};

type ConciliacaoChange = {
  id: string;
  company_id: string;
  conciliacao_recibo_id: string | null;
  venda_id: string | null;
  venda_recibo_id: string | null;
  numero_recibo: string | null;
  field: string;
  old_value: number | null;
  new_value: number | null;
  actor: string;
  changed_by: string | null;
  changed_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
  revert_reason: string | null;
  changed_by_user?: { nome_completo?: string | null; email?: string | null } | null;
  reverted_by_user?: { nome_completo?: string | null; email?: string | null } | null;
};

type ConciliacaoChangeGroup = {
  key: string;
  venda_recibo_id: string | null;
  numero_recibo: string | null;
  count_total: number;
  count_pendentes: number;
  old_value: number | null;
  new_value: number | null;
  last_changed_at: string;
  actor: string;
  changed_by_label: string;
  reverted_at: string | null;
  pending_change_ids: string[];
};

type LinhaInput = {
  documento: string;
  movimento_data?: string | null;
  status?: "BAIXA" | "OPFAX" | "ESTORNO" | "OUTRO";
  descricao?: string | null;
  descricao_chave?: string | null;
  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;
  valor_venda_real?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: string | null;
  is_seguro_viagem?: boolean | null;
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;
  venda_recibo_id?: string | null;
  venda_id?: string | null;
  origem?: string | null;
  raw?: any;
};

type LinhaRodapeImportacao = {
  label: "SUBTOTAL" | "TOTAL";
  valor_lancamentos: number | null;
  valor_taxas: number | null;
  valor_descontos: number | null;
  valor_abatimentos: number | null;
  valor_calculada_loja: number | null;
  valor_visao_master: number | null;
  valor_opfax: number | null;
  valor_saldo: number | null;
  valor_venda_real: number | null;
  valor_comissao_loja: number | null;
  percentual_comissao_loja: number | null;
};

type ConciliacaoParseResult = {
  movimentoData: string | null;
  linhas: LinhaInput[];
  rodape: LinhaRodapeImportacao[];
};

type PreviewMoneyField =
  | "valor_lancamentos"
  | "valor_taxas"
  | "valor_descontos"
  | "valor_abatimentos"
  | "valor_comissao_loja";

function parsePtBrNumber(value: any): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let cleaned = raw.replace(/\s+/g, "");
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseLegacyXlsNumber(value: any): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return parseLegacyXlsNumber(String(value));
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (raw.includes(",") || /[A-Za-z]/.test(raw)) {
    return parsePtBrNumber(raw);
  }

  const sign = raw.startsWith("-") ? -1 : 1;
  const unsigned = raw.replace(/^-/, "");
  const parts = unsigned.split(".");
  const digits = parts.join("");
  if (!digits || /\D/.test(digits)) return parsePtBrNumber(raw);

  let scaledDigits = digits;
  if (parts.length > 1) {
    const fracLength = parts[parts.length - 1]?.length ?? 0;
    if (fracLength === 4) scaledDigits = `${digits}0`;
  }

  const num = Number(scaledDigits);
  if (!Number.isFinite(num)) return null;
  return (sign * num) / 100;
}

function parseMovimentoDateFromTxt(text: string): string | null {
  const m = text.match(/Movimenta[cç][aã]o\s+do\s+Dia:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;
  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

const MONTH_PT: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

function parseMovimentoDateFromFileName(fileName: string): string | null {
  const raw = String(fileName || "");
  // Numeric: dd-mm-yyyy or dd-mm-yy
  const m = raw.match(/(\d{1,2})-(\d{2})-(\d{2,4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2]}-${dd}`;
  }
  // Text month: dd-mmm-yyyy  (e.g. 18-fev-2026)
  const mt = raw.match(/(\d{1,2})-([a-z\u00e0-\u00fc]{2,4})-(\d{2,4})/i);
  if (mt) {
    const mm = MONTH_PT[mt[2].toLowerCase().slice(0, 3)];
    if (!mm) return null;
    const dd = mt[1].padStart(2, "0");
    const yyyy = mt[3].length === 2 ? `20${mt[3]}` : mt[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function enrichLinha(base: LinhaInput): LinhaInput {
  const metrics = buildConciliacaoMetrics({
    descricao: base.descricao,
    valorLancamentos: base.valor_lancamentos,
    valorTaxas: base.valor_taxas,
    valorDescontos: base.valor_descontos,
    valorAbatimentos: base.valor_abatimentos,
    valorSaldo: base.valor_saldo,
    valorOpfax: base.valor_opfax,
    valorCalculadaLoja: base.valor_calculada_loja,
    valorVisaoMaster: base.valor_visao_master,
    valorComissaoLoja: base.valor_comissao_loja,
    percentualComissaoLoja: base.percentual_comissao_loja,
  });

  return {
    ...base,
    status: metrics.status,
    descricao_chave: metrics.descricaoChave,
    valor_venda_real: metrics.valorVendaReal,
    valor_comissao_loja: metrics.valorComissaoLoja,
    percentual_comissao_loja: metrics.percentualComissaoLoja,
    faixa_comissao: metrics.faixaComissao,
    is_seguro_viagem: metrics.isSeguroViagem,
  };
}

function resolveRodapeImportacaoLabel(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeConciliacaoDescricaoKey(value);
    if (normalized === "SUBTOTAL" || normalized === "TOTAL") {
      return normalized as LinhaRodapeImportacao["label"];
    }
  }
  return null;
}

function buildRodapeImportacao(base: Omit<LinhaRodapeImportacao, "valor_venda_real" | "valor_comissao_loja" | "percentual_comissao_loja">) {
  const metrics = buildConciliacaoMetrics({
    descricao: base.label,
    valorLancamentos: base.valor_lancamentos,
    valorTaxas: base.valor_taxas,
    valorDescontos: base.valor_descontos,
    valorAbatimentos: base.valor_abatimentos,
    valorSaldo: base.valor_saldo,
    valorOpfax: base.valor_opfax,
    valorCalculadaLoja: base.valor_calculada_loja,
    valorVisaoMaster: base.valor_visao_master,
  });

  return {
    ...base,
    valor_venda_real: metrics.valorVendaReal,
    valor_comissao_loja: metrics.valorComissaoLoja,
    percentual_comissao_loja: metrics.percentualComissaoLoja,
  } satisfies LinhaRodapeImportacao;
}

function parseConciliacaoTxt(text: string, origem: string): ConciliacaoParseResult {
  const movimentoData = parseMovimentoDateFromTxt(text);
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\t/g, " "));

  const linhas: LinhaInput[] = [];
  const rodape: LinhaRodapeImportacao[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^DOCUMENTO\b/i.test(trimmed)) continue;
    if (/^CALCULADA\s+TOTAL\b/i.test(trimmed)) continue;

    const parts = trimmed.split(/\s{2,}/).filter(Boolean);
    const footerLabel = resolveRodapeImportacaoLabel(parts[0]);
    if (footerLabel) {
      rodape.push(
        buildRodapeImportacao({
          label: footerLabel,
          valor_lancamentos: parsePtBrNumber(parts[1]),
          valor_taxas: parsePtBrNumber(parts[2]),
          valor_descontos: parsePtBrNumber(parts[3]),
          valor_abatimentos: parsePtBrNumber(parts[4]),
          valor_calculada_loja: parsePtBrNumber(parts[5]),
          valor_visao_master: parsePtBrNumber(parts[7]),
          valor_opfax: parsePtBrNumber(parts[10]),
          valor_saldo: parsePtBrNumber(parts[11]),
        })
      );
      continue;
    }

    if (!/^\d{4}-\d{10}\b/.test(trimmed)) continue;
    if (parts.length < 4) continue;

    const documento = String(parts[0] || "").trim();
    const descricao = String(parts[1] || "").trim();

    const valor_lancamentos = parsePtBrNumber(parts[2]);
    const valor_taxas = parsePtBrNumber(parts[3]);
    const valor_descontos = parsePtBrNumber(parts[4]);
    const valor_abatimentos = parsePtBrNumber(parts[5]);
    const valor_calculada_loja = parsePtBrNumber(parts[6]);
    const valor_visao_master = parsePtBrNumber(parts[8]);
    const valor_opfax = parsePtBrNumber(parts[11]);
    const valor_saldo = parsePtBrNumber(parts[12]);

    linhas.push(enrichLinha({
      documento,
      movimento_data: movimentoData,
      status: inferConciliacaoStatus(descricao),
      descricao,
      valor_lancamentos,
      valor_taxas,
      valor_descontos,
      valor_abatimentos,
      valor_calculada_loja,
      valor_visao_master,
      valor_opfax,
      valor_saldo,
      origem,
      raw: { parts },
    }));
  }

  return { movimentoData, linhas, rodape };
}

async function parseConciliacaoXls(file: File, origem: string): Promise<ConciliacaoParseResult> {
  const module = await import("xlsx");
  const XLSX = (module as any).default ?? module;
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const isLegacyXls = /\.xls$/i.test(origem) && !/\.xlsx$/i.test(origem);
  const sheets = (wb.SheetNames || [])
    .map((sheetName) => {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
        raw: !isLegacyXls,
      }) as any[][];
      const headerIdx = rows.findIndex((r) =>
        r.some((cell) =>
          String(cell || "")
            .toUpperCase()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .includes("DOCUMENTO")
        )
      );
      return { sheetName, rows, headerIdx };
    })
    .filter((entry) => Array.isArray(entry.rows) && entry.rows.length > 0);

  const selectedSheet = sheets.find((entry) => entry.headerIdx >= 0) || null;
  if (!selectedSheet) {
    return { movimentoData: parseMovimentoDateFromFileName(origem), linhas: [], rodape: [] };
  }

  const rows = selectedSheet.rows;

  const movimentoDateCell = sheets
    .flatMap((entry) => entry.rows)
    .flat()
    .map((cell) => String(cell || "").trim())
    .find((cell) => /Movimenta[cç][aã]o\s+do\s+Dia:/i.test(cell));
  const movimentoDataFromCell = movimentoDateCell ? parseMovimentoDateFromTxt(movimentoDateCell) : null;
  const movimentoDataFromFile = parseMovimentoDateFromFileName(origem);
  let movimentoData = movimentoDataFromCell || movimentoDataFromFile;
  if (!movimentoData) {
    // Fallback: file may be HTML saved as .xls — date is in <h2> outside tables
    try {
      const rawText = new TextDecoder("iso-8859-1").decode(arrayBuffer);
      movimentoData = parseMovimentoDateFromTxt(rawText) || null;
    } catch {
      // ignore decode errors
    }
  }

  const headerIdx = selectedSheet.headerIdx;

  const headerRow = rows[headerIdx].map((c) => String(c || "").trim());
  const colIndexAny = (needles: string[], fallbackIndex = -1) => {
    const norm = (v: any) =>
      String(v || "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
    const headerNorm = headerRow.map(norm);
    const wanted = needles.map(norm);
    const index = headerNorm.findIndex((h) => wanted.some((n) => h.includes(n)));
    return index >= 0 ? index : fallbackIndex;
  };

  const cDocumento = colIndexAny(["DOCUMENTO"], 0);
  const cDescricao = colIndexAny(["DESCRICAO", "DESCRI"], 1);
  const cLanc = colIndexAny(["LANCAMENTOS", "LANC"], 2);
  const cTaxas = colIndexAny(["TAXAS"], 3);
  const cDesc = colIndexAny(["DESCONTOS", "DESCONT"], 4);
  const cAbat = colIndexAny(["ABATIMENTOS", "ABAT"], 5);
  const cCalc = colIndexAny(["CALCULADA LOJA", "CALCUL"], 6);
  const cVisao = colIndexAny(["VISAO MASTER", "VISAO", "VIS"], 8);
  const cOpfax = colIndexAny(["OPFAX"], 11);
  const cSaldo = colIndexAny(["SALDO"], 12);

  const linhas: LinhaInput[] = [];
  const rodape: LinhaRodapeImportacao[] = [];
  const pickNumber = (value: any) => (isLegacyXls ? parseLegacyXlsNumber(value) : parsePtBrNumber(value));

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const doc = String(r[cDocumento] || "").trim();
    const descricao = cDescricao >= 0 ? String(r[cDescricao] || "").trim() : "";
    const footerLabel = resolveRodapeImportacaoLabel(doc, descricao);
    const pick = (idx: number) => (idx >= 0 ? pickNumber(r[idx]) : null);

    if (footerLabel) {
      rodape.push(
        buildRodapeImportacao({
          label: footerLabel,
          valor_lancamentos: pick(cLanc),
          valor_taxas: pick(cTaxas),
          valor_descontos: pick(cDesc),
          valor_abatimentos: pick(cAbat),
          valor_calculada_loja: pick(cCalc),
          valor_visao_master: pick(cVisao),
          valor_opfax: pick(cOpfax),
          valor_saldo: pick(cSaldo),
        })
      );
      continue;
    }

    if (!doc) continue;


    linhas.push(enrichLinha({
      documento: doc,
      movimento_data: movimentoData,
      status: inferConciliacaoStatus(descricao),
      descricao: descricao || null,
      valor_lancamentos: pick(cLanc),
      valor_taxas: pick(cTaxas),
      valor_descontos: pick(cDesc),
      valor_abatimentos: pick(cAbat),
      valor_calculada_loja: pick(cCalc),
      valor_visao_master: pick(cVisao),
      valor_opfax: pick(cOpfax),
      valor_saldo: pick(cSaldo),
      origem,
      raw: { row: r },
    }));
  }

  return { movimentoData, linhas, rodape };
}

function formatMoney(value: number | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const datePart = raw.includes("T") ? raw.split("T")[0] : raw.includes(" ") ? raw.split(" ")[0] : raw;
  const parts = datePart.split("-");
  if (parts.length !== 3) return raw;
  const [year, month, day] = parts;
  if (!year || !month || !day) return raw;
  return `${day}-${month}-${year}`;
}

function formatDateTime(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function formatMonthLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return raw || "-";
  const [year, month] = raw.split("-");
  const monthIndex = Number(month) - 1;
  const monthNames = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const monthLabel = monthNames[monthIndex] || month;
  return `${monthLabel}-${year}`;
}

function buildRecentMonthOptions(current: string, fromResumo: string[]) {
  const values = new Set<string>();
  const now = new Date();
  for (let offset = 0; offset < 12; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    values.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  fromResumo.forEach((value) => {
    if (/^\d{4}-\d{2}$/.test(String(value || ""))) values.add(String(value));
  });
  if (/^\d{4}-\d{2}$/.test(String(current || ""))) values.add(current);
  return Array.from(values)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ label: formatMonthLabel(value), value }));
}

function getMonthCalendarMatrix(monthValue: string, byDay: ConciliacaoResumoDia[]) {
  const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [] as Array<Array<{ date: string | null; item: ConciliacaoResumoDia | null }>>;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || !month) return [];

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const totalDays = lastDay.getDate();
  const offset = firstDay.getDay();
  const byDayMap = new Map(byDay.map((item) => [item.date, item]));

  const cells: Array<{ date: string | null; item: ConciliacaoResumoDia | null }> = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push({ date: null, item: null });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ date, item: byDayMap.get(date) || null });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, item: null });
  }

  const weeks: Array<Array<{ date: string | null; item: ConciliacaoResumoDia | null }>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function getResumoDiaTone(item?: ConciliacaoResumoDia | null) {
  if (!item) return "empty";
  if ((item.pendentesImportacao || 0) > 0 || item.status === "IMPORTACAO_PENDENTE") return "importacao";
  if ((item.pendentesConciliacao || 0) > 0) return "conciliacao";
  if ((item.pendentesRanking || 0) > 0) return "ranking";
  if ((item.total || 0) > 0) return "ok";
  return "empty";
}

function getResumoDiaLabel(item?: ConciliacaoResumoDia | null) {
  const tone = getResumoDiaTone(item);
  if (tone === "importacao") return "Dia pendente importação";
  if (tone === "conciliacao") return "Conciliação pendente";
  if (tone === "ranking") return "Pendência de ranking";
  if (tone === "ok") return "Dia conciliado";
  return "Sem registro";
}

function formatPendingDayList(dates: string[], limit = 6) {
  if (dates.length === 0) return "Nenhum";
  const sorted = [...dates].sort();
  const visible = sorted
    .slice(0, limit)
    .map((date) => String(Number(date.slice(-2))));
  const rest = sorted.length - visible.length;
  return rest > 0 ? `${visible.join(", ")} +${rest}` : visible.join(", ");
}

function linhaEhImportavel(value?: string | null) {
  return isConciliacaoImportavel({ status: value });
}

function isOperacionalLinha(params: { status?: string | null; descricao?: string | null }) {
  return isConciliacaoEfetivada(params);
}

function linhaExigeAtribuicaoRanking(linha: LinhaInput) {
  const status = resolveConciliacaoStatus({ status: linha.status, descricao: linha.descricao });
  return status === "BAIXA" || status === "OPFAX";
}

function isLinhaPendenteEmOpfax(params: { status?: string | null; descricao?: string | null }) {
  const descricaoKey = normalizeConciliacaoDescricaoKey(params.descricao);
  return (
    !isConciliacaoEfetivada(params) &&
    descricaoKey.includes("RECIBO LANCADO EM OPFAX")
  );
}

function isLinhaEstornoComissao(params: { status?: string | null; descricao?: string | null }) {
  const descricaoKey = normalizeConciliacaoDescricaoKey(params.descricao);
  return String(params.status || "").trim().toUpperCase() === "ESTORNO" && descricaoKey.includes("ESTORNO COMISSAO");
}

function getLinhaStatusLabel(params: { status?: string | null; descricao?: string | null }) {
  if (isConciliacaoEfetivada(params)) return "Efetivado";
  if (isLinhaPendenteEmOpfax(params)) return "Pendente em OPFAX";

  const status = String(params.status || "").trim().toUpperCase();
  if (status === "ESTORNO") return "Estorno";
  if (status === "OPFAX") return "OPFAX";
  return status || "OUTRO";
}

function getLinhaRankingHint(params: { status?: string | null; descricao?: string | null }) {
  if (isLinhaPendenteEmOpfax(params)) return "Pendente em OPFAX";
  if (isConciliacaoEfetivada(params)) return "Aguardando atribuição";
  if (String(params.status || "").trim().toUpperCase() === "ESTORNO") return "Ignorado";
  return "Ignorado";
}

function getLinhaRankingTooltip(params: { status?: string | null; descricao?: string | null }) {
  if (isLinhaEstornoComissao(params)) {
    return "Vendas canceladas dentro do próprio mês, serão retiradas do ranking e canceladas em vendas, caso o contrato tenha sido importado ou lançada manualmente.";
  }
  return null;
}

function registroExigeAtribuicaoRanking(item: ConciliacaoItem) {
  return isOperacionalLinha({ status: item.status, descricao: item.descricao });
}

function registroTemRankingAtribuido(item: ConciliacaoItem) {
  return Boolean(String(item.ranking_vendedor_id || "").trim());
}

function getShortcutTitle(shortcut: ConciliacaoShortcut | null) {
  if (shortcut === "importados") return "Todos os importados do mês";
  if (shortcut === "pendentes_conciliacao") return "Pendentes de conciliação";
  if (shortcut === "dias_pendentes_importacao") return "Dias pendentes de importação";
  if (shortcut === "pendentes_ranking") return "Pendências de ranking";
  if (shortcut === "conciliados_sistema") return "Conciliados pelo sistema";
  if (shortcut === "atribuidos_ranking") return "Atribuídos ao ranking";
  return "Recorte atual";
}

const ROWS_PER_PAGE = 5;

export default function ConciliacaoIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Conciliação");
  const isMaster = /MASTER/i.test(String(userType || ""));

  const { toasts, showToast, dismissToast } = useToastQueue();

  const [loadingUser, setLoadingUser] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [userCtx, setUserCtx] = useState<UserCtx | null>(null);

  const [empresas, setEmpresas] = useState<CompanyRow[]>([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>("all");

  const [arquivo, setArquivo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tabelaAlteracoesRef = useRef<HTMLDivElement>(null);

  const [parsedLinhas, setParsedLinhas] = useState<LinhaInput[]>([]);
  const [parsedRodape, setParsedRodape] = useState<LinhaRodapeImportacao[]>([]);
  const [parsedMoneyDrafts, setParsedMoneyDrafts] = useState<
    Record<string, Partial<Record<PreviewMoneyField, string>>>
  >({});
  const [parsedMovimentoData, setParsedMovimentoData] = useState<string | null>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<ConciliacaoSection>("importacao");

  const [somentePendentes, setSomentePendentes] = useState(true);
  const [rankingStatusFilter, setRankingStatusFilter] = useState<"all" | "pending" | "assigned" | "system">("pending");
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthValue());
  const [dayFilter, setDayFilter] = useState<string>("");
  const [loadingLista, setLoadingLista] = useState(false);
  const [itens, setItens] = useState<ConciliacaoItem[]>([]);
  const [loadingResumo, setLoadingResumo] = useState(false);
  const [resumo, setResumo] = useState<ConciliacaoResumo | null>(null);
  const [loadingExecucoes, setLoadingExecucoes] = useState(false);
  const [execucoes, setExecucoes] = useState<ConciliacaoExecucao[]>([]);

  const [importando, setImportando] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  const [importacaoSalva, setImportacaoSalva] = useState(false);
  const [buscandoVendedores, setBuscandoVendedores] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<ConciliacaoItem | null>(null);
  const [comissaoDrafts, setComissaoDrafts] = useState<Record<string, string>>({});
  const [rankingVendedorDrafts, setRankingVendedorDrafts] = useState<Record<string, string>>({});
  const [rankingProdutoDrafts, setRankingProdutoDrafts] = useState<Record<string, string>>({});
  const [editableRows, setEditableRows] = useState<Record<string, boolean>>({});
  const [rankingAssignees, setRankingAssignees] = useState<RankingAssigneeOption[]>([]);
  const [rankingProdutosMeta, setRankingProdutosMeta] = useState<RankingProdutoOption[]>([]);
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [atalhoAtivo, setAtalhoAtivo] = useState<ConciliacaoShortcut | null>(null);
  const [resumoDetalheAberto, setResumoDetalheAberto] = useState(false);

  const [itensPendentes, setItensPendentes] = useState<ConciliacaoItem[]>([]);
  const [loadingPendentes, setLoadingPendentes] = useState(false);
  const [itensConciliados, setItensConciliados] = useState<ConciliacaoItem[]>([]);
  const [loadingConciliados, setLoadingConciliados] = useState(false);
  const [itensRankingPendentes, setItensRankingPendentes] = useState<ConciliacaoItem[]>([]);
  const [loadingRankingPendentes, setLoadingRankingPendentes] = useState(false);

  const [pendentesFirst, setPendentesFirst] = useState(0);
  const [conciliadosFirst, setConciliadosFirst] = useState(0);
  const [rankingFirst, setRankingFirst] = useState(0);
  const [alteracoesFirst, setAlteracoesFirst] = useState(0);
  const [vgFirst, setVgFirst] = useState(0);
  const [importacaoFirst, setImportacaoFirst] = useState(0);
  const [resumoFirst, setResumoFirst] = useState(0);
  const [execucoesFirst, setExecucoesFirst] = useState(0);

  const [itensVisaoGeral, setItensVisaoGeral] = useState<ConciliacaoItem[]>([]);
  const [loadingVisaoGeral, setLoadingVisaoGeral] = useState(false);
  const [vgFiltroDocumento, setVgFiltroDocumento] = useState("");
  const [vgFiltroVendedor, setVgFiltroVendedor] = useState("all");
  const [vgFiltroStatus, setVgFiltroStatus] = useState("all");
  const [vgFiltroMes, setVgFiltroMes] = useState("all");
  const [vgFiltroDia, setVgFiltroDia] = useState("all");
  const [vgFiltroReciboEncontrado, setVgFiltroReciboEncontrado] = useState("all");
  const [vgFiltroRanking, setVgFiltroRanking] = useState("all");
  const [vgFiltroConciliado, setVgFiltroConciliado] = useState("all");

  const itensVisaoGeralComputados = useMemo(
    () =>
      itensVisaoGeral.map((row) => ({
        ...row,
        _recibo_encontrado: Boolean(row.venda_recibo_id),
        _ranking_ok: registroExigeAtribuicaoRanking(row)
          ? registroTemRankingAtribuido(row)
          : null,
        _status_label: getLinhaStatusLabel({ status: row.status, descricao: row.descricao }),
        _vendedor_nome:
          (row.ranking_vendedor as any)?.nome_completo ||
          rankingAssignees.find((a) => a.id === row.ranking_vendedor_id)?.nome_completo ||
          null,
        _produto_nome:
          (row.ranking_produto as any)?.nome ||
          rankingProdutosMeta.find((p) => p.id === row.ranking_produto_id)?.nome ||
          null,
      })),
    [itensVisaoGeral, rankingAssignees, rankingProdutosMeta]
  );

  const vgStatusOptions = useMemo(
    () => Array.from(new Set(itensVisaoGeralComputados.map((r) => r._status_label).filter(Boolean))).sort() as string[],
    [itensVisaoGeralComputados]
  );

  const vgVendedorOptions = useMemo(
    () =>
      Array.from(
        new Set(itensVisaoGeralComputados.map((r) => r._vendedor_nome).filter((v): v is string => Boolean(v)))
      ).sort(),
    [itensVisaoGeralComputados]
  );

  const vgMesOptions = useMemo(
    () =>
      Array.from(
        new Set(
          itensVisaoGeralComputados
            .map((r) => (r.movimento_data ? r.movimento_data.slice(0, 7) : ""))
            .filter(Boolean)
        )
      )
        .sort()
        .reverse(),
    [itensVisaoGeralComputados]
  );

  const vgDiaOptions = useMemo(
    () =>
      Array.from(
        new Set(
          itensVisaoGeralComputados
            .filter((r) => vgFiltroMes === "all" || (r.movimento_data || "").startsWith(vgFiltroMes))
            .map((r) => r.movimento_data || "")
            .filter(Boolean)
        )
      )
        .sort()
        .reverse(),
    [itensVisaoGeralComputados, vgFiltroMes]
  );

  const itensVisaoGeralFiltrados = useMemo(() => {
    const docSearch = vgFiltroDocumento.trim().toLowerCase();
    return itensVisaoGeralComputados.filter((row) => {
      if (docSearch && !String(row.documento || "").toLowerCase().includes(docSearch)) return false;
      if (vgFiltroVendedor !== "all" && row._vendedor_nome !== vgFiltroVendedor) return false;
      if (vgFiltroStatus !== "all" && row._status_label !== vgFiltroStatus) return false;
      if (vgFiltroMes !== "all") {
        const mesRow = (row.movimento_data || "").slice(0, 7);
        if (mesRow !== vgFiltroMes) return false;
      }
      if (vgFiltroDia !== "all" && row.movimento_data !== vgFiltroDia) return false;
      if (vgFiltroReciboEncontrado !== "all") {
        if (vgFiltroReciboEncontrado === "sim" && !row._recibo_encontrado) return false;
        if (vgFiltroReciboEncontrado === "nao" && row._recibo_encontrado) return false;
      }
      if (vgFiltroRanking !== "all") {
        if (vgFiltroRanking === "sim" && row._ranking_ok !== true) return false;
        if (vgFiltroRanking === "nao" && row._ranking_ok !== false) return false;
      }
      if (vgFiltroConciliado !== "all") {
        if (vgFiltroConciliado === "sim" && !row.conciliado) return false;
        if (vgFiltroConciliado === "nao" && row.conciliado) return false;
      }
      return true;
    });
  }, [
    itensVisaoGeralComputados,
    vgFiltroDocumento,
    vgFiltroVendedor,
    vgFiltroStatus,
    vgFiltroMes,
    vgFiltroDia,
    vgFiltroReciboEncontrado,
    vgFiltroRanking,
    vgFiltroConciliado,
  ]);

  const [somenteAlteracoesPendentes, setSomenteAlteracoesPendentes] = useState(true);
  const [alteracoesFiltroRecibo, setAlteracoesFiltroRecibo] = useState("");
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [changes, setChanges] = useState<ConciliacaoChange[]>([]);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(() => new Set());

  const resolvedCompanyId = useMemo(() => {
    if (!userCtx) return null;
    if (isMaster) {
      const selected = String(empresaSelecionada || "").trim();
      if (selected && selected !== "all") return selected;
    }
    return userCtx.companyId;
  }, [empresaSelecionada, isMaster, userCtx]);

  useEffect(() => {
    async function loadCtx() {
      try {
        setLoadingUser(true);
        setErro(null);

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id || null;
        if (!userId) {
          setErro("Usuário não autenticado.");
          setUserCtx(null);
          return;
        }

        const { data: u, error: uErr } = await supabase
          .from("users")
          .select("id, company_id, companies(nome_fantasia), user_types(name)")
          .eq("id", userId)
          .maybeSingle();
        if (uErr) throw uErr;

        const tipoName = String((u as any)?.user_types?.name || "").toUpperCase();
        let papel: Papel = "OUTRO";
        if (tipoName.includes("ADMIN")) papel = "ADMIN";
        else if (tipoName.includes("MASTER")) papel = "MASTER";
        else if (tipoName.includes("GESTOR")) papel = "GESTOR";
        else if (tipoName.includes("VENDEDOR")) papel = "VENDEDOR";

        const companyId = (u as any)?.company_id ? String((u as any).company_id) : null;
        const companyNome = (u as any)?.companies?.nome_fantasia
          ? String((u as any).companies.nome_fantasia)
          : null;

        setUserCtx({ userId, papel, companyId, companyNome });

        if (papel === "MASTER") {
          const { data: vinculos, error: vErr } = await supabase
            .from("master_empresas")
            .select("company_id, status, companies(id, nome_fantasia)")
            .eq("master_id", userId);
          if (vErr) throw vErr;
          const list = (vinculos || [])
            .filter((v: any) => String(v?.status || "").toLowerCase() !== "rejected")
            .map((v: any) => ({
              id: String(v.company_id),
              nome_fantasia: v?.companies?.nome_fantasia ? String(v.companies.nome_fantasia) : null,
            }));
          setEmpresas(list);
          if (companyId) setEmpresaSelecionada(companyId);
          else if (list.length > 0) setEmpresaSelecionada(list[0].id);
        }
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar contexto do usuário.");
      } finally {
        setLoadingUser(false);
      }
    }

    if (!loadingPerm && podeVer) loadCtx();
    else setLoadingUser(false);
  }, [loadingPerm, podeVer]);

  async function carregarLista(overrides?: Partial<ConciliacaoListFilters>) {
    const companyId = resolvedCompanyId;
    if (!companyId) {
      setItens([]);
      return;
    }

    try {
      setLoadingLista(true);
      setErro(null);

      const filtros = {
        somentePendentes,
        monthFilter,
        dayFilter,
        rankingStatusFilter,
        ...overrides,
      };

      const qs = new URLSearchParams();
      qs.set("company_id", companyId);
      if (filtros.somentePendentes) qs.set("pending", "1");
      if (filtros.monthFilter) qs.set("month", filtros.monthFilter);
      if (filtros.dayFilter) qs.set("day", filtros.dayFilter);
      if (filtros.rankingStatusFilter !== "all") qs.set("ranking_status", filtros.rankingStatusFilter);

      const resp = await fetch(`/api/v1/conciliacao/list?${qs.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as ConciliacaoItem[];
      setItens(Array.isArray(json) ? json : []);
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao carregar conciliação.");
    } finally {
      setLoadingLista(false);
    }
  }

  useEffect(() => {
    if (!resolvedCompanyId) return;
    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId, somentePendentes, monthFilter, dayFilter, rankingStatusFilter]);

  async function carregarPendentes() {
    const companyId = resolvedCompanyId;
    if (!companyId) {
      setItensPendentes([]);
      return;
    }
    try {
      setLoadingPendentes(true);
      const qs = new URLSearchParams();
      qs.set("company_id", companyId);
      qs.set("pending", "1");
      if (monthFilter) qs.set("month", monthFilter);
      if (dayFilter) qs.set("day", dayFilter);
      const resp = await fetch(`/api/v1/conciliacao/list?${qs.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as ConciliacaoItem[];
      setItensPendentes(Array.isArray(json) ? json : []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingPendentes(false);
    }
  }

  useEffect(() => {
    if (!resolvedCompanyId) return;
    if (secaoAtiva !== "pendentes") return;
    carregarPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId, secaoAtiva, monthFilter, dayFilter]);

  async function carregarConciliados() {
    const companyId = resolvedCompanyId;
    if (!companyId) { setItensConciliados([]); return; }
    try {
      setLoadingConciliados(true);
      const qs = new URLSearchParams();
      qs.set("company_id", companyId);
      qs.set("conciliado", "1");
      if (monthFilter) qs.set("month", monthFilter);
      if (dayFilter) qs.set("day", dayFilter);
      const resp = await fetch(`/api/v1/conciliacao/list?${qs.toString()}`, { credentials: "same-origin", cache: "no-store" });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setItensConciliados(Array.isArray(json) ? json : []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingConciliados(false);
    }
  }

  useEffect(() => {
    if (!resolvedCompanyId) return;
    if (secaoAtiva !== "registros" && !(secaoAtiva === "resumo" && resumoDetalheAberto)) return;
    carregarConciliados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId, secaoAtiva, resumoDetalheAberto, monthFilter, dayFilter]);

  async function carregarRankingPendentes() {
    const companyId = resolvedCompanyId;
    if (!companyId) { setItensRankingPendentes([]); return; }
    try {
      setLoadingRankingPendentes(true);
      const qs = new URLSearchParams();
      qs.set("company_id", companyId);
      qs.set("ranking_pending", "1");
      if (monthFilter) qs.set("month", monthFilter);
      if (dayFilter) qs.set("day", dayFilter);
      const resp = await fetch(`/api/v1/conciliacao/list?${qs.toString()}`, { credentials: "same-origin", cache: "no-store" });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setItensRankingPendentes(Array.isArray(json) ? json : []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingRankingPendentes(false);
    }
  }

  useEffect(() => {
    if (!resolvedCompanyId) return;
    if (secaoAtiva !== "pendentes_ranking") return;
    carregarRankingPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId, secaoAtiva, monthFilter, dayFilter]);

  async function carregarVisaoGeral() {
    const companyId = resolvedCompanyId;
    if (!companyId) { setItensVisaoGeral([]); return; }
    try {
      setLoadingVisaoGeral(true);
      const qs = new URLSearchParams();
      qs.set("company_id", companyId);
      const resp = await fetch(`/api/v1/conciliacao/list?${qs.toString()}`, { credentials: "same-origin", cache: "no-store" });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setItensVisaoGeral(Array.isArray(json) ? json : []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingVisaoGeral(false);
    }
  }

  useEffect(() => {
    if (!resolvedCompanyId) return;
    if (secaoAtiva !== "visao_geral") return;
    carregarVisaoGeral();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId, secaoAtiva]);

  useEffect(() => {
    setComissaoDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const row of itens) {
        next[row.id] = editableRows[row.id] && prev[row.id] != null ? prev[row.id] : formatMoney(row.valor_comissao_loja);
      }
      return next;
    });
    setRankingVendedorDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const row of itens) {
        next[row.id] =
          editableRows[row.id] && prev[row.id] != null ? prev[row.id] : row.ranking_vendedor_id || "";
      }
      return next;
    });
    setRankingProdutoDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const row of itens) {
        next[row.id] =
          editableRows[row.id] && prev[row.id] != null ? prev[row.id] : row.ranking_produto_id || "";
      }
      return next;
    });
  }, [editableRows, itens]);

  async function carregarResumo() {
    if (!resolvedCompanyId) {
      setResumo(null);
      return;
    }

    try {
      setLoadingResumo(true);
      const qs = new URLSearchParams({ company_id: resolvedCompanyId, month: monthFilter || currentMonthValue() });
      const resp = await fetch(`/api/v1/conciliacao/summary?${qs.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as ConciliacaoResumo;
      setResumo(json || null);
    } catch (e: any) {
      console.error(e);
      setResumo(null);
    } finally {
      setLoadingResumo(false);
    }
  }

  async function carregarExecucoes() {
    if (!resolvedCompanyId) {
      setExecucoes([]);
      return;
    }

    try {
      setLoadingExecucoes(true);
      const qs = new URLSearchParams({ company_id: resolvedCompanyId, limit: "12" });
      const resp = await fetch(`/api/v1/conciliacao/executions?${qs.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as ConciliacaoExecucao[];
      setExecucoes(Array.isArray(json) ? json : []);
    } catch (e: any) {
      console.error(e);
      setExecucoes([]);
    } finally {
      setLoadingExecucoes(false);
    }
  }

  useEffect(() => {
    if (!resolvedCompanyId) return;
    carregarResumo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId, monthFilter]);

  useEffect(() => {
    if (!resolvedCompanyId) return;
    carregarExecucoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId]);

  function atualizarLinhaImportada(index: number, changes: Partial<LinhaInput>) {
    setParsedLinhas((prev) =>
      prev.map((linha, currentIndex) => {
        if (currentIndex !== index) return linha;
        return enrichLinha({
          ...linha,
          ...changes,
        });
      })
    );
  }

  function updateParsedMoneyDraft(rowKey: string, field: PreviewMoneyField, raw: string) {
    setParsedMoneyDrafts((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [field]: raw,
      },
    }));
  }

  function commitParsedMoneyDraft(
    index: number,
    rowKey: string,
    field: PreviewMoneyField,
    raw: string
  ) {
    const parsed = parsePtBrNumber(raw);
    atualizarLinhaImportada(index, {
      [field]: parsed,
    } as Partial<LinhaInput>);
    updateParsedMoneyDraft(rowKey, field, formatMoney(parsed));
  }

  function limparImportacao() {
    setArquivo(null);
    setParsedLinhas([]);
    setParsedRodape([]);
    setParsedMoneyDrafts({});
    setParsedMovimentoData(null);
    setImportacaoSalva(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function abrirImportacao() {
    if (precisaEmpresaMaster) return;
    setAtalhoAtivo(null);
    setSecaoAtiva("importacao");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById("conciliacao-importacao")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  useEffect(() => {
    if (!resolvedCompanyId) {
      setRankingAssignees([]);
      setRankingProdutosMeta([]);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        setLoadingOptions(true);
        const qs = new URLSearchParams({ company_id: resolvedCompanyId });
        const resp = await fetch(`/api/v1/conciliacao/options?${qs.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!resp.ok) throw new Error(await resp.text());
        const json = (await resp.json()) as {
          vendedores?: RankingAssigneeOption[];
          produtosMeta?: RankingProdutoOption[];
        };
        if (!mounted) return;
        setRankingAssignees(Array.isArray(json?.vendedores) ? json.vendedores : []);
        setRankingProdutosMeta(Array.isArray(json?.produtosMeta) ? json.produtosMeta : []);
      } catch (e: any) {
        console.error(e);
        if (mounted) {
          setRankingAssignees([]);
          setRankingProdutosMeta([]);
        }
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [resolvedCompanyId]);

  async function salvarAtribuicaoRanking(
    row: ConciliacaoItem,
    changes: {
      rankingVendedorId?: string | null;
      rankingProdutoId?: string | null;
      valorComissaoLoja?: number | null;
    }
  ) {
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return;
    }

    const rankingVendedorId =
      changes.rankingVendedorId !== undefined ? changes.rankingVendedorId : row.ranking_vendedor_id;
    const rankingProdutoId =
      changes.rankingProdutoId !== undefined ? changes.rankingProdutoId : row.ranking_produto_id;
    const valorComissaoLoja =
      changes.valorComissaoLoja !== undefined ? changes.valorComissaoLoja : row.valor_comissao_loja;

    try {
      setSavingAssignmentId(row.id);
      const resp = await fetch("/api/v1/conciliacao/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          companyId: resolvedCompanyId,
          conciliacaoId: row.id,
          rankingVendedorId,
          rankingProdutoId,
          valorComissaoLoja,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as { item?: Partial<ConciliacaoItem> | null };

      const mergeRankingUpdate = (item: ConciliacaoItem): ConciliacaoItem => {
        if (item.id !== row.id) return item;
        const persisted = json?.item || null;
        return {
          ...item,
          ranking_vendedor_id: (persisted?.ranking_vendedor_id as string | null | undefined) ?? rankingVendedorId ?? null,
          ranking_produto_id: (persisted?.ranking_produto_id as string | null | undefined) ?? rankingProdutoId ?? null,
          ranking_assigned_at:
            (persisted?.ranking_assigned_at as string | null | undefined) ?? new Date().toISOString(),
          valor_comissao_loja:
            (persisted?.valor_comissao_loja as number | null | undefined) ?? valorComissaoLoja ?? null,
          percentual_comissao_loja:
            (persisted?.percentual_comissao_loja as number | null | undefined) ?? item.percentual_comissao_loja,
          faixa_comissao:
            (persisted?.faixa_comissao as string | null | undefined) ?? item.faixa_comissao,
          is_seguro_viagem:
            (persisted?.is_seguro_viagem as boolean | undefined) ?? item.is_seguro_viagem,
          ranking_vendedor: (persisted?.ranking_vendedor as any) ?? (
            rankingVendedorId
              ? rankingAssignees.find((opt) => opt.id === rankingVendedorId)
                ? {
                    id: rankingVendedorId,
                    nome_completo:
                      rankingAssignees.find((opt) => opt.id === rankingVendedorId)?.nome_completo || null,
                  }
                : item.ranking_vendedor || null
              : null
          ),
          ranking_produto: (persisted?.ranking_produto as any) ?? (
            rankingProdutoId
              ? rankingProdutosMeta.find((opt) => opt.id === rankingProdutoId)
                ? {
                    id: rankingProdutoId,
                    nome: rankingProdutosMeta.find((opt) => opt.id === rankingProdutoId)?.nome || null,
                  }
                : item.ranking_produto || null
              : null
          ),
        };
      };

      setItens((prev) => prev.map(mergeRankingUpdate));
      setItensConciliados((prev) => prev.map(mergeRankingUpdate));
      setItensRankingPendentes((prev) => prev.map(mergeRankingUpdate));
      if (changes.valorComissaoLoja !== undefined) {
        setComissaoDrafts((prev) => ({
          ...prev,
          [row.id]: formatMoney(valorComissaoLoja),
        }));
      }
      showToast("Atribuição atualizada para o ranking.", "success");
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao salvar atribuição do ranking.", "error");
    } finally {
      setSavingAssignmentId(null);
    }
  }

  function updateComissaoDraft(rowId: string, value: string) {
    setComissaoDrafts((prev) => ({
      ...prev,
      [rowId]: value,
    }));
  }

  function updateRankingVendedorDraft(rowId: string, value: string) {
    setRankingVendedorDrafts((prev) => ({
      ...prev,
      [rowId]: value,
    }));
  }

  function updateRankingProdutoDraft(rowId: string, value: string) {
    setRankingProdutoDrafts((prev) => ({
      ...prev,
      [rowId]: value,
    }));
  }

  function isRowLocked(row: ConciliacaoItem) {
    if (!row.conciliado) return false;
    return !editableRows[row.id];
  }

  function habilitarEdicaoLinha(rowId: string) {
    setEditableRows((prev) => ({
      ...prev,
      [rowId]: true,
    }));
  }

  async function confirmarEdicaoComissao(row: ConciliacaoItem) {
    const raw = comissaoDrafts[row.id];
    const parsed = parsePtBrNumber(raw);
    const valorAtual = Number(row.valor_comissao_loja || 0);
    const valorNovo = parsed == null ? 0 : parsed;
    if (Math.abs(valorNovo - valorAtual) <= 0.009) {
      setComissaoDrafts((prev) => ({
        ...prev,
        [row.id]: formatMoney(row.valor_comissao_loja),
      }));
      return;
    }
    await salvarAtribuicaoRanking(row, { valorComissaoLoja: valorNovo });
  }

  async function salvarLinha(row: ConciliacaoItem) {
    // Se o draft não foi inicializado para esta linha (ex: rows de itensConciliados),
    // usa `undefined` para que salvarAtribuicaoRanking preserve o valor existente do row.
    const vendedorDraft = rankingVendedorDrafts[row.id];
    const produtoDraft = rankingProdutoDrafts[row.id];

    await salvarAtribuicaoRanking(row, {
      rankingVendedorId: vendedorDraft != null ? (String(vendedorDraft).trim() || null) : undefined,
      rankingProdutoId: produtoDraft != null ? (String(produtoDraft).trim() || null) : undefined,
    });

    setEditableRows((prev) => ({
      ...prev,
      [row.id]: false,
    }));
  }

  async function excluirLinha(row: ConciliacaoItem) {
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return;
    }
    if (row.conciliado) {
      showToast("Nao e permitido excluir um recibo ja conciliado.", "error");
      return;
    }
    setDeleteConfirmRow(row);
  }

  async function confirmarExcluirLinha() {
    const row = deleteConfirmRow;
    if (!row) return;
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      setDeleteConfirmRow(null);
      return;
    }

    try {
      setDeletingItemId(row.id);
      const resp = await fetch("/api/v1/conciliacao/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          companyId: resolvedCompanyId,
          conciliacaoId: row.id,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());

      setItens((prev) => prev.filter((item) => item.id !== row.id));
      setComissaoDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setRankingVendedorDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setRankingProdutoDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setEditableRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });

      await carregarResumo();
      await carregarAlteracoes();
      showToast("Recibo excluido da conciliacao.", "success");
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao excluir recibo da conciliacao.", "error");
    } finally {
      setDeleteConfirmRow(null);
      setDeletingItemId(null);
    }
  }

  async function carregarExistentes(linhas: LinhaInput[], cid: string, movimentoData: string | null) {
    const documentos = linhas.map((l) => l.documento).filter(Boolean);
    if (documentos.length === 0) {
      void autoAtribuirVendedores(linhas, cid);
      return;
    }

    setBuscandoVendedores(true);
    try {
      const res = await fetch("/api/v1/conciliacao/existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ companyId: cid, documentos, movimentoData }),
      });

      type ExistingRec = {
        ranking_vendedor_id: string | null;
        ranking_produto_id: string | null;
        venda_id: string | null;
        venda_recibo_id: string | null;
        conciliado: boolean;
        valor_lancamentos: number | null;
        valor_taxas: number | null;
        valor_descontos: number | null;
        valor_abatimentos: number | null;
        valor_calculada_loja: number | null;
        valor_visao_master: number | null;
        valor_opfax: number | null;
        valor_saldo: number | null;
      };

      let existingRecords: Record<string, ExistingRec> = {};

      if (res.ok) {
        const data = (await res.json()) as { records: typeof existingRecords };
        existingRecords = data?.records ?? {};
      }

      /** Herda o valor histórico se o valor novo for zero/nulo */
      const mergeNum = (newVal: number | null | undefined, histVal: number | null | undefined): number | null => {
        if (Math.abs(Number(newVal ?? 0)) > 0.001) return Number(newVal);
        if (Math.abs(Number(histVal ?? 0)) > 0.001) return Number(histVal);
        return null;
      };

      const atribuidos: string[] = [];
      const linhasAtualizadas = linhas.map((l) => {
        const rec = existingRecords[l.documento];
        if (!rec) return l;

        const updates: Partial<LinhaInput> = {};

        // Dados de atribuição
        if (rec.ranking_vendedor_id && !String(l.ranking_vendedor_id || "").trim()) {
          updates.ranking_vendedor_id = rec.ranking_vendedor_id;
          atribuidos.push(l.documento);
        }
        if (rec.ranking_produto_id && !String(l.ranking_produto_id || "").trim()) {
          updates.ranking_produto_id = rec.ranking_produto_id;
        }
        if (rec.venda_recibo_id && !String(l.venda_recibo_id || "").trim()) {
          updates.venda_recibo_id = rec.venda_recibo_id;
        }
        if (rec.venda_id && !String(l.venda_id || "").trim()) {
          updates.venda_id = rec.venda_id;
        }

        // Herança de valores financeiros: se o arquivo atual veio zerado, usa importação anterior
        updates.valor_lancamentos = mergeNum(l.valor_lancamentos, rec.valor_lancamentos);
        updates.valor_taxas = mergeNum(l.valor_taxas, rec.valor_taxas);
        updates.valor_descontos = mergeNum(l.valor_descontos, rec.valor_descontos);
        updates.valor_abatimentos = mergeNum(l.valor_abatimentos, rec.valor_abatimentos);
        updates.valor_calculada_loja = mergeNum(l.valor_calculada_loja, rec.valor_calculada_loja);
        updates.valor_visao_master = mergeNum(l.valor_visao_master, rec.valor_visao_master);
        updates.valor_opfax = mergeNum(l.valor_opfax, rec.valor_opfax);
        updates.valor_saldo = mergeNum(l.valor_saldo, rec.valor_saldo);

        const merged = { ...l, ...updates };
        // Re-enriquecer para recalcular valor_venda_real, comissão e % loja com os valores herdados
        return enrichLinha(merged);
      });

      if (atribuidos.length > 0) {
        showToast(`${atribuidos.length} registro(s) com dados do sistema carregados.`, "success");
      }

      // Update parsedLinhas with merged data, then run auto-assign for remaining without vendor
      setParsedLinhas(linhasAtualizadas);
      void autoAtribuirVendedores(linhasAtualizadas, cid);
    } catch {
      // Fallback: try auto-assign directly
      void autoAtribuirVendedores(linhas, cid);
    } finally {
      setBuscandoVendedores(false);
    }
  }

  async function autoAtribuirVendedores(linhas: LinhaInput[], cid: string) {
    const candidatas = linhas.filter(
      (l) => isConciliacaoEfetivada({ status: l.status, descricao: l.descricao }) &&
             !String(l.ranking_vendedor_id || "").trim()
    );
    if (candidatas.length === 0) return;

    setBuscandoVendedores(true);
    try {
      const documentos = candidatas.map((l) => ({
        documento: l.documento,
        valor_lancamentos: l.valor_lancamentos ?? null,
        valor_taxas: l.valor_taxas ?? null,
      }));

      const res = await fetch("/api/v1/conciliacao/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: cid, documentos }),
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        matches: Record<string, { vendedor_id: string } | null>;
      };

      const novosVendedores: Record<string, string> = {};
      for (const linha of candidatas) {
        const match = data.matches[linha.documento];
        if (match?.vendedor_id) {
          novosVendedores[linha.documento] = match.vendedor_id;
        }
      }

      if (Object.keys(novosVendedores).length > 0) {
        // Atualiza o draft de ranking_vendedor usando o id único da linha como chave
        setParsedLinhas((prev) =>
          prev.map((l) => {
            if (novosVendedores[l.documento] && !String(l.ranking_vendedor_id || "").trim()) {
              return { ...l, ranking_vendedor_id: novosVendedores[l.documento] };
            }
            return l;
          })
        );
        const atribuidos = Object.keys(novosVendedores).length;
        showToast(`${atribuidos} vendedor(es) atribuído(s) automaticamente.`, "success");
      }
    } catch {
      // silencioso — auto-atribuição é best-effort
    } finally {
      setBuscandoVendedores(false);
    }
  }

  async function onPickFile(file: File | null) {
    setArquivo(file);
    setParsedLinhas([]);
    setParsedRodape([]);
    setParsedMoneyDrafts({});
    setParsedMovimentoData(null);

    if (!file) return;

    try {
      const origem = file.name || "import";
      const ext = origem.split(".").pop()?.toLowerCase() || "";
      let linhas: LinhaInput[] = [];
      let parsedMovimentoDataValue: string | null = null;

      if (ext === "txt") {
        const text = await file.text();
        const parsed = parseConciliacaoTxt(text, origem);
        parsedMovimentoDataValue = parsed.movimentoData;
        setParsedMovimentoData(parsed.movimentoData);
        setParsedLinhas(parsed.linhas);
        setParsedRodape(parsed.rodape);
        linhas = parsed.linhas;
      } else if (ext === "xls" || ext === "xlsx") {
        const parsed = await parseConciliacaoXls(file, origem);
        parsedMovimentoDataValue = parsed.movimentoData;
        setParsedMovimentoData(parsed.movimentoData);
        setParsedLinhas(parsed.linhas);
        setParsedRodape(parsed.rodape);
        linhas = parsed.linhas;
      } else {
        throw new Error("Formato não suportado. Use TXT ou XLS/XLSX.");
      }

      showToast(`Arquivo lido: ${file.name}`, "success");

      // Carregar dados já salvos no sistema para este arquivo (re-importação)
      if (linhas.length > 0 && resolvedCompanyId) {
        void carregarExistentes(linhas, resolvedCompanyId, parsedMovimentoDataValue);
      }
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao ler arquivo.", "error");
      setArquivo(null);
      setParsedLinhas([]);
      setParsedRodape([]);
      setParsedMoneyDrafts({});
      setParsedMovimentoData(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function salvarImportacao(runReconcile = false) {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return false;
    }
    if (!arquivo) {
      showToast("Selecione um arquivo.", "error");
      return false;
    }
    if (parsedLinhas.length === 0) {
      showToast("Nenhuma linha reconhecida no arquivo.", "error");
      return false;
    }

    const linhasImportaveis = parsedLinhas.filter((linha) =>
      linhaEhImportavel(linha.status || linha.descricao || null)
    );
    if (linhasImportaveis.length === 0) {
      showToast("O arquivo não possui registros válidos para importar.", "error");
      return false;
    }

    try {
      setImportando(true);
      setErro(null);

      const resp = await fetch("/api/v1/conciliacao/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          companyId: resolvedCompanyId,
          origem: arquivo.name,
          movimentoData: parsedMovimentoData,
          linhas: linhasImportaveis,
          runReconcile,
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any;

      if (parsedMovimentoData) {
        setMonthFilter(parsedMovimentoData.slice(0, 7));
        setDayFilter(parsedMovimentoData);
      }

      await carregarLista();
      await carregarResumo();
      await carregarExecucoes();
      await carregarAlteracoes();

      if (runReconcile) {
        showToast(
          `Salvo e conciliado. Importados: ${json?.imported || 0}. Conciliados: ${json?.reconciled || 0}.`,
          "success"
        );
        limparImportacao();
        setSecaoAtiva("registros");
      } else {
        setImportacaoSalva(true);
        showToast(
          `Importação salva (${json?.imported || 0} registros). Clique em Conciliar para processar.`,
          "success"
        );
      }
      return true;
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao importar.", "error");
      return false;
    } finally {
      setImportando(false);
    }
  }

  async function conciliarAposImport() {
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return;
    }
    try {
      setConciliando(true);
      const resp = await fetch("/api/v1/conciliacao/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ companyId: resolvedCompanyId, limit: 200 }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any;
      showToast(
        `Conciliado. Checados: ${json?.checked || 0}. Conciliados: ${json?.reconciled || 0}.`,
        "success"
      );
      await carregarLista();
      await carregarResumo();
      await carregarExecucoes();
      limparImportacao();
      setSecaoAtiva("registros");
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao conciliar.", "error");
    } finally {
      setConciliando(false);
    }
  }

  async function conciliarPendentes() {
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return;
    }
    try {
      setConciliando(true);
      const resp = await fetch("/api/v1/conciliacao/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ companyId: resolvedCompanyId, limit: 200 }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any;
      const erros = Number(json?.updateErrors || 0);
      showToast(
        erros > 0
          ? `Conciliados: ${json?.reconciled || 0}. Taxas atualizadas: ${json?.updatedTaxes || 0}. Falhas ao salvar: ${erros} — verifique os logs do servidor.`
          : `Checados: ${json?.checked || 0}. Conciliados: ${json?.reconciled || 0}. Taxas atualizadas: ${json?.updatedTaxes || 0}.`,
        erros > 0 ? "error" : "success"
      );
      await carregarLista();
      await carregarResumo();
      await carregarExecucoes();
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao conciliar pendentes.", "error");
    } finally {
      setConciliando(false);
    }
  }

  async function carregarAlteracoes() {
    if (!resolvedCompanyId) {
      setChanges([]);
      setSelectedGroupKeys(new Set());
      return;
    }

    try {
      setLoadingChanges(true);
      const qs = new URLSearchParams();
      qs.set("company_id", resolvedCompanyId);
      if (somenteAlteracoesPendentes) qs.set("pending", "1");
      if (monthFilter) qs.set("month", monthFilter);
      if (dayFilter) qs.set("day", dayFilter);

      const resp = await fetch(`/api/v1/conciliacao/changes?${qs.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any[];
      setChanges(Array.isArray(json) ? (json as ConciliacaoChange[]) : []);
      setSelectedGroupKeys(new Set());
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao carregar alterações.", "error");
    } finally {
      setLoadingChanges(false);
    }
  }

  const changeGroups = useMemo((): ConciliacaoChangeGroup[] => {
    const byKey = new Map<
      string,
      {
        venda_recibo_id: string | null;
        numero_recibo: string | null;
        count_total: number;
        count_pendentes: number;
        earliestPendingAt: number | null;
        earliestPendingOld: number | null;
        latestPendingAt: number | null;
        latestPendingNew: number | null;
        latestAnyAt: number | null;
        latestAny: ConciliacaoChange | null;
        maxRevertedAt: number | null;
        allReverted: boolean;
        pending_change_ids: string[];
      }
    >();

    const toMs = (iso: string | null | undefined) => {
      const raw = String(iso || "").trim();
      if (!raw) return null;
      const d = new Date(raw);
      const ms = d.getTime();
      return Number.isNaN(ms) ? null : ms;
    };

    for (const ch of changes || []) {
      const key =
        (ch.venda_recibo_id ? `recibo:${ch.venda_recibo_id}` : null) ||
        (ch.numero_recibo ? `num:${ch.numero_recibo}` : null) ||
        `change:${ch.id}`;

      const changedAtMs = toMs(ch.changed_at) ?? 0;
      const revertedAtMs = toMs(ch.reverted_at);
      const isPending = !ch.reverted_at;

      const existing = byKey.get(key) || {
        venda_recibo_id: ch.venda_recibo_id || null,
        numero_recibo: ch.numero_recibo || null,
        count_total: 0,
        count_pendentes: 0,
        earliestPendingAt: null as number | null,
        earliestPendingOld: null as number | null,
        latestPendingAt: null as number | null,
        latestPendingNew: null as number | null,
        latestAnyAt: null as number | null,
        latestAny: null as ConciliacaoChange | null,
        maxRevertedAt: null as number | null,
        allReverted: true,
        pending_change_ids: [] as string[],
      };

      existing.count_total += 1;
      if (ch.numero_recibo && !existing.numero_recibo) existing.numero_recibo = ch.numero_recibo;
      if (ch.venda_recibo_id && !existing.venda_recibo_id) existing.venda_recibo_id = ch.venda_recibo_id;

      if (isPending) {
        existing.count_pendentes += 1;
        existing.allReverted = false;
        existing.pending_change_ids.push(ch.id);

        if (existing.earliestPendingAt == null || changedAtMs < existing.earliestPendingAt) {
          existing.earliestPendingAt = changedAtMs;
          existing.earliestPendingOld = ch.old_value ?? null;
        }
        if (existing.latestPendingAt == null || changedAtMs >= existing.latestPendingAt) {
          existing.latestPendingAt = changedAtMs;
          existing.latestPendingNew = ch.new_value ?? null;
        }
      }

      if (existing.latestAnyAt == null || changedAtMs >= existing.latestAnyAt) {
        existing.latestAnyAt = changedAtMs;
        existing.latestAny = ch;
      }

      if (revertedAtMs != null) {
        if (existing.maxRevertedAt == null || revertedAtMs > existing.maxRevertedAt) {
          existing.maxRevertedAt = revertedAtMs;
        }
      }

      byKey.set(key, existing);
    }

    const groups: ConciliacaoChangeGroup[] = [];

    for (const [key, g] of byKey.entries()) {
      const latest = g.latestAny;
      const origem = latest?.actor === "user" ? "manual" : "cron";
      const changedByLabel =
        latest?.changed_by_user?.nome_completo ||
        latest?.changed_by_user?.email ||
        (origem === "cron" ? "cron" : "-");

      const oldValue = g.count_pendentes > 0 ? g.earliestPendingOld : latest?.old_value ?? null;
      const newValue = g.count_pendentes > 0 ? g.latestPendingNew : latest?.new_value ?? null;

      const revertedAt = g.allReverted && g.maxRevertedAt != null ? new Date(g.maxRevertedAt).toISOString() : null;

      groups.push({
        key,
        venda_recibo_id: g.venda_recibo_id,
        numero_recibo: g.numero_recibo,
        count_total: g.count_total,
        count_pendentes: g.count_pendentes,
        old_value: oldValue,
        new_value: newValue,
        last_changed_at: latest?.changed_at || "",
        actor: latest?.actor || "cron",
        changed_by_label: changedByLabel,
        reverted_at: revertedAt,
        pending_change_ids: g.pending_change_ids,
      });
    }

    // Ordena por última alteração (desc)
    const ms = (iso: string) => {
      const d = new Date(iso);
      const t = d.getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    groups.sort((a, b) => ms(b.last_changed_at) - ms(a.last_changed_at));
    return groups;
  }, [changes]);

  async function reverterSelecionados() {
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return;
    }
    const selected = Array.from(selectedGroupKeys);
    if (!selected.length) {
      showToast("Selecione ao menos um recibo.", "error");
      return;
    }

    const ids = selected
      .flatMap((key) => changeGroups.find((g) => g.key === key)?.pending_change_ids || [])
      .filter(Boolean);

    if (!ids.length) {
      showToast("Nenhuma alteração pendente selecionada.", "error");
      return;
    }

    try {
      setLoadingChanges(true);
      const resp = await fetch("/api/v1/conciliacao/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ companyId: resolvedCompanyId, changeIds: ids }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any;
      showToast(`Revertidos: ${json?.reverted || 0}. Erros: ${json?.errored || 0}.`, "success");
      await carregarAlteracoes();
      await carregarLista();
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao reverter.", "error");
    } finally {
      setLoadingChanges(false);
    }
  }

  async function reverterTudo() {
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return;
    }

    try {
      setLoadingChanges(true);
      const resp = await fetch("/api/v1/conciliacao/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ companyId: resolvedCompanyId, revertAll: true, limit: 500 }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any;
      showToast(`Revertidos: ${json?.reverted || 0}. Erros: ${json?.errored || 0}.`, "success");
      await carregarAlteracoes();
      await carregarLista();
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao reverter tudo.", "error");
    } finally {
      setLoadingChanges(false);
    }
  }

  useEffect(() => {
    if (!resolvedCompanyId) return;
    carregarAlteracoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyId, somenteAlteracoesPendentes, monthFilter, dayFilter]);

  const conciliadosCount = useMemo(
    () => itens.filter((item) => item.conciliado).length,
    [itens]
  );
  const pendentesCount = useMemo(
    () => itens.filter((item) => !item.conciliado).length,
    [itens]
  );
  const divergenciasCount = useMemo(
    () =>
      itens.filter(
        (item) =>
          Math.abs(Number(item.diff_total || 0)) > 0.009 ||
          Math.abs(Number(item.diff_taxas || 0)) > 0.009
      ).length,
    [itens]
  );
  const alteracoesPendentesCount = useMemo(
    () => changeGroups.reduce((total, group) => total + group.count_pendentes, 0),
    [changeGroups]
  );

  const changeGroupsFiltrados = useMemo(() => {
    const search = alteracoesFiltroRecibo.trim().toLowerCase();
    if (!search) return changeGroups;
    return changeGroups.filter((g) =>
      String(g.numero_recibo || "").toLowerCase().includes(search)
    );
  }, [changeGroups, alteracoesFiltroRecibo]);

  // reset de página quando os dados mudam
  useEffect(() => { setPendentesFirst(0); }, [itensPendentes]);
  useEffect(() => { setConciliadosFirst(0); }, [itensConciliados]);
  useEffect(() => { setRankingFirst(0); }, [itensRankingPendentes]);
  useEffect(() => { setAlteracoesFirst(0); }, [changeGroupsFiltrados]);
  useEffect(() => { setVgFirst(0); }, [itensVisaoGeralFiltrados]);
  useEffect(() => { setImportacaoFirst(0); }, [parsedLinhas]);
  useEffect(() => { setExecucoesFirst(0); }, [execucoes]);

  // dados paginados por tabela
  const itensPendentesPage = useMemo(
    () => itensPendentes.slice(pendentesFirst, pendentesFirst + ROWS_PER_PAGE),
    [itensPendentes, pendentesFirst]
  );
  const itensConciliadosPage = useMemo(
    () => itensConciliados.slice(conciliadosFirst, conciliadosFirst + ROWS_PER_PAGE),
    [itensConciliados, conciliadosFirst]
  );
  const itensRankingPage = useMemo(
    () => itensRankingPendentes.slice(rankingFirst, rankingFirst + ROWS_PER_PAGE),
    [itensRankingPendentes, rankingFirst]
  );
  const changeGroupsPage = useMemo(
    () => changeGroupsFiltrados.slice(alteracoesFirst, alteracoesFirst + ROWS_PER_PAGE),
    [changeGroupsFiltrados, alteracoesFirst]
  );
  const itensVgPage = useMemo(
    () => itensVisaoGeralFiltrados.slice(vgFirst, vgFirst + ROWS_PER_PAGE),
    [itensVisaoGeralFiltrados, vgFirst]
  );
  const parsedLinhasPage = useMemo(
    () => parsedLinhas.slice(importacaoFirst, importacaoFirst + ROWS_PER_PAGE),
    [parsedLinhas, importacaoFirst]
  );
  const execucoesPage = useMemo(
    () => execucoes.slice(execucoesFirst, execucoesFirst + ROWS_PER_PAGE),
    [execucoes, execucoesFirst]
  );
  const registrosEmTela = useMemo(() => {
    if (atalhoAtivo === "conciliados_sistema") {
      return itens.filter((item) => item.conciliado);
    }
    if (atalhoAtivo === "atribuidos_ranking") {
      return itens.filter((item) => registroExigeAtribuicaoRanking(item) && registroTemRankingAtribuido(item));
    }
    if (atalhoAtivo === "pendentes_ranking") {
      return itens.filter((item) => registroExigeAtribuicaoRanking(item) && !registroTemRankingAtribuido(item));
    }
    return itens;
  }, [atalhoAtivo, itens]);
  const selectedPendingCount = useMemo(
    () =>
      changeGroups.reduce(
        (total, group) =>
          selectedGroupKeys.has(group.key) ? total + group.pending_change_ids.length : total,
        0
      ),
    [changeGroups, selectedGroupKeys]
  );
  const produtoMetaUnico = rankingProdutosMeta.length === 1 ? rankingProdutosMeta[0] : null;
  const linhasImportaveis = useMemo(
    () =>
      parsedLinhas.filter((linha) =>
        linhaEhImportavel(linha.status || linha.descricao || null)
      ),
    [parsedLinhas]
  );
  const linhasIgnoradasImportacao = useMemo(
    () =>
      parsedLinhas.filter(
        (linha) => !linhaEhImportavel(linha.status || linha.descricao || null)
      ),
    [parsedLinhas]
  );
  const pendentesAtribuicaoImportacao = useMemo(
    () =>
      linhasImportaveis.filter(
        (linha) =>
          linhaExigeAtribuicaoRanking(linha) &&
          !String(linha.ranking_vendedor_id || "").trim()
      ).length,
    [linhasImportaveis]
  );
  const rodapePreviewImportacao = useMemo(() => {
    if (parsedRodape.length === 0) return [];
    if (parsedLinhas.length === 0) return parsedRodape;

    const totais = parsedLinhas.reduce(
      (acc, linha) => {
        acc.valor_lancamentos += Number(linha.valor_lancamentos || 0);
        acc.valor_taxas += Number(linha.valor_taxas || 0);
        acc.valor_descontos += Number(linha.valor_descontos || 0);
        acc.valor_abatimentos += Number(linha.valor_abatimentos || 0);
        acc.valor_venda_real += Number(linha.valor_venda_real || 0);
        acc.valor_comissao_loja += Number(linha.valor_comissao_loja || 0);
        return acc;
      },
      {
        valor_lancamentos: 0,
        valor_taxas: 0,
        valor_descontos: 0,
        valor_abatimentos: 0,
        valor_venda_real: 0,
        valor_comissao_loja: 0,
      }
    );

    const percentual =
      totais.valor_venda_real > 0
        ? (totais.valor_comissao_loja / totais.valor_venda_real) * 100
        : null;

    return parsedRodape.map((item) => ({
      ...item,
      valor_lancamentos: totais.valor_lancamentos,
      valor_taxas: totais.valor_taxas,
      valor_descontos: totais.valor_descontos,
      valor_abatimentos: totais.valor_abatimentos,
      valor_venda_real: totais.valor_venda_real,
      valor_comissao_loja: totais.valor_comissao_loja,
      percentual_comissao_loja: percentual,
    }));
  }, [parsedLinhas, parsedRodape]);
  useEffect(() => {
    if (!produtoMetaUnico?.id) return;
    setParsedLinhas((prev) =>
      prev.map((linha) => {
        if (!linhaExigeAtribuicaoRanking(linha) || !linha.is_seguro_viagem || linha.ranking_produto_id) {
          return linha;
        }
        return {
          ...linha,
          ranking_produto_id: produtoMetaUnico.id,
        };
      })
    );
  }, [produtoMetaUnico?.id]);
  const resumoMeses = resumo?.byMonth || [];
  const resumoDias = resumo?.byDay || [];
  useEffect(() => { setResumoFirst(0); }, [resumoMeses]);
  const resumoMesesPage = useMemo(
    () => resumoMeses.slice(resumoFirst, resumoFirst + ROWS_PER_PAGE),
    [resumoMeses, resumoFirst]
  );
  const monthOptions = useMemo(
    () => buildRecentMonthOptions(monthFilter, resumoMeses.map((item) => item.month)),
    [monthFilter, resumoMeses]
  );
  const calendarWeeks = useMemo(
    () => getMonthCalendarMatrix(monthFilter, resumoDias),
    [monthFilter, resumoDias]
  );
  const resumoDiasPendentes = resumoDias.filter(
    (item) => (item.pendentesConciliacao || 0) > 0 || (item.pendentesImportacao || 0) > 0
  );
  const diasPendentesImportacao = useMemo(
    () =>
      resumoDias
        .filter((item) => (item.pendentesImportacao || 0) > 0 || item.status === "IMPORTACAO_PENDENTE")
        .map((item) => item.date),
    [resumoDias]
  );
  const diasPendentesConciliacao = useMemo(
    () =>
      resumoDias
        .filter((item) => (item.pendentesConciliacao || 0) > 0)
        .map((item) => item.date),
    [resumoDias]
  );
  const diasPendentesRanking = useMemo(
    () =>
      resumoDias
        .filter((item) => (item.pendentesRanking || 0) > 0)
        .map((item) => item.date),
    [resumoDias]
  );
  const resumoTotais = resumo?.totals || {};
  const ultimaExecucao = execucoes[0] || null;
  const filtrosRapidosAtivos =
    Boolean(atalhoAtivo) || Boolean(dayFilter) || !somentePendentes || rankingStatusFilter !== "pending";
  const resumoRegistros = [
    getShortcutTitle(atalhoAtivo),
    monthFilter ? formatMonthLabel(monthFilter) : null,
    dayFilter ? formatDate(dayFilter) : null,
    `${registrosEmTela.length} registro(s) em tela`,
  ]
    .filter(Boolean)
    .join(" • ");

  function renderPaginator(first: number, total: number, onPageChange: (first: number) => void) {
    if (total <= ROWS_PER_PAGE) return null;
    return (
      <div className="mt-3">
        <Paginator
          first={first}
          rows={ROWS_PER_PAGE}
          totalRecords={total}
          onPageChange={(event) => onPageChange(event.first)}
        />
      </div>
    );
  }

  function limparAtalhosRegistros() {
    setAtalhoAtivo(null);
    setDayFilter("");
    setSomentePendentes(true);
    setRankingStatusFilter("pending");
    setSecaoAtiva("registros");
    void carregarLista({
      dayFilter: "",
      somentePendentes: true,
      rankingStatusFilter: "pending",
    });
  }

  async function abrirAtalho(shortcut: ConciliacaoShortcut) {
    if (precisaEmpresaMaster) return;
    setAtalhoAtivo(shortcut);

    if (shortcut === "dias_pendentes_importacao") {
      setSecaoAtiva("resumo");
      setDayFilter("");
      setShowPendingDetails(true);
      return;
    }

    let nextFilters: ConciliacaoListFilters = {
      somentePendentes,
      monthFilter,
      dayFilter: "",
      rankingStatusFilter,
    };

    setSecaoAtiva("registros");
    setShowPendingDetails(false);

    if (shortcut === "importados") {
      nextFilters = {
        ...nextFilters,
        dayFilter: "",
        somentePendentes: false,
        rankingStatusFilter: "all",
      };
    }
    if (shortcut === "pendentes_conciliacao") {
      nextFilters = {
        ...nextFilters,
        dayFilter: "",
        somentePendentes: true,
        rankingStatusFilter: "all",
      };
    }
    if (shortcut === "pendentes_ranking") {
      nextFilters = {
        ...nextFilters,
        dayFilter: "",
        somentePendentes: false,
        rankingStatusFilter: "pending",
      };
    }
    if (shortcut === "conciliados_sistema") {
      nextFilters = {
        ...nextFilters,
        dayFilter: "",
        somentePendentes: false,
        rankingStatusFilter: "all",
      };
    }
    if (shortcut === "atribuidos_ranking") {
      nextFilters = {
        ...nextFilters,
        dayFilter: "",
        somentePendentes: false,
        rankingStatusFilter: "assigned",
      };
    }

    setDayFilter(nextFilters.dayFilter);
    setSomentePendentes(nextFilters.somentePendentes);
    setRankingStatusFilter(nextFilters.rankingStatusFilter);
    await carregarLista(nextFilters);
  }

  const navSections: Array<{ id: ConciliacaoSection; label: string; subtitle: string; badge?: string | number }> = [
    {
      id: "importacao",
      label: "Importar arquivo",
      subtitle: "Carregue o arquivo e atribua vendedores antes de salvar e conciliar.",
    },
    {
      id: "visao_geral",
      label: "Visão geral",
      subtitle: "Todos os registros importados com filtros diretos na tabela.",
    },
    {
      id: "pendentes",
      label: "Conciliação pendente",
      subtitle: "Registros ainda não conciliados com as vendas.",
      badge: pendentesCount > 0 ? pendentesCount : undefined,
    },
    {
      id: "registros",
      label: "Registros conciliados",
      subtitle: "Registros já conciliados com as vendas do sistema.",
    },
    {
      id: "pendentes_ranking",
      label: "Pendentes ranking",
      subtitle: "Recibos ainda sem atribuição de vendedor no ranking.",
      badge: itensRankingPendentes.length > 0 ? itensRankingPendentes.length : undefined,
    },
    {
      id: "alteracoes",
      label: "Histórico de alterações",
      subtitle: "Controle alterações de taxas e reverta ajustes pendentes.",
      badge: alteracoesPendentesCount > 0 ? alteracoesPendentesCount : undefined,
    },
  ];

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard
          title="Acesso ao modulo de conciliacao"
          subtitle="Seu perfil nao possui permissao para consultar a conciliacao financeira."
        >
          <p>Solicite ao gestor ou ao master a liberacao do acesso ao modulo.</p>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  if (loadingUser) return <LoadingUsuarioContext />;

  const precisaEmpresaMaster = isMaster && !resolvedCompanyId;
  const empresaAtualLabel = isMaster
    ? empresas.find((empresa) => empresa.id === empresaSelecionada)?.nome_fantasia || "empresa selecionada"
    : userCtx?.companyNome || "empresa atual";
  const resumoToolbar = precisaEmpresaMaster
    ? "Selecione uma empresa para importar arquivo, conciliar lancamentos e revisar alteracoes."
    : `Operacao ativa em ${empresaAtualLabel}. Pendentes: ${pendentesCount}. Divergencias: ${divergenciasCount}.`;

  return (
    <AppPrimerProvider>
      {(conciliando || buscandoVendedores) && (
        <div className="vtur-conciliacao-overlay">
          <div className="vtur-conciliacao-overlay-box">
            <ProgressSpinner
              style={{ width: "56px", height: "56px" }}
              strokeWidth="4"
              animationDuration="0.9s"
            />
            <span className="vtur-conciliacao-overlay-msg">
              {buscandoVendedores
                ? "Por favor aguarde enquanto verifico se já existe vendedor para os recibos importados..."
                : "Por favor aguarde o fim da conciliação..."}
            </span>
          </div>
        </div>
      )}
      <div className="conciliacao-page page-content-wrap">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        <AppCard
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Conciliacao financeira"
          subtitle={resumoToolbar}
        >
          {isMaster ? (
            <AppField
              as="select"
              label="Empresa"
              value={empresaSelecionada}
              onChange={(e) => setEmpresaSelecionada(e.target.value)}
              options={[
                { label: "Selecione...", value: "all" },
                ...empresas.map((empresa) => ({
                  label: empresa.nome_fantasia || empresa.id,
                  value: empresa.id,
                })),
              ]}
            />
          ) : null}
        </AppCard>

        <AppCard tone="config" className="mb-3 list-toolbar-sticky vtur-conciliacao-tab-card">
          <div className="vtur-conciliacao-tab-nav">
            {navSections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                className={["vtur-conciliacao-tab-btn", secaoAtiva === sec.id ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => { setSecaoAtiva(sec.id); setResumoDetalheAberto(false); }}
              >
                <span className="vtur-conciliacao-tab-btn-label">
                  {sec.label}
                  {sec.badge != null ? <span className="vtur-conciliacao-tab-btn-badge">{sec.badge}</span> : null}
                </span>
                <span className="vtur-conciliacao-tab-btn-sub">{sec.subtitle}</span>
              </button>
            ))}
          </div>
        </AppCard>

        {secaoAtiva === "resumo" && <>

            <AppCard
              tone="config"
              className="mb-3"
              title="Resumo operacional"
              subtitle="Clique em um mês para ver os registros conciliados daquele período abaixo."
            >
              <div className="vtur-inline-filter-row mb-3">
                <AppField
                  as="select"
                  label="Mês"
                  value={monthFilter}
                  onChange={(e) => { setAtalhoAtivo(null); setMonthFilter(e.target.value); setDayFilter(""); }}
                  disabled={loadingResumo}
                  options={monthOptions}
                />
                <div className="vtur-inline-filter-actions">
                  <AppButton type="button" variant="secondary" disabled={loadingResumo || precisaEmpresaMaster} onClick={carregarResumo}>
                    {loadingResumo ? "Atualizando..." : "Atualizar"}
                  </AppButton>
                </div>
              </div>
              <div className="table-container">
                <table className="table-default table-header-blue table-mobile-cards min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Total</th>
                      <th>Conciliados sist.</th>
                      <th>Pendentes conciliação</th>
                      <th>Dias pendentes importação</th>
                      <th>Pendentes ranking</th>
                      <th>Atribuídos ranking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoMeses.length === 0 ? (
                      <tr>
                        <td colSpan={7}>Sem resumo mensal disponível.</td>
                      </tr>
                    ) : (
                      resumoMesesPage.map((item) => (
                        <tr
                          key={item.month}
                          className="vtur-conciliacao-resumo-row"
                          title={`Filtrar por ${formatMonthLabel(item.month)}`}
                          onClick={() => {
                            setMonthFilter(item.month);
                            setDayFilter("");
                            setAtalhoAtivo(null);
                            setResumoDetalheAberto(true);
                          }}
                        >
                          <td data-label="Mês">{formatMonthLabel(item.month)}</td>
                          <td data-label="Total">{item.total}</td>
                          <td data-label="Conciliados sist.">{item.conciliadosSistema}</td>
                          <td data-label="Pendentes conciliação">{item.pendentesConciliacao}</td>
                          <td data-label="Dias pendentes importação">{item.pendentesImportacao || 0}</td>
                          <td data-label="Pendentes ranking">{item.pendentesRanking}</td>
                          <td data-label="Atribuídos ranking">{item.atribuidosRanking}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {renderPaginator(resumoFirst, resumoMeses.length, setResumoFirst)}

              {false && <div className="vtur-conciliacao-overview mt-3">
                <div className="vtur-conciliacao-month-banner">
                  <span className="vtur-quote-summary-label">Mês em exibição</span>
                  <strong>{formatMonthLabel(monthFilter)}</strong>
                </div>

                <div className="vtur-conciliacao-calendar-card">
                  <div className="vtur-conciliacao-calendar-head">
                    <div>
                      <h4>Mapa mensal de pendências</h4>
                      <p>Visual rápido dos dias do mês com importação, conciliação e ranking.</p>
                    </div>
                    <div className="vtur-conciliacao-legend">
                      <span className="vtur-conciliacao-legend-item">
                        <span className="vtur-conciliacao-dot ok" />
                        OK
                      </span>
                      <span className="vtur-conciliacao-legend-item">
                        <span className="vtur-conciliacao-dot conciliacao" />
                        Conciliação
                      </span>
                      <span className="vtur-conciliacao-legend-item">
                        <span className="vtur-conciliacao-dot importacao" />
                        Importação
                      </span>
                      <span className="vtur-conciliacao-legend-item">
                        <span className="vtur-conciliacao-dot ranking" />
                        Ranking
                      </span>
                    </div>
                  </div>

                  <div className="vtur-conciliacao-calendar-grid">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => (
                      <div key={label} className="vtur-conciliacao-calendar-weekday">
                        {label}
                      </div>
                    ))}
                    {calendarWeeks.flat().map((cell, index) => {
                      const tone = getResumoDiaTone(cell.item);
                      const dayNumber = cell.date ? Number(cell.date.slice(-2)) : "";
                      const canFilter = Boolean(cell.item?.date);
                      return (
                        <AppButton
                          key={cell.date || `empty-${index}`}
                          type="button"
                          variant="ghost"
                          className={`vtur-conciliacao-calendar-day ${tone}`}
                          disabled={!canFilter}
                          title={cell.date ? `${formatDate(cell.date)} • ${getResumoDiaLabel(cell.item)}` : ""}
                          onClick={() => {
                            if (!cell.item?.date) return;
                            setAtalhoAtivo(null);
                            setDayFilter(cell.item.date);
                            setSecaoAtiva("registros");
                          }}
                        >
                          <span className="vtur-conciliacao-calendar-day-number">{dayNumber}</span>
                          {cell.item ? (
                            <span className="vtur-conciliacao-calendar-day-meta">
                              {getResumoDiaTone(cell.item) === "importacao"
                                ? "Importar"
                                : getResumoDiaTone(cell.item) === "conciliacao"
                                ? "Conc."
                                : getResumoDiaTone(cell.item) === "ranking"
                                ? "Rank."
                                : cell.item.total > 0
                                ? cell.item.total
                                : ""}
                            </span>
                          ) : null}
                        </AppButton>
                      );
                    })}
                  </div>
                </div>

                <div className="vtur-conciliacao-pending-card">
                  <h4>Dias pendentes no mês</h4>
                  <div className="vtur-conciliacao-pending-chips">
                    <AppButton
                      type="button"
                      variant="ghost"
                      className="vtur-conciliacao-pending-chip importacao"
                      onClick={() => setShowPendingDetails(true)}
                    >
                      <strong>Importação</strong>
                      <span>{formatPendingDayList(diasPendentesImportacao)}</span>
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="ghost"
                      className="vtur-conciliacao-pending-chip conciliacao"
                      onClick={() => setShowPendingDetails(true)}
                    >
                      <strong>Conciliação</strong>
                      <span>{formatPendingDayList(diasPendentesConciliacao)}</span>
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="ghost"
                      className="vtur-conciliacao-pending-chip ranking"
                      onClick={() => setShowPendingDetails(true)}
                    >
                      <strong>Ranking</strong>
                      <span>{formatPendingDayList(diasPendentesRanking)}</span>
                    </AppButton>
                  </div>

                  <div className="vtur-conciliacao-pending-actions">
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={() => setShowPendingDetails((prev) => !prev)}
                    >
                      {showPendingDetails ? "Ocultar detalhes" : "Ver detalhes"}
                    </AppButton>
                    {dayFilter ? (
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() => setDayFilter("")}
                      >
                        Limpar filtro do dia
                      </AppButton>
                    ) : null}
                  </div>
                </div>
              </div>}
            </AppCard>

            <AppCard
              className="mb-3"
              title="Execuções da conciliação"
              subtitle="Histórico das últimas tentativas manuais e automáticas da rotina de conciliação."
            >
              <div className="vtur-quote-summary-grid">
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Última execução</span>
                  <strong>{ultimaExecucao ? formatDateTime(ultimaExecucao.created_at) : "-"}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Origem</span>
                  <strong>{ultimaExecucao ? (ultimaExecucao.actor === "user" ? "manual" : "cron") : "-"}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Último status</span>
                  <strong>{ultimaExecucao?.status || "-"}</strong>
                </div>
                <div className="vtur-form-actions" style={{ alignItems: "flex-end" }}>
                  <AppButton
                    type="button"
                    variant="secondary"
                    disabled={loadingExecucoes || precisaEmpresaMaster}
                    onClick={carregarExecucoes}
                  >
                    {loadingExecucoes ? "Atualizando..." : "Atualizar execuções"}
                  </AppButton>
                </div>
              </div>

              <div className="mt-3 table-container">
                <table className="table-default table-header-blue table-mobile-cards min-w-[980px]">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Origem</th>
                      <th>Por</th>
                      <th>Checados</th>
                      <th>Conciliados</th>
                      <th>Taxas atualizadas</th>
                      <th>Pendentes após execução</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execucoes.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          {loadingExecucoes ? "Carregando execuções..." : "Nenhuma execução registrada para esta empresa."}
                        </td>
                      </tr>
                    ) : (
                      execucoesPage.map((item) => (
                        <tr key={item.id}>
                          <td data-label="Quando">{formatDateTime(item.created_at)}</td>
                          <td data-label="Origem">{item.actor === "user" ? "manual" : "cron"}</td>
                          <td data-label="Por">
                            {item.actor_user?.nome_completo || item.actor_user?.email || (item.actor === "user" ? "-" : "cron")}
                          </td>
                          <td data-label="Checados">{item.checked}</td>
                          <td data-label="Conciliados">{item.reconciled}</td>
                          <td data-label="Taxas atualizadas">{item.updated_taxes}</td>
                          <td data-label="Pendentes após execução">{item.still_pending}</td>
                          <td data-label="Status">
                            {item.status === "error" && item.error_message
                              ? `${item.status}: ${item.error_message}`
                              : item.status}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {renderPaginator(execucoesFirst, execucoes.length, setExecucoesFirst)}
            </AppCard>

        </>}

        {secaoAtiva === "importacao" && <>

        <AppCard
            tone="config"
            className="mb-3"
            id="conciliacao-importacao"
            title="Importar arquivo da conciliacao"
            subtitle="Carregue TXT, XLS ou XLSX, revise todas as linhas operacionais e atribua o vendedor recibo por recibo antes de importar."
            actions={
              <div className="vtur-import-upload-row">
                <label
                  className={[
                    "p-button",
                    "p-component",
                    "vtur-app-button",
                    "vtur-app-button-default",
                    "vtur-import-upload-trigger",
                    importando || conciliando || precisaEmpresaMaster ? "is-disabled p-disabled" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  htmlFor="conciliacao-upload-input"
                >
                  Escolher arquivo
                </label>
                <input
                  id="conciliacao-upload-input"
                  ref={fileRef}
                  type="file"
                  accept=".txt,.xls,.xlsx"
                  style={{ display: "none" }}
                  disabled={importando || conciliando || precisaEmpresaMaster}
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                />
                <span className="vtur-import-file-name">
                  {arquivo?.name || "Nenhum arquivo selecionado"}{" "}
                  {parsedMovimentoData ? `• Data do movimento: ${formatDate(parsedMovimentoData)}` : ""}
                </span>
              </div>
            }
          >
            <div className="vtur-import-upload-stack">
              <div className="vtur-quote-summary-grid">
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Linhas reconhecidas</span>
                  <strong>{parsedLinhas.length}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Importáveis</span>
                  <strong>{linhasImportaveis.length}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Ignoradas</span>
                  <strong>{linhasIgnoradasImportacao.length}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Pendentes atribuição</span>
                  <strong>{pendentesAtribuicaoImportacao}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Arquivo</span>
                  <strong>{arquivo?.name || "-"}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Data movimento</span>
                  <strong>{parsedMovimentoData ? formatDate(parsedMovimentoData) : "-"}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Empresa</span>
                  <strong>{precisaEmpresaMaster ? "Selecione uma empresa" : empresaAtualLabel}</strong>
                </div>
              </div>
            </div>

            {buscandoVendedores ? (
              <AlertMessage variant="info" className="mt-3 vtur-conciliacao-inline-alert">
                <span>Buscando vendedores automaticamente nas vendas registradas no sistema...</span>
              </AlertMessage>
            ) : null}

            {linhasIgnoradasImportacao.length > 0 ? (
              <AlertMessage variant="warning" className="mt-3 vtur-conciliacao-inline-alert">
                <span className="vtur-conciliacao-inline-alert-copy">
                  <span>
                    {`${linhasIgnoradasImportacao.length} linha(s) com status diferente de BAIXA, OPFAX ou ESTORNO serão ignoradas na importação.`}
                  </span>
                </span>
              </AlertMessage>
            ) : null}

            {pendentesAtribuicaoImportacao > 0 ? (
              <AlertMessage variant="info" className="mt-3 vtur-conciliacao-inline-alert">
                <span className="vtur-conciliacao-inline-alert-copy">
                  <span>
                    A atribuição do vendedor/gestor é obrigatória para recibos efetivados, incluindo BAIXA DE OPFAX, antes da importação.
                  </span>
                  <strong className="vtur-conciliacao-inline-alert-emphasis">
                    {`Ainda faltam ${pendentesAtribuicaoImportacao}.`}
                  </strong>
                </span>
              </AlertMessage>
            ) : null}

            <div className="mt-3">
              <DataTable
                headers={
                  <tr>
                    <th>Data</th>
                    <th>Documento</th>
                    <th>Status</th>
                    <th>Descricao</th>
                    <th>Vendedor ranking</th>
                    <th>Meta dif.</th>
                    <th>Lançamentos</th>
                    <th>Taxas</th>
                    <th>Descontos</th>
                    <th>Abatimentos</th>
                    <th>Venda real</th>
                    <th>Comissão loja</th>
                    <th>% loja</th>
                  </tr>
                }
                footer={
                  rodapePreviewImportacao.length > 0 ? (
                    <>
                      {rodapePreviewImportacao.map((item) => (
                        <tr key={`import-footer-${item.label}`} className="vtur-data-table-footer-row">
                          <td colSpan={6}>{item.label === "SUBTOTAL" ? "Subtotal" : "Total"}</td>
                          <td>{formatMoney(item.valor_lancamentos)}</td>
                          <td>{formatMoney(item.valor_taxas)}</td>
                          <td>{formatMoney(item.valor_descontos)}</td>
                          <td>{formatMoney(item.valor_abatimentos)}</td>
                          <td>{formatMoney(item.valor_venda_real)}</td>
                          <td>{formatMoney(item.valor_comissao_loja)}</td>
                          <td>
                            {item.percentual_comissao_loja != null
                              ? `${Number(item.percentual_comissao_loja).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}%`
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : null
                }
                empty={parsedLinhas.length === 0}
                emptyMessage={
                  <EmptyState
                    title="Nenhum preview carregado"
                    description="Selecione um arquivo valido para revisar as primeiras linhas antes da importacao."
                  />
                }
                colSpan={13}
                className="table-header-blue table-mobile-cards min-w-[1960px]"
              >
                {parsedLinhasPage.map((linha, pageIndex) => {
                  const index = importacaoFirst + pageIndex;
                  const exigeAtribuicao = linhaExigeAtribuicaoRanking(linha);
                  const linhaKey = `${linha.documento}-${linha.descricao_chave || linha.status || "row"}-${index}`;
                  const rankingTooltip = getLinhaRankingTooltip({ status: linha.status, descricao: linha.descricao });
                  return (
                    <tr key={linhaKey}>
                      <td data-label="Data">{formatDate(linha.movimento_data)}</td>
                      <td data-label="Documento">{linha.documento}</td>
                      <td data-label="Status">
                        {getLinhaStatusLabel({ status: linha.status, descricao: linha.descricao })}
                      </td>
                      <td data-label="Descricao">{linha.descricao || "-"}</td>
                      <td data-label="Vendedor ranking">
                        {exigeAtribuicao ? (
                          <select
                            className="form-select"
                            value={linha.ranking_vendedor_id || ""}
                            disabled={loadingOptions || importando || conciliando}
                            onChange={(e) =>
                              atualizarLinhaImportada(index, {
                                ranking_vendedor_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">Selecione...</option>
                            {rankingAssignees.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.nome_completo}
                                {opt.tipo ? ` (${opt.tipo})` : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={rankingTooltip ? "vtur-hint-tooltip" : undefined}
                            data-tooltip={rankingTooltip || undefined}
                            tabIndex={rankingTooltip ? 0 : undefined}
                          >
                            {getLinhaRankingHint({ status: linha.status, descricao: linha.descricao })}
                          </span>
                        )}
                      </td>
                      <td data-label="Meta dif.">
                        {!exigeAtribuicao ? (
                          <span>-</span>
                        ) : rankingProdutosMeta.length === 0 ? (
                          <span>-</span>
                        ) : produtoMetaUnico ? (
                          linha.is_seguro_viagem ? (
                            <span>Seguro Viagem</span>
                          ) : (
                            <span>Não</span>
                          )
                        ) : (
                          <select
                            className="form-select"
                            value={linha.ranking_produto_id || ""}
                            disabled={loadingOptions || importando || conciliando}
                            onChange={(e) =>
                              atualizarLinhaImportada(index, {
                                ranking_produto_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">Não</option>
                            {rankingProdutosMeta.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.nome}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td data-label="Lançamentos">
                        <input
                          className="form-input"
                          inputMode="decimal"
                          value={parsedMoneyDrafts[linhaKey]?.valor_lancamentos ?? formatMoney(linha.valor_lancamentos)}
                          disabled={importando || conciliando}
                          onChange={(e) => updateParsedMoneyDraft(linhaKey, "valor_lancamentos", e.target.value)}
                          onBlur={(e) => commitParsedMoneyDraft(index, linhaKey, "valor_lancamentos", e.target.value)}
                        />
                      </td>
                      <td data-label="Taxas">
                        <input
                          className="form-input"
                          inputMode="decimal"
                          value={parsedMoneyDrafts[linhaKey]?.valor_taxas ?? formatMoney(linha.valor_taxas)}
                          disabled={importando || conciliando}
                          onChange={(e) => updateParsedMoneyDraft(linhaKey, "valor_taxas", e.target.value)}
                          onBlur={(e) => commitParsedMoneyDraft(index, linhaKey, "valor_taxas", e.target.value)}
                        />
                      </td>
                      <td data-label="Descontos">
                        <input
                          className="form-input"
                          inputMode="decimal"
                          value={parsedMoneyDrafts[linhaKey]?.valor_descontos ?? formatMoney(linha.valor_descontos)}
                          disabled={importando || conciliando}
                          onChange={(e) => updateParsedMoneyDraft(linhaKey, "valor_descontos", e.target.value)}
                          onBlur={(e) => commitParsedMoneyDraft(index, linhaKey, "valor_descontos", e.target.value)}
                        />
                      </td>
                      <td data-label="Abatimentos">
                        <input
                          className="form-input"
                          inputMode="decimal"
                          value={parsedMoneyDrafts[linhaKey]?.valor_abatimentos ?? formatMoney(linha.valor_abatimentos)}
                          disabled={importando || conciliando}
                          onChange={(e) => updateParsedMoneyDraft(linhaKey, "valor_abatimentos", e.target.value)}
                          onBlur={(e) => commitParsedMoneyDraft(index, linhaKey, "valor_abatimentos", e.target.value)}
                        />
                      </td>
                      <td data-label="Venda real">{formatMoney(linha.valor_venda_real)}</td>
                      <td data-label="Comissão loja">
                        <input
                          className="form-input"
                          inputMode="decimal"
                          value={
                            parsedMoneyDrafts[linhaKey]?.valor_comissao_loja ?? formatMoney(linha.valor_comissao_loja)
                          }
                          disabled={importando || conciliando}
                          onChange={(e) => updateParsedMoneyDraft(linhaKey, "valor_comissao_loja", e.target.value)}
                          onBlur={(e) => commitParsedMoneyDraft(index, linhaKey, "valor_comissao_loja", e.target.value)}
                        />
                      </td>
                      <td data-label="% loja">
                        {linha.percentual_comissao_loja != null
                          ? `${Number(linha.percentual_comissao_loja).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}%`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
            {renderPaginator(importacaoFirst, parsedLinhas.length, setImportacaoFirst)}

            <div className="vtur-quote-top-actions mt-3">
              <AppButton
                type="button"
                variant="primary"
                disabled={importando || conciliando || importacaoSalva || buscandoVendedores || precisaEmpresaMaster || parsedLinhas.length === 0 || pendentesAtribuicaoImportacao > 0}
                onClick={() => { void salvarImportacao(false); }}
              >
                {importando ? "Salvando..." : importacaoSalva ? "Salvo" : "Salvar"}
              </AppButton>
              <AppButton
                type="button"
                variant={importacaoSalva ? "primary" : "secondary"}
                disabled={!importacaoSalva || conciliando || importando || precisaEmpresaMaster}
                onClick={() => { void conciliarAposImport(); }}
              >
                {conciliando ? "Conciliando..." : "Conciliar"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                disabled={importando || conciliando || (!arquivo && parsedLinhas.length === 0)}
                onClick={limparImportacao}
              >
                Limpar
              </AppButton>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              1. Escolha o arquivo · 2. Revise os valores · 3. <strong>Salvar</strong> · 4. <strong>Conciliar</strong>
            </p>
          </AppCard>

        </>}

        {secaoAtiva === "visao_geral" && <>

          <AppCard
            tone="config"
            className="mb-3"
            title="Visão geral"
            subtitle="Todos os registros importados. Aplique filtros acima da tabela para localizar registros."
            actions={
              <AppButton type="button" variant="secondary" disabled={loadingVisaoGeral || precisaEmpresaMaster} onClick={carregarVisaoGeral}>
                {loadingVisaoGeral ? "Atualizando..." : "Atualizar lista"}
              </AppButton>
            }
          >
            <div className="vtur-inline-filter-row mb-3">
              <AppField
                as="input"
                label="Recibo"
                value={vgFiltroDocumento}
                onChange={(e) => setVgFiltroDocumento((e as React.ChangeEvent<HTMLInputElement>).target.value)}
                placeholder="Buscar..."
              />
              <AppField
                as="select"
                label="Status"
                value={vgFiltroStatus}
                onChange={(e) => setVgFiltroStatus((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
                options={[
                  { label: "Todos", value: "all" },
                  ...vgStatusOptions.map((s) => ({ label: s, value: s })),
                ]}
              />
              <AppField
                as="select"
                label="Vendedor ranking"
                value={vgFiltroVendedor}
                onChange={(e) => setVgFiltroVendedor((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
                options={[
                  { label: "Todos", value: "all" },
                  ...vgVendedorOptions.map((v) => ({ label: v, value: v })),
                ]}
              />
              <AppField
                as="select"
                label="Mês"
                value={vgFiltroMes}
                onChange={(e) => {
                  setVgFiltroMes((e as React.ChangeEvent<HTMLSelectElement>).target.value);
                  setVgFiltroDia("all");
                }}
                options={[
                  { label: "Todos", value: "all" },
                  ...vgMesOptions.map((m) => ({ label: formatMonthLabel(m), value: m })),
                ]}
              />
              <AppField
                as="select"
                label="Dia"
                value={vgFiltroDia}
                onChange={(e) => setVgFiltroDia((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
                disabled={vgFiltroMes === "all"}
                options={[
                  { label: "Todos do mês", value: "all" },
                  ...vgDiaOptions.map((d) => ({ label: formatDate(d), value: d })),
                ]}
              />
              <AppField
                as="select"
                label="Recibo encontrado"
                value={vgFiltroReciboEncontrado}
                onChange={(e) => setVgFiltroReciboEncontrado((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
                options={[
                  { label: "Todos", value: "all" },
                  { label: "Sim", value: "sim" },
                  { label: "Não", value: "nao" },
                ]}
              />
              <AppField
                as="select"
                label="Ranking"
                value={vgFiltroRanking}
                onChange={(e) => setVgFiltroRanking((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
                options={[
                  { label: "Todos", value: "all" },
                  { label: "Sim", value: "sim" },
                  { label: "Não", value: "nao" },
                ]}
              />
              <AppField
                as="select"
                label="Conciliado"
                value={vgFiltroConciliado}
                onChange={(e) => setVgFiltroConciliado((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
                options={[
                  { label: "Todos", value: "all" },
                  { label: "Sim", value: "sim" },
                  { label: "Não", value: "nao" },
                ]}
              />
              <div className="vtur-inline-filter-actions">
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setVgFiltroDocumento("");
                    setVgFiltroVendedor("all");
                    setVgFiltroStatus("all");
                    setVgFiltroMes("all");
                    setVgFiltroDia("all");
                    setVgFiltroReciboEncontrado("all");
                    setVgFiltroRanking("all");
                    setVgFiltroConciliado("all");
                  }}
                >
                  Limpar
                </AppButton>
              </div>
            </div>
            <div className="vtur-conciliacao-resumo-strip mb-3">
              <span>
                <strong>{itensVisaoGeralFiltrados.length}</strong> de{" "}
                <strong>{itensVisaoGeralComputados.length}</strong> registro(s)
              </span>
            </div>
            <DataTable
              headers={
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Status</th>
                  <th>Recibo encontrado</th>
                  <th>Vendedor ranking</th>
                  <th>Ranking</th>
                  <th>Meta dif.</th>
                  <th>Lançamentos</th>
                  <th>Taxas (arq)</th>
                  <th>Descontos</th>
                  <th>Abatimentos</th>
                  <th>Venda real</th>
                  <th>Comissão loja</th>
                  <th>% loja</th>
                  <th>Total (sist)</th>
                  <th>Taxas (sist)</th>
                  <th>Diff total</th>
                  <th>Diff taxas</th>
                  <th>Conciliado</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              loading={loadingVisaoGeral}
              empty={!loadingVisaoGeral && itensVisaoGeralFiltrados.length === 0}
              emptyMessage={
                <EmptyState
                  title={precisaEmpresaMaster ? "Selecione uma empresa" : "Nenhum registro encontrado"}
                  description={
                    precisaEmpresaMaster
                      ? "Escolha a empresa para liberar a listagem."
                      : "Não há registros para os filtros selecionados."
                  }
                />
              }
              colSpan={20}
              className="table-header-green table-mobile-cards min-w-[2040px]"
            >
              {itensVgPage.map((row) => {
                const rowSaving = savingAssignmentId === row.id;
                const rowLocked = isRowLocked(row);
                const exigeAtribuicaoRanking = registroExigeAtribuicaoRanking(row);
                const rankingTooltip = getLinhaRankingTooltip({ status: row.status, descricao: row.descricao });
                return (
                  <tr key={row.id}>
                    <td data-label="Data">{formatDate(row.movimento_data)}</td>
                    <td data-label="Documento">{row.documento}</td>
                    <td data-label="Status">
                      {getLinhaStatusLabel({ status: row.status, descricao: row.descricao })}
                    </td>
                    <td data-label="Recibo encontrado">
                      {row._recibo_encontrado ? (
                        <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                      ) : (
                        <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />
                      )}
                    </td>
                    <td data-label="Vendedor ranking">
                      {row._vendedor_nome ? (
                        <span>{row._vendedor_nome}</span>
                      ) : exigeAtribuicaoRanking ? (
                        <span className="vtur-muted-text">Não atribuído</span>
                      ) : (
                        <span
                          className={rankingTooltip ? "vtur-hint-tooltip" : undefined}
                          data-tooltip={rankingTooltip || undefined}
                          tabIndex={rankingTooltip ? 0 : undefined}
                        >
                          {getLinhaRankingHint({ status: row.status, descricao: row.descricao })}
                        </span>
                      )}
                    </td>
                    <td data-label="Ranking">
                      {exigeAtribuicaoRanking ? (
                        row._ranking_ok ? (
                          <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                        ) : (
                          <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />
                        )
                      ) : (
                        <span className="vtur-badge vtur-badge-muted">—</span>
                      )}
                    </td>
                    <td data-label="Meta dif.">
                      {row._produto_nome ? (
                        <span>{row._produto_nome}</span>
                      ) : (
                        <span className="vtur-muted-text">—</span>
                      )}
                    </td>
                    <td data-label="Lançamentos">{formatMoney(row.valor_lancamentos)}</td>
                    <td data-label="Taxas (arq)">{formatMoney(row.valor_taxas)}</td>
                    <td data-label="Descontos">{formatMoney(row.valor_descontos)}</td>
                    <td data-label="Abatimentos">{formatMoney(row.valor_abatimentos)}</td>
                    <td data-label="Venda real">{formatMoney(row.valor_venda_real)}</td>
                    <td data-label="Comissão loja">{formatMoney(row.valor_comissao_loja)}</td>
                    <td data-label="% loja">
                      {row.percentual_comissao_loja != null
                        ? `${Number(row.percentual_comissao_loja).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                        : "—"}
                    </td>
                    <td data-label="Total (sist)">{formatMoney(row.sistema_valor_total)}</td>
                    <td data-label="Taxas (sist)">{formatMoney(row.sistema_valor_taxas)}</td>
                    <td data-label="Diff total">{formatMoney(row.diff_total)}</td>
                    <td data-label="Diff taxas">{formatMoney(row.diff_taxas)}</td>
                    <td data-label="Conciliado">
                      {row.conciliado ? (
                        <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                      ) : (
                        <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />
                      )}
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons vtur-table-actions">
                        {rowLocked ? (
                          <AppButton
                            type="button"
                            variant="ghost"
                            className="icon-action-btn vtur-table-action"
                            icon="pi pi-pencil"
                            title="Editar"
                            aria-label="Editar"
                            disabled={rowSaving || deletingItemId === row.id}
                            onClick={() => habilitarEdicaoLinha(row.id)}
                          />
                        ) : (
                          <AppButton
                            type="button"
                            variant="ghost"
                            className="icon-action-btn vtur-table-action"
                            icon={rowSaving ? "pi pi-spin pi-spinner" : "pi pi-save"}
                            title={rowSaving ? "Salvando" : "Salvar"}
                            aria-label={rowSaving ? "Salvando" : "Salvar"}
                            disabled={rowSaving || deletingItemId === row.id}
                            onClick={() => salvarLinha(row)}
                          />
                        )}
                        <AppButton
                          type="button"
                          variant="danger"
                          className="icon-action-btn vtur-table-action"
                          icon={deletingItemId === row.id ? "pi pi-spin pi-spinner" : "pi pi-trash"}
                          title={row.conciliado ? "Excluir desabilitado para recibos conciliados" : deletingItemId === row.id ? "Excluindo" : "Excluir"}
                          aria-label={row.conciliado ? "Excluir desabilitado" : "Excluir"}
                          disabled={row.conciliado || rowSaving || deletingItemId === row.id}
                          onClick={() => excluirLinha(row)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
            {renderPaginator(vgFirst, itensVisaoGeralFiltrados.length, setVgFirst)}
          </AppCard>

        </>}

        {secaoAtiva === "pendentes" && <>

          <AppCard
            tone="config"
            className="mb-3"
            title="Conciliação pendente"
            subtitle="Registros importados que ainda não foram conciliados com as vendas. Filtre por mês e dia para localizar pendências."
            actions={
              <div className="vtur-quote-top-actions">
                <AppButton
                  type="button"
                  variant="primary"
                  disabled={conciliando || precisaEmpresaMaster || itensPendentes.length === 0}
                  onClick={conciliarPendentes}
                >
                  {conciliando ? "Conciliando..." : "Conciliar pendentes"}
                </AppButton>
              </div>
            }
          >
            <div className="vtur-inline-filter-row mb-3">
              <AppField
                as="select"
                label="Mês"
                value={monthFilter}
                onChange={(e) => { setAtalhoAtivo(null); setMonthFilter(e.target.value); setDayFilter(""); }}
                disabled={loadingPendentes}
                options={monthOptions}
              />
              <AppField
                as="select"
                label="Dia"
                value={dayFilter || "all"}
                onChange={(e) => { setAtalhoAtivo(null); setDayFilter(e.target.value === "all" ? "" : e.target.value); }}
                disabled={loadingPendentes}
                options={[
                  { label: "Todos do mês", value: "all" },
                  ...resumoDias.map((item) => ({ label: formatDate(item.date), value: item.date })),
                ]}
              />
              <div className="vtur-inline-filter-actions">
                <AppButton type="button" variant="secondary" disabled={loadingPendentes || precisaEmpresaMaster} onClick={carregarPendentes}>
                  {loadingPendentes ? "Atualizando..." : "Atualizar lista"}
                </AppButton>
                <AppButton type="button" variant="secondary" disabled={loadingPendentes} onClick={() => { setAtalhoAtivo(null); setDayFilter(""); setMonthFilter(currentMonthValue()); }}>
                  Limpar
                </AppButton>
              </div>
            </div>
            <div className="vtur-conciliacao-resumo-strip mb-3">
              <span><strong>{itensPendentes.length}</strong> registro(s) pendente(s) {dayFilter ? `em ${formatDate(dayFilter)}` : `em ${formatMonthLabel(monthFilter)}`}</span>
            </div>

            <DataTable
              headers={
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Status</th>
                  <th>Recibo encontrado</th>
                  <th>Vendedor ranking</th>
                  <th>Ranking</th>
                  <th>Lançamentos</th>
                  <th>Taxas</th>
                  <th>Descontos</th>
                  <th>Abatimentos</th>
                  <th>Venda real</th>
                  <th>Comissão loja</th>
                  <th>% loja</th>
                  <th>Conciliado</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              loading={loadingPendentes}
              empty={!loadingPendentes && itensPendentes.length === 0}
              emptyMessage={
                <EmptyState
                  title={precisaEmpresaMaster ? "Selecione uma empresa" : "Nenhum registro pendente"}
                  description={
                    precisaEmpresaMaster
                      ? "Escolha a empresa para liberar a listagem de pendências."
                      : "Não há registros pendentes para o período selecionado."
                  }
                />
              }
              colSpan={15}
              className="table-header-green table-mobile-cards min-w-[1500px]"
            >
              {itensPendentesPage.map((row) => {
                const statusNorm = String(row.status || "").toUpperCase();
                const podeAtribuir = statusNorm === "BAIXA" || statusNorm === "OPFAX";
                const exigeAtribuicaoRanking = registroExigeAtribuicaoRanking(row);
                const rankingTooltip = getLinhaRankingTooltip({ status: row.status, descricao: row.descricao });
                const rowSaving = savingAssignmentId === row.id;
                const rowEditing = Boolean(editableRows[row.id]);
                const vendedorNome = row.ranking_vendedor?.nome_completo
                  || rankingAssignees.find((a) => a.id === row.ranking_vendedor_id)?.nome_completo
                  || null;
                return (
                  <tr key={row.id}>
                    <td data-label="Data">{formatDate(row.movimento_data)}</td>
                    <td data-label="Documento">{row.documento}</td>
                    <td data-label="Status">
                      {getLinhaStatusLabel({ status: row.status, descricao: row.descricao })}
                    </td>
                    <td data-label="Recibo encontrado">
                      {row.venda_recibo_id
                        ? <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                        : <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />}
                    </td>
                    <td data-label="Vendedor ranking">
                      {podeAtribuir ? (
                        rowEditing ? (
                          <select
                            className="form-select"
                            value={rankingVendedorDrafts[row.id] ?? row.ranking_vendedor_id ?? ""}
                            disabled={loadingOptions || rowSaving}
                            onChange={(e) => updateRankingVendedorDraft(row.id, e.target.value)}
                          >
                            <option value="">Não atribuído</option>
                            {rankingAssignees.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.nome_completo}
                              </option>
                            ))}
                          </select>
                        ) : vendedorNome ? (
                          <span>{vendedorNome}</span>
                        ) : (
                          <span className="vtur-muted-text">Não atribuído</span>
                        )
                      ) : (
                        <span
                          className={rankingTooltip ? "vtur-hint-tooltip" : undefined}
                          data-tooltip={rankingTooltip || undefined}
                          tabIndex={rankingTooltip ? 0 : undefined}
                        >
                          {getLinhaRankingHint({ status: row.status, descricao: row.descricao })}
                        </span>
                      )}
                    </td>
                    <td data-label="Ranking">
                      {exigeAtribuicaoRanking ? (
                        registroTemRankingAtribuido(row) ? (
                          <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                        ) : (
                          <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />
                        )
                      ) : podeAtribuir ? (
                        <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />
                      ) : (
                        <span className="vtur-badge vtur-badge-muted">—</span>
                      )}
                    </td>
                    <td data-label="Lançamentos">{formatMoney(row.valor_lancamentos)}</td>
                    <td data-label="Taxas">{formatMoney(row.valor_taxas)}</td>
                    <td data-label="Descontos">{formatMoney(row.valor_descontos)}</td>
                    <td data-label="Abatimentos">{formatMoney(row.valor_abatimentos)}</td>
                    <td data-label="Venda real">{formatMoney(row.valor_venda_real)}</td>
                    <td data-label="Comissão loja">{formatMoney(row.valor_comissao_loja)}</td>
                    <td data-label="% loja">
                      {row.percentual_comissao_loja != null
                        ? `${Number(row.percentual_comissao_loja).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                        : "-"}
                    </td>
                    <td data-label="Conciliado">
                      <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons vtur-table-actions">
                        {podeAtribuir && (
                          rowEditing ? (
                            <AppButton
                              type="button"
                              variant="ghost"
                              className="icon-action-btn vtur-table-action"
                              icon={rowSaving ? "pi pi-spin pi-spinner" : "pi pi-save"}
                              title={rowSaving ? "Salvando" : "Salvar"}
                              aria-label={rowSaving ? "Salvando" : "Salvar"}
                              disabled={rowSaving}
                              onClick={() => salvarLinha(row)}
                            />
                          ) : (
                            <AppButton
                              type="button"
                              variant="ghost"
                              className="icon-action-btn vtur-table-action"
                              icon="pi pi-pencil"
                              title="Editar"
                              aria-label="Editar"
                              disabled={rowSaving || deletingItemId === row.id}
                              onClick={() => habilitarEdicaoLinha(row.id)}
                            />
                          )
                        )}
                        <AppButton
                          type="button"
                          variant="danger"
                          className="icon-action-btn vtur-table-action"
                          icon={deletingItemId === row.id ? "pi pi-spin pi-spinner" : "pi pi-trash"}
                          title={row.conciliado ? "Excluir desabilitado para recibos conciliados" : deletingItemId === row.id ? "Excluindo" : "Excluir"}
                          aria-label={row.conciliado ? "Excluir desabilitado para recibos conciliados" : "Excluir"}
                          disabled={row.conciliado || rowSaving || deletingItemId === row.id}
                          onClick={() => excluirLinha(row)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
            {renderPaginator(pendentesFirst, itensPendentes.length, setPendentesFirst)}
          </AppCard>

        </>}

        {(secaoAtiva === "registros" || (secaoAtiva === "resumo" && resumoDetalheAberto)) && <>

        {erro ? (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        ) : null}

        <AppCard
            tone="config"
            className="mb-3"
            title="Registros conciliados"
            subtitle="Comparativo entre o arquivo importado e os dados do sistema, com atribuição do ranking feita recibo por recibo."
            actions={
              <div className="vtur-quote-top-actions">
                {filtrosRapidosAtivos ? (
                  <AppButton type="button" variant="secondary" disabled={loadingLista} onClick={limparAtalhosRegistros}>
                    Limpar filtros
                  </AppButton>
                ) : null}
                <AppButton
                  type="button"
                  variant="primary"
                  disabled={conciliando || precisaEmpresaMaster || Number(resumoTotais.pendentesConciliacao || 0) === 0}
                  onClick={conciliarPendentes}
                >
                  {conciliando ? "Conciliando..." : "Conciliar pendentes"}
                </AppButton>
              </div>
            }
          >
            <div className="vtur-inline-filter-row mb-3">
              <AppField
                as="select"
                label="Mês"
                value={monthFilter}
                onChange={(e) => { setAtalhoAtivo(null); setMonthFilter(e.target.value); setDayFilter(""); }}
                disabled={loadingConciliados}
                options={monthOptions}
              />
              <AppField
                as="select"
                label="Dia"
                value={dayFilter || "all"}
                onChange={(e) => { setAtalhoAtivo(null); setDayFilter(e.target.value === "all" ? "" : e.target.value); }}
                disabled={loadingConciliados}
                options={[
                  { label: "Todos do mês", value: "all" },
                  ...resumoDias.map((item) => ({ label: formatDate(item.date), value: item.date })),
                ]}
              />
              <div className="vtur-inline-filter-actions">
                <AppButton type="button" variant="secondary" disabled={loadingConciliados || precisaEmpresaMaster} onClick={carregarConciliados}>
                  {loadingConciliados ? "Atualizando..." : "Atualizar lista"}
                </AppButton>
                <AppButton type="button" variant="secondary" disabled={loadingConciliados} onClick={() => { setAtalhoAtivo(null); setDayFilter(""); setMonthFilter(currentMonthValue()); }}>
                  Limpar
                </AppButton>
              </div>
            </div>
            <div className="vtur-conciliacao-resumo-strip mb-3">
              <span><strong>{itensConciliados.length}</strong> registro(s) conciliado(s) {dayFilter ? `em ${formatDate(dayFilter)}` : `em ${formatMonthLabel(monthFilter)}`}</span>
            </div>
            <DataTable
              headers={
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Status</th>
                  <th>Recibo encontrado</th>
                  <th>Vendedor ranking</th>
                  <th>Ranking</th>
                  <th>Meta dif.</th>
                  <th>Lançamentos</th>
                  <th>Taxas (arq)</th>
                  <th>Descontos</th>
                  <th>Abatimentos</th>
                  <th>Venda real</th>
                  <th>Comissão loja</th>
                  <th>% loja</th>
                  <th>Total (sist)</th>
                  <th>Taxas (sist)</th>
                  <th>Diff total</th>
                  <th>Diff taxas</th>
                  <th>Conciliado</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              loading={loadingConciliados}
              empty={!loadingConciliados && itensConciliados.length === 0}
              emptyMessage={
                <EmptyState
                  title={precisaEmpresaMaster ? "Selecione uma empresa" : "Nenhum registro conciliado"}
                  description={
                    precisaEmpresaMaster
                      ? "Escolha a empresa para liberar a listagem."
                      : "Não há registros conciliados para o período selecionado."
                  }
                />
              }
              colSpan={20}
              className="table-header-green table-mobile-cards min-w-[2040px]"
            >
              {itensConciliadosPage.map((row) => (
                <tr key={row.id}>
                  {(() => {
                    const rowLocked = isRowLocked(row);
                    const rowSaving = savingAssignmentId === row.id;
                    const exigeAtribuicaoRanking = registroExigeAtribuicaoRanking(row);
                    const rankingTooltip = getLinhaRankingTooltip({ status: row.status, descricao: row.descricao });
                    const vendedorNome = row.ranking_vendedor?.nome_completo
                      || rankingAssignees.find((a) => a.id === row.ranking_vendedor_id)?.nome_completo
                      || null;
                    return (
                      <>
                  <td data-label="Data">{formatDate(row.movimento_data)}</td>
                  <td data-label="Documento">{row.documento}</td>
                  <td data-label="Status">
                    {getLinhaStatusLabel({ status: row.status, descricao: row.descricao })}
                  </td>
                  <td data-label="Recibo encontrado">{row.venda_recibo_id ? "Sim" : "Não"}</td>
                  <td data-label="Vendedor ranking">
                    {exigeAtribuicaoRanking ? (
                      !rowLocked ? (
                        <select
                          className="form-select"
                          value={rankingVendedorDrafts[row.id] ?? row.ranking_vendedor_id ?? ""}
                          disabled={loadingOptions || rowSaving}
                          onChange={(e) => updateRankingVendedorDraft(row.id, e.target.value)}
                        >
                          <option value="">Não atribuído</option>
                          {rankingAssignees.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.nome_completo}
                            </option>
                          ))}
                        </select>
                      ) : vendedorNome ? (
                        <span>{vendedorNome}</span>
                      ) : (
                        <span className="vtur-muted-text">Não atribuído</span>
                      )
                    ) : (
                      <span
                        className={rankingTooltip ? "vtur-hint-tooltip" : undefined}
                        data-tooltip={rankingTooltip || undefined}
                        tabIndex={rankingTooltip ? 0 : undefined}
                      >
                        {getLinhaRankingHint({ status: row.status, descricao: row.descricao })}
                      </span>
                    )}
                  </td>
                  <td data-label="Ranking">
                    {exigeAtribuicaoRanking ? (
                      registroTemRankingAtribuido(row) ? (
                        <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                      ) : (
                        <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />
                      )
                    ) : (
                      <span className="vtur-badge vtur-badge-muted">—</span>
                    )}
                  </td>
                  <td data-label="Meta dif.">
                    {rankingProdutosMeta.length === 0 ? (
                      <span>-</span>
                    ) : rowLocked ? (
                      (() => {
                        const produtoNome = row.ranking_produto?.nome
                          || rankingProdutosMeta.find((p) => p.id === row.ranking_produto_id)?.nome
                          || null;
                        return produtoNome
                          ? <span>{produtoNome}</span>
                          : <span className="vtur-muted-text">Não</span>;
                      })()
                    ) : produtoMetaUnico ? (
                      <select
                        className="form-select"
                        value={(rankingProdutoDrafts[row.id] ?? row.ranking_produto_id ?? "") === produtoMetaUnico.id ? produtoMetaUnico.id : ""}
                        disabled={loadingOptions || rowSaving}
                        onChange={(e) => updateRankingProdutoDraft(row.id, e.target.value)}
                      >
                        <option value="">Nao</option>
                        <option value={produtoMetaUnico.id}>Sim ({produtoMetaUnico.nome})</option>
                      </select>
                    ) : (
                      <select
                        className="form-select"
                        value={rankingProdutoDrafts[row.id] ?? row.ranking_produto_id ?? ""}
                        disabled={loadingOptions || rowSaving}
                        onChange={(e) => updateRankingProdutoDraft(row.id, e.target.value)}
                      >
                        <option value="">Nao</option>
                        {rankingProdutosMeta.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.nome}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td data-label="Lançamentos">{formatMoney(row.valor_lancamentos)}</td>
                  <td data-label="Taxas (arq)">{formatMoney(row.valor_taxas)}</td>
                  <td data-label="Descontos">{formatMoney(row.valor_descontos)}</td>
                  <td data-label="Abatimentos">{formatMoney(row.valor_abatimentos)}</td>
                  <td data-label="Venda real">{formatMoney(row.valor_venda_real)}</td>
                  <td data-label="Comissão loja">{formatMoney(row.valor_comissao_loja)}</td>
                  <td data-label="% loja">
                    {row.percentual_comissao_loja != null
                      ? `${Number(row.percentual_comissao_loja).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}%`
                      : "-"}
                  </td>
                  <td data-label="Total (sist)">{formatMoney(row.sistema_valor_total)}</td>
                  <td data-label="Taxas (sist)">{formatMoney(row.sistema_valor_taxas)}</td>
                  <td data-label="Diff total">{formatMoney(row.diff_total)}</td>
                  <td data-label="Diff taxas">{formatMoney(row.diff_taxas)}</td>
                  <td data-label="Conciliado">
                    {row.conciliado
                      ? <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                      : <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />}
                  </td>
                  <td className="th-actions" data-label="Ações">
                    <div className="action-buttons vtur-table-actions">
                      {rowLocked ? (
                        <AppButton
                          type="button"
                          variant="ghost"
                          className="icon-action-btn vtur-table-action"
                          icon="pi pi-pencil"
                          title="Editar"
                          aria-label="Editar"
                          disabled={rowSaving || deletingItemId === row.id}
                          onClick={() => habilitarEdicaoLinha(row.id)}
                        />
                      ) : (
                        <AppButton
                          type="button"
                          variant="ghost"
                          className="icon-action-btn vtur-table-action"
                          icon={rowSaving ? "pi pi-spin pi-spinner" : "pi pi-save"}
                          title={rowSaving ? "Salvando" : "Salvar"}
                          aria-label={rowSaving ? "Salvando" : "Salvar"}
                          disabled={rowSaving || deletingItemId === row.id}
                          onClick={() => salvarLinha(row)}
                        />
                      )}
                      <AppButton
                        type="button"
                        variant="danger"
                        className="icon-action-btn vtur-table-action"
                        icon={deletingItemId === row.id ? "pi pi-spin pi-spinner" : "pi pi-trash"}
                        title={
                          row.conciliado
                            ? "Excluir desabilitado para recibos conciliados"
                            : deletingItemId === row.id
                              ? "Excluindo"
                              : "Excluir"
                        }
                        aria-label={
                          row.conciliado
                            ? "Excluir desabilitado para recibos conciliados"
                            : deletingItemId === row.id
                              ? "Excluindo"
                              : "Excluir"
                        }
                        disabled={row.conciliado || rowSaving || deletingItemId === row.id}
                        onClick={() => excluirLinha(row)}
                      />
                    </div>
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </DataTable>
            {renderPaginator(conciliadosFirst, itensConciliados.length, setConciliadosFirst)}
          </AppCard>

        </>}

        {secaoAtiva === "pendentes_ranking" && <>

          <AppCard
            tone="config"
            className="mb-3"
            title="Pendentes ranking"
            subtitle="Recibos BAIXA e OPFAX que ainda não foram atribuídos a um vendedor no ranking. Recibos OPFAX saem da lista após a importação da BAIXA correspondente."
          >
            <div className="vtur-inline-filter-row mb-3">
              <AppField
                as="select"
                label="Mês"
                value={monthFilter}
                onChange={(e) => { setAtalhoAtivo(null); setMonthFilter(e.target.value); setDayFilter(""); }}
                disabled={loadingRankingPendentes}
                options={monthOptions}
              />
              <AppField
                as="select"
                label="Dia"
                value={dayFilter || "all"}
                onChange={(e) => { setAtalhoAtivo(null); setDayFilter(e.target.value === "all" ? "" : e.target.value); }}
                disabled={loadingRankingPendentes}
                options={[
                  { label: "Todos do mês", value: "all" },
                  ...resumoDias.map((item) => ({ label: formatDate(item.date), value: item.date })),
                ]}
              />
              <div className="vtur-inline-filter-actions">
                <AppButton type="button" variant="secondary" disabled={loadingRankingPendentes || precisaEmpresaMaster} onClick={carregarRankingPendentes}>
                  {loadingRankingPendentes ? "Atualizando..." : "Atualizar lista"}
                </AppButton>
                <AppButton type="button" variant="secondary" disabled={loadingRankingPendentes} onClick={() => { setAtalhoAtivo(null); setDayFilter(""); setMonthFilter(currentMonthValue()); }}>
                  Limpar
                </AppButton>
              </div>
            </div>
            <div className="vtur-conciliacao-resumo-strip mb-3">
              <span><strong>{itensRankingPendentes.length}</strong> recibo(s) aguardando atribuição de ranking {dayFilter ? `em ${formatDate(dayFilter)}` : `em ${formatMonthLabel(monthFilter)}`}</span>
            </div>
            <DataTable
              headers={
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Status</th>
                  <th>Recibo encontrado</th>
                  <th>Vendedor ranking</th>
                  <th>Ranking</th>
                  <th>Lançamentos</th>
                  <th>Taxas</th>
                  <th>Venda real</th>
                  <th>Comissão loja</th>
                  <th>% loja</th>
                  <th>Conciliado</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              loading={loadingRankingPendentes}
              empty={!loadingRankingPendentes && itensRankingPendentes.length === 0}
              emptyMessage={
                <EmptyState
                  title={precisaEmpresaMaster ? "Selecione uma empresa" : "Nenhum pendente de ranking"}
                  description={
                    precisaEmpresaMaster
                      ? "Escolha a empresa para liberar a listagem."
                      : "Todos os recibos do período já foram atribuídos ao ranking."
                  }
                />
              }
              colSpan={13}
              className="table-header-green table-mobile-cards min-w-[1400px]"
            >
              {itensRankingPage.map((row) => {
                // Nesta aba OPFAX também pode receber vendedor (pré-atribuição antes da baixa)
                const statusNorm = String(row.status || "").toUpperCase();
                const podeAtribuir = statusNorm === "BAIXA" || statusNorm === "OPFAX";
                const rowSaving = savingAssignmentId === row.id;
                const rowEditing = Boolean(editableRows[row.id]);
                const vendedorAtualId = rankingVendedorDrafts[row.id] ?? row.ranking_vendedor_id ?? "";
                const vendedorNome = row.ranking_vendedor?.nome_completo
                  || rankingAssignees.find((a) => a.id === row.ranking_vendedor_id)?.nome_completo
                  || null;
                return (
                  <tr key={row.id}>
                    <td data-label="Data">{formatDate(row.movimento_data)}</td>
                    <td data-label="Documento">{row.documento}</td>
                    <td data-label="Status">
                      {getLinhaStatusLabel({ status: row.status, descricao: row.descricao })}
                    </td>
                    <td data-label="Recibo encontrado">
                      {row.venda_recibo_id
                        ? <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                        : <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />}
                    </td>
                    <td data-label="Vendedor ranking">
                      {podeAtribuir ? (
                        rowEditing ? (
                          <select
                            className="form-select"
                            value={vendedorAtualId}
                            disabled={loadingOptions || rowSaving}
                            onChange={(e) => updateRankingVendedorDraft(row.id, e.target.value)}
                          >
                            <option value="">Não atribuído</option>
                            {rankingAssignees.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.nome_completo}{opt.tipo ? ` (${opt.tipo})` : ""}
                              </option>
                            ))}
                          </select>
                        ) : vendedorNome ? (
                          <span>{vendedorNome}</span>
                        ) : (
                          <span className="vtur-muted-text">Não atribuído</span>
                        )
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td data-label="Ranking">
                      {row.ranking_vendedor_id
                        ? <span className="vtur-badge vtur-badge-warn">Pendente</span>
                        : <span className="vtur-badge vtur-badge-warn">Não atribuído</span>}
                    </td>
                    <td data-label="Lançamentos">{formatMoney(row.valor_lancamentos)}</td>
                    <td data-label="Taxas">{formatMoney(row.valor_taxas)}</td>
                    <td data-label="Venda real">{formatMoney(row.valor_venda_real)}</td>
                    <td data-label="Comissão loja">{formatMoney(row.valor_comissao_loja)}</td>
                    <td data-label="% loja">
                      {row.percentual_comissao_loja != null
                        ? `${Number(row.percentual_comissao_loja).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                        : "-"}
                    </td>
                    <td data-label="Conciliado">
                      {row.conciliado
                        ? <i className="pi pi-check-circle" style={{ color: "var(--color-success-fg, #1a7f37)", fontSize: "1.1rem" }} />
                        : <i className="pi pi-times-circle" style={{ color: "var(--color-danger-fg, #cf222e)", fontSize: "1.1rem" }} />}
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons vtur-table-actions">
                        {rowEditing ? (
                          <AppButton
                            type="button"
                            variant="ghost"
                            className="icon-action-btn vtur-table-action"
                            icon={rowSaving ? "pi pi-spin pi-spinner" : "pi pi-save"}
                            title={rowSaving ? "Salvando" : "Salvar"}
                            aria-label={rowSaving ? "Salvando" : "Salvar"}
                            disabled={rowSaving}
                            onClick={() => salvarLinha(row)}
                          />
                        ) : (
                          <AppButton
                            type="button"
                            variant="ghost"
                            className="icon-action-btn vtur-table-action"
                            icon="pi pi-pencil"
                            title="Editar"
                            aria-label="Editar"
                            disabled={rowSaving}
                            onClick={() => habilitarEdicaoLinha(row.id)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
            {renderPaginator(rankingFirst, itensRankingPendentes.length, setRankingFirst)}
          </AppCard>

        </>}

        {secaoAtiva === "alteracoes" && <>

        <AppCard
            tone="config"
            className="mb-3"
            title="Historico de alteracoes"
            subtitle="Controle alteracoes de taxas, identifique o autor e reverta ajustes pendentes quando necessario."
            actions={
              <div className="vtur-quote-top-actions">
                <AppButton
                  type="button"
                  variant="secondary"
                  disabled={loadingChanges || precisaEmpresaMaster || selectedGroupKeys.size === 0}
                  onClick={reverterSelecionados}
                >
                  {loadingChanges ? "Processando..." : `Reverter selecionados (${selectedPendingCount})`}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  disabled={loadingChanges || precisaEmpresaMaster}
                  onClick={reverterTudo}
                >
                  Reverter tudo
                </AppButton>
              </div>
            }
          >
            <div className="vtur-quote-summary-grid">
              <button
                type="button"
                className="vtur-quote-summary-item vtur-alteracoes-kpi-btn"
                title="Ver todos os grupos"
                onClick={() => {
                  setSomenteAlteracoesPendentes(false);
                  setTimeout(() => tabelaAlteracoesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
              >
                <span className="vtur-quote-summary-label">Grupos</span>
                <strong>{changeGroups.length}</strong>
              </button>
              <button
                type="button"
                className="vtur-quote-summary-item vtur-alteracoes-kpi-btn"
                title="Filtrar somente pendentes"
                onClick={() => {
                  setSomenteAlteracoesPendentes(true);
                  setTimeout(() => tabelaAlteracoesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
              >
                <span className="vtur-quote-summary-label">Pendentes</span>
                <strong>{alteracoesPendentesCount}</strong>
              </button>
              <button
                type="button"
                className="vtur-quote-summary-item vtur-alteracoes-kpi-btn"
                title="Selecionar todos os pendentes"
                onClick={() => {
                  const pendentesKeys = changeGroups
                    .filter((g) => g.count_pendentes > 0)
                    .map((g) => g.key);
                  setSelectedGroupKeys(new Set(pendentesKeys));
                  setSomenteAlteracoesPendentes(true);
                  setTimeout(() => tabelaAlteracoesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
              >
                <span className="vtur-quote-summary-label">Selecionadas</span>
                <strong>{selectedPendingCount}</strong>
              </button>
            </div>

            <div className="vtur-inline-filter-row mt-3 mb-3">
              <AppField
                as="input"
                label="Recibo"
                value={alteracoesFiltroRecibo}
                onChange={(e) => setAlteracoesFiltroRecibo((e as React.ChangeEvent<HTMLInputElement>).target.value)}
                placeholder="Buscar..."
                disabled={loadingChanges}
              />
              <AppField
                as="select"
                label="Mês"
                value={monthFilter}
                onChange={(e) => { setMonthFilter(e.target.value); setDayFilter(""); }}
                disabled={loadingChanges}
                options={monthOptions}
              />
              <AppField
                as="select"
                label="Dia"
                value={dayFilter || "all"}
                onChange={(e) => setDayFilter(e.target.value === "all" ? "" : e.target.value)}
                disabled={loadingChanges}
                options={[
                  { label: "Todos do mês", value: "all" },
                  ...resumoDias.map((item) => ({ label: formatDate(item.date), value: item.date })),
                ]}
              />
              <AppField
                as="select"
                label="Alterações"
                value={somenteAlteracoesPendentes ? "pendentes" : "todas"}
                onChange={(e) => setSomenteAlteracoesPendentes(e.target.value === "pendentes")}
                disabled={loadingChanges}
                options={[
                  { label: "Somente não revertidas", value: "pendentes" },
                  { label: "Todas", value: "todas" },
                ]}
              />
              <div className="vtur-inline-filter-actions">
                <AppButton type="button" variant="secondary" disabled={loadingChanges || precisaEmpresaMaster} onClick={carregarAlteracoes}>
                  {loadingChanges ? "Atualizando..." : "Atualizar lista"}
                </AppButton>
                <AppButton type="button" variant="secondary" disabled={loadingChanges} onClick={() => { setDayFilter(""); setMonthFilter(currentMonthValue()); setSomenteAlteracoesPendentes(true); setAlteracoesFiltroRecibo(""); }}>
                  Limpar
                </AppButton>
              </div>
            </div>

            <div className="mt-3" ref={tabelaAlteracoesRef}>
              <DataTable
                headers={
                  <tr>
                    <th style={{ width: 48 }} />
                    <th>Quando</th>
                    <th>Recibo</th>
                    <th>Alteracoes</th>
                    <th>Taxas (antes)</th>
                    <th>Taxas (novo)</th>
                    <th>Origem</th>
                    <th>Por</th>
                    <th>Revertido</th>
                  </tr>
                }
                loading={loadingChanges}
                empty={!loadingChanges && changeGroupsFiltrados.length === 0}
                emptyMessage={
                  <EmptyState
                    title={precisaEmpresaMaster ? "Selecione uma empresa" : "Nenhuma alteracao registrada"}
                    description={
                      precisaEmpresaMaster
                        ? "Escolha a empresa para consultar o historico de alteracoes."
                        : alteracoesFiltroRecibo
                        ? "Nenhum registro encontrado para o recibo informado."
                        : "Nao ha alteracoes para o recorte atual."
                    }
                  />
                }
                colSpan={9}
                className="table-header-blue table-mobile-cards min-w-[920px]"
              >
                {changeGroupsPage.map((group) => {
                  const hasPending = group.count_pendentes > 0;
                  const checked = selectedGroupKeys.has(group.key);
                  const origem = group.actor === "user" ? "manual" : "cron";
                  const revertLabel = group.reverted_at ? formatDateTime(group.reverted_at) : "-";

                  return (
                    <tr key={group.key}>
                      <td data-label="Selecionar">
                        <input
                          type="checkbox"
                          disabled={!hasPending}
                          checked={checked}
                          onChange={(e) => {
                            setSelectedGroupKeys((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(group.key);
                              else next.delete(group.key);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td data-label="Quando">{formatDateTime(group.last_changed_at)}</td>
                      <td data-label="Recibo">{group.numero_recibo || "-"}</td>
                      <td data-label="Alteracoes">
                        {group.count_total}
                        {hasPending ? ` (${group.count_pendentes} pend.)` : ""}
                      </td>
                      <td data-label="Taxas (antes)">{formatMoney(group.old_value)}</td>
                      <td data-label="Taxas (novo)">{formatMoney(group.new_value)}</td>
                      <td data-label="Origem">{origem}</td>
                      <td data-label="Por">{group.changed_by_label}</td>
                      <td data-label="Revertido">{revertLabel}</td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
            {renderPaginator(alteracoesFirst, changeGroupsFiltrados.length, setAlteracoesFirst)}
          </AppCard>

        </>}
      </div>
      <ConfirmDialog
        open={Boolean(deleteConfirmRow)}
        title="Excluir recibo"
        message={`Excluir o recibo ${deleteConfirmRow?.documento || deleteConfirmRow?.id || ""} da conciliacao?`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onConfirm={() => void confirmarExcluirLinha()}
        onCancel={() => setDeleteConfirmRow(null)}
      />
    </AppPrimerProvider>
  );
}
