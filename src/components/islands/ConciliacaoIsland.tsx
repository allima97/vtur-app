import React, { useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildConciliacaoMetrics,
  inferConciliacaoStatus,
  normalizeConciliacaoDescricaoKey,
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

type ConciliacaoSection = "registros" | "resumo" | "importacao" | "alteracoes";

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
  origem?: string | null;
  raw?: any;
};

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

function parseMovimentoDateFromFileName(fileName: string): string | null {
  const raw = String(fileName || "");
  const match = raw.match(/(\d{2})-(\d{2})-(\d{2,4})/);
  if (!match) return null;

  const dd = match[1];
  const mm = match[2];
  const yy = match[3];
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
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

function parseConciliacaoTxt(text: string, origem: string): { movimentoData: string | null; linhas: LinhaInput[] } {
  const movimentoData = parseMovimentoDateFromTxt(text);
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\t/g, " "));

  const linhas: LinhaInput[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(SUBTOTAL|TOTAL)\b/i.test(trimmed)) continue;
    if (/^DOCUMENTO\b/i.test(trimmed)) continue;
    if (/^CALCULADA\s+TOTAL\b/i.test(trimmed)) continue;

    if (!/^\d{4}-\d{10}\b/.test(trimmed)) continue;

    const parts = trimmed.split(/\s{2,}/).filter(Boolean);
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

  return { movimentoData, linhas };
}

async function parseConciliacaoXls(file: File, origem: string): Promise<{ movimentoData: string | null; linhas: LinhaInput[] }> {
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
    return { movimentoData: parseMovimentoDateFromFileName(origem), linhas: [] };
  }

  const rows = selectedSheet.rows;

  const movimentoDateCell = sheets
    .flatMap((entry) => entry.rows)
    .flat()
    .map((cell) => String(cell || "").trim())
    .find((cell) => /Movimenta[cç][aã]o\s+do\s+Dia:/i.test(cell));
  const movimentoData =
    (movimentoDateCell ? parseMovimentoDateFromTxt(movimentoDateCell) : null) ||
    parseMovimentoDateFromFileName(origem);

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
  const pickNumber = (value: any) => (isLegacyXls ? parseLegacyXlsNumber(value) : parsePtBrNumber(value));

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const doc = String(r[cDocumento] || "").trim();
    if (!doc) continue;
    if (/^(SUBTOTAL|TOTAL)\b/i.test(doc)) continue;

    const descricao = cDescricao >= 0 ? String(r[cDescricao] || "").trim() : "";

    const pick = (idx: number) => (idx >= 0 ? pickNumber(r[idx]) : null);

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

  return { movimentoData, linhas };
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
  return `${monthLabel}-${year.slice(-2)}`;
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
  const status = String(value || "").trim().toUpperCase();
  return status === "BAIXA" || status === "OPFAX" || status === "ESTORNO";
}

function isOperacionalLinha(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  return status === "BAIXA";
}

function linhaExigeAtribuicaoRanking(linha: LinhaInput) {
  return isOperacionalLinha(linha.status || linha.descricao || null);
}

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

  const [parsedLinhas, setParsedLinhas] = useState<LinhaInput[]>([]);
  const [parsedMovimentoData, setParsedMovimentoData] = useState<string | null>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<ConciliacaoSection>("registros");

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
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [comissaoDrafts, setComissaoDrafts] = useState<Record<string, string>>({});
  const [rankingVendedorDrafts, setRankingVendedorDrafts] = useState<Record<string, string>>({});
  const [rankingProdutoDrafts, setRankingProdutoDrafts] = useState<Record<string, string>>({});
  const [editableRows, setEditableRows] = useState<Record<string, boolean>>({});
  const [rankingAssignees, setRankingAssignees] = useState<RankingAssigneeOption[]>([]);
  const [rankingProdutosMeta, setRankingProdutosMeta] = useState<RankingProdutoOption[]>([]);
  const [showPendingDetails, setShowPendingDetails] = useState(false);

  const [somenteAlteracoesPendentes, setSomenteAlteracoesPendentes] = useState(true);
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

  async function carregarLista() {
    if (!resolvedCompanyId) {
      setItens([]);
      return;
    }

    try {
      setLoadingLista(true);
      setErro(null);

      const qs = new URLSearchParams();
      qs.set("company_id", resolvedCompanyId);
      if (somentePendentes) qs.set("pending", "1");
      if (monthFilter) qs.set("month", monthFilter);
      if (dayFilter) qs.set("day", dayFilter);
      if (rankingStatusFilter !== "all") qs.set("ranking_status", rankingStatusFilter);

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
        return {
          ...linha,
          ...changes,
        };
      })
    );
  }

  function abrirImportacao() {
    if (precisaEmpresaMaster) return;
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

      setItens((prev) =>
        prev.map((item) => {
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
        })
      );
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
    const rankingVendedorId = (rankingVendedorDrafts[row.id] || "").trim() || null;
    const rankingProdutoId = (rankingProdutoDrafts[row.id] || "").trim() || null;

    await salvarAtribuicaoRanking(row, {
      rankingVendedorId,
      rankingProdutoId,
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
    const confirmado = window.confirm(`Excluir o recibo ${row.documento || row.id} da conciliacao?`);
    if (!confirmado) return;

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
      setDeletingItemId(null);
    }
  }

  async function onPickFile(file: File | null) {
    setArquivo(file);
    setParsedLinhas([]);
    setParsedMovimentoData(null);

    if (!file) return;

    try {
      const origem = file.name || "import";
      const ext = origem.split(".").pop()?.toLowerCase() || "";

      if (ext === "txt") {
        const text = await file.text();
        const parsed = parseConciliacaoTxt(text, origem);
        setParsedMovimentoData(parsed.movimentoData);
        setParsedLinhas(parsed.linhas);
      } else if (ext === "xls" || ext === "xlsx") {
        const parsed = await parseConciliacaoXls(file, origem);
        setParsedMovimentoData(parsed.movimentoData);
        setParsedLinhas(parsed.linhas);
      } else {
        throw new Error("Formato não suportado. Use TXT ou XLS/XLSX.");
      }

      showToast(`Arquivo lido: ${file.name}`, "success");
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao ler arquivo.", "error");
      setArquivo(null);
      setParsedLinhas([]);
      setParsedMovimentoData(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function importar() {
    if (!resolvedCompanyId) {
      showToast("Selecione uma empresa.", "error");
      return;
    }
    if (!arquivo) {
      showToast("Selecione um arquivo.", "error");
      return;
    }
    if (parsedLinhas.length === 0) {
      showToast("Nenhuma linha reconhecida no arquivo.", "error");
      return;
    }

    const linhasImportaveis = parsedLinhas.filter((linha) =>
      linhaEhImportavel(linha.status || linha.descricao || null)
    );
    if (linhasImportaveis.length === 0) {
      showToast("O arquivo não possui registros válidos para importar.", "error");
      return;
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
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any;

      showToast(
        `Importado: ${json?.imported || 0}. Checados: ${json?.checked || 0}. Conciliados: ${json?.reconciled || 0}.`,
        "success"
      );

      await carregarLista();
      await carregarResumo();
      await carregarExecucoes();
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || "Erro ao importar.", "error");
    } finally {
      setImportando(false);
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
      showToast(
        `Checados: ${json?.checked || 0}. Conciliados: ${json?.reconciled || 0}. Taxas atualizadas: ${json?.updatedTaxes || 0}.`,
        "success"
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
    if (secaoAtiva !== "alteracoes" || !resolvedCompanyId) return;
    carregarAlteracoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secaoAtiva, resolvedCompanyId, somenteAlteracoesPendentes]);

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
  const navSections: Array<{ id: ConciliacaoSection; label: string; value: string | number; hint: string }> = [
    {
      id: "registros",
      label: "Registros",
      value: pendentesCount,
      hint: `${conciliadosCount} conciliados no recorte atual`,
    },
    {
      id: "resumo",
      label: "Resumo",
      value: loadingResumo ? "..." : resumoTotais.pendentesConciliacao || 0,
      hint: "Mês, dias pendentes e execuções",
    },
    {
      id: "importacao",
      label: "Importação",
      value: parsedLinhas.length,
      hint: "Importe o arquivo e valide o preview",
    },
    {
      id: "alteracoes",
      label: "Alterações",
      value: alteracoesPendentesCount,
      hint: "Taxas alteradas e reversões",
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
      <div className="conciliacao-page page-content-wrap">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        <AppCard
          tone="info"
          className="mb-3 list-toolbar-sticky"
          title="Conciliacao financeira"
          subtitle={resumoToolbar}
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton
                type="button"
                variant="primary"
                disabled={precisaEmpresaMaster}
                onClick={abrirImportacao}
              >
                Importar arquivo
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                disabled={importando || conciliando || precisaEmpresaMaster}
                onClick={conciliarPendentes}
              >
                {conciliando ? "Conciliando..." : "Conciliar pendentes"}
              </AppButton>
            </div>
          }
        >
          <div className="vtur-commission-filters-grid">
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

            <AppField
              as="select"
              label="Mês"
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setDayFilter("");
              }}
              disabled={loadingLista || loadingResumo}
              options={monthOptions}
            />

            <AppField
              as="select"
              label="Dia"
              value={dayFilter || "all"}
              onChange={(e) => setDayFilter(e.target.value === "all" ? "" : e.target.value)}
              disabled={loadingLista || loadingResumo}
              options={[
                { label: "Todos do mês", value: "all" },
                ...resumoDias.map((item) => ({ label: formatDate(item.date), value: item.date })),
              ]}
            />

            <AppField
              as="select"
              label="Pendência ranking"
              value={rankingStatusFilter}
              onChange={(e) => setRankingStatusFilter(e.target.value as any)}
              disabled={loadingLista}
              options={[
                { label: "Pendentes de atribuição", value: "pending" },
                { label: "Atribuídos manualmente", value: "assigned" },
                { label: "Vindos do sistema", value: "system" },
                { label: "Todos", value: "all" },
              ]}
            />

            <AppField
              as="select"
              label="Registros"
              value={somentePendentes ? "pendentes" : "todas"}
              onChange={(e) => setSomentePendentes(e.target.value === "pendentes")}
              disabled={loadingLista}
              options={[
                { label: "Somente pendentes", value: "pendentes" },
                { label: "Todas", value: "todas" },
              ]}
            />

            <div className="vtur-form-actions" style={{ alignItems: "flex-end" }}>
              <AppButton
                type="button"
                variant="secondary"
                disabled={loadingLista || precisaEmpresaMaster}
                onClick={carregarLista}
              >
                {loadingLista ? "Atualizando..." : "Atualizar lista"}
              </AppButton>
            </div>
          </div>

          <div className="vtur-quote-summary-grid" style={{ marginTop: 16 }}>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Importados</span>
              <strong>{loadingResumo ? "..." : resumoTotais.importados || 0}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Pendentes conciliação</span>
              <strong>{loadingResumo ? "..." : resumoTotais.pendentesConciliacao || 0}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Dias pendentes importação</span>
              <strong>{loadingResumo ? "..." : resumoTotais.pendentesImportacao || 0}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Pendentes ranking</span>
              <strong>{loadingResumo ? "..." : resumoTotais.pendentesRanking || 0}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Conciliados sist.</span>
              <strong>{loadingResumo ? "..." : resumoTotais.conciliadosSistema || 0}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Atribuídos ranking</span>
              <strong>{loadingResumo ? "..." : resumoTotais.atribuidosRanking || 0}</strong>
            </div>
          </div>
        </AppCard>

        <div className="vtur-conciliacao-nav-grid mb-3">
          {navSections.map((section) => {
            const active = secaoAtiva === section.id;
            return (
              <button
                key={section.id}
                type="button"
                className={`vtur-conciliacao-nav-card${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => setSecaoAtiva(section.id)}
              >
                <span className="vtur-quote-summary-label">{section.label}</span>
                <strong>{section.value}</strong>
                <span className="vtur-conciliacao-nav-hint">{section.hint}</span>
              </button>
            );
          })}
        </div>

        {erro ? (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        ) : null}

        {secaoAtiva === "resumo" ? (
          <>
            <AppCard
              className="mb-3"
              title="Resumo operacional"
              subtitle="Acompanhe pendências por mês e por dia sem carregar a listagem completa de recibos."
            >
              <div className="vtur-quote-summary-grid">
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Mês filtrado</span>
                  <strong>{monthFilter || "-"}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Em tela</span>
                  <strong>{itens.length}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Pendentes em tela</span>
                  <strong>{pendentesCount}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Divergências em tela</span>
                  <strong>{divergenciasCount}</strong>
                </div>
              </div>

              <div className="mt-3 table-container">
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
                      resumoMeses.map((item) => (
                        <tr key={item.month}>
                          <td data-label="Mês">{item.month}</td>
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

              <div className="vtur-conciliacao-overview mt-3">
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
                        <button
                          key={cell.date || `empty-${index}`}
                          type="button"
                          className={`vtur-conciliacao-calendar-day ${tone}`}
                          disabled={!canFilter}
                          title={cell.date ? `${formatDate(cell.date)} • ${getResumoDiaLabel(cell.item)}` : ""}
                          onClick={() => {
                            if (!cell.item?.date) return;
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
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="vtur-conciliacao-pending-card">
                  <h4>Dias pendentes no mês</h4>
                  <div className="vtur-conciliacao-pending-chips">
                    <button
                      type="button"
                      className="vtur-conciliacao-pending-chip importacao"
                      onClick={() => setShowPendingDetails(true)}
                    >
                      <strong>Importação</strong>
                      <span>{formatPendingDayList(diasPendentesImportacao)}</span>
                    </button>
                    <button
                      type="button"
                      className="vtur-conciliacao-pending-chip conciliacao"
                      onClick={() => setShowPendingDetails(true)}
                    >
                      <strong>Conciliação</strong>
                      <span>{formatPendingDayList(diasPendentesConciliacao)}</span>
                    </button>
                    <button
                      type="button"
                      className="vtur-conciliacao-pending-chip ranking"
                      onClick={() => setShowPendingDetails(true)}
                    >
                      <strong>Ranking</strong>
                      <span>{formatPendingDayList(diasPendentesRanking)}</span>
                    </button>
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
              </div>

              {showPendingDetails ? (
                <div className="mt-3 table-container">
                  <table className="table-default table-header-blue table-mobile-cards min-w-[860px]">
                    <thead>
                      <tr>
                        <th>Data pendente</th>
                        <th>Tipo</th>
                        <th>Dias pendentes importação</th>
                        <th>Pendentes conciliação</th>
                        <th>Pendentes ranking</th>
                        <th>Total do dia</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoDiasPendentes.length === 0 ? (
                        <tr>
                          <td colSpan={7}>Nenhuma data pendente para o mês selecionado.</td>
                        </tr>
                      ) : (
                        resumoDiasPendentes.map((item) => (
                          <tr key={`pend-${item.date}`}>
                            <td data-label="Data pendente">{formatDate(item.date)}</td>
                            <td data-label="Tipo">{getResumoDiaLabel(item)}</td>
                            <td data-label="Dias pendentes importação">{item.pendentesImportacao || 0}</td>
                            <td data-label="Pendentes conciliação">{item.pendentesConciliacao}</td>
                            <td data-label="Pendentes ranking">{item.pendentesRanking}</td>
                            <td data-label="Total do dia">{item.total}</td>
                            <td data-label="Ação">
                              <AppButton
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setDayFilter(item.date);
                                  setSecaoAtiva("registros");
                                }}
                              >
                                Filtrar dia
                              </AppButton>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
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
                      execucoes.map((item) => (
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
            </AppCard>
          </>
        ) : null}

        {secaoAtiva === "importacao" ? (
          <AppCard
            className="mb-3"
            id="conciliacao-importacao"
            title="Importar arquivo da conciliacao"
            subtitle="Carregue TXT, XLS ou XLSX, revise todas as linhas operacionais e atribua o vendedor recibo por recibo antes de importar."
            actions={
              <div className="vtur-import-upload-row">
                <label className="vtur-import-upload-trigger" htmlFor="conciliacao-upload-input">
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
                    A atribuição do vendedor/gestor é obrigatória apenas para recibos efetivados em BAIXA antes da importação.
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
                {parsedLinhas.map((linha, index) => {
                  const exigeAtribuicao = linhaExigeAtribuicaoRanking(linha);
                  const linhaKey = `${linha.documento}-${linha.descricao_chave || linha.status || "row"}-${index}`;
                  return (
                    <tr key={linhaKey}>
                      <td data-label="Data">{formatDate(linha.movimento_data)}</td>
                      <td data-label="Documento">{linha.documento}</td>
                      <td data-label="Status">{linha.status || "OUTRO"}</td>
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
                          <span>{linha.status === "OPFAX" ? "Standby (OPFAX)" : "Ignorado"}</span>
                        )}
                      </td>
                      <td data-label="Meta dif.">
                        {!exigeAtribuicao ? (
                          <span>-</span>
                        ) : rankingProdutosMeta.length === 0 ? (
                          <span>-</span>
                        ) : produtoMetaUnico ? (
                          linha.is_seguro_viagem ? (
                            <span>{`Automático (${produtoMetaUnico.nome})`}</span>
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
                      <td data-label="Lançamentos">{formatMoney(linha.valor_lancamentos)}</td>
                      <td data-label="Taxas">{formatMoney(linha.valor_taxas)}</td>
                      <td data-label="Descontos">{formatMoney(linha.valor_descontos)}</td>
                      <td data-label="Abatimentos">{formatMoney(linha.valor_abatimentos)}</td>
                      <td data-label="Venda real">{formatMoney(linha.valor_venda_real)}</td>
                      <td data-label="Comissão loja">{formatMoney(linha.valor_comissao_loja)}</td>
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
          </AppCard>
        ) : null}

        {secaoAtiva === "registros" ? (
          <AppCard
            className="mb-3"
            title="Registros conciliados"
            subtitle="Comparativo entre o arquivo importado e os dados do sistema, com atribuição do ranking feita recibo por recibo."
          >
            <DataTable
              headers={
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Status</th>
                  <th>Recibo encontrado</th>
                  <th>Vendedor ranking</th>
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
              loading={loadingLista}
              empty={!loadingLista && itens.length === 0}
              emptyMessage={
                <EmptyState
                  title={precisaEmpresaMaster ? "Selecione uma empresa" : "Nenhum registro encontrado"}
                  description={
                    precisaEmpresaMaster
                      ? "Escolha a empresa para liberar a listagem e as acoes da conciliacao."
                      : "Nao ha registros para o recorte atual. Ajuste os filtros ou importe um novo arquivo."
                  }
                />
              }
              colSpan={19}
              className="table-header-green table-mobile-cards min-w-[2040px]"
            >
              {itens.map((row) => (
                <tr key={row.id}>
                  {(() => {
                    const rowLocked = isRowLocked(row);
                    const rowSaving = savingAssignmentId === row.id;
                    return (
                      <>
                  <td data-label="Data">{formatDate(row.movimento_data)}</td>
                  <td data-label="Documento">{row.documento}</td>
                  <td data-label="Status">{row.status}</td>
                  <td data-label="Recibo encontrado">{row.venda_recibo_id ? "Sim" : "Nao"}</td>
                  <td data-label="Vendedor ranking">
                    <select
                      className="form-select"
                      value={rankingVendedorDrafts[row.id] ?? row.ranking_vendedor_id ?? ""}
                      disabled={loadingOptions || rowSaving || rowLocked}
                      onChange={(e) => updateRankingVendedorDraft(row.id, e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {rankingAssignees.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.nome_completo}
                          {opt.tipo ? ` (${opt.tipo})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Meta dif.">
                    {rankingProdutosMeta.length === 0 ? (
                      <span>-</span>
                    ) : produtoMetaUnico ? (
                      <select
                        className="form-select"
                        value={(rankingProdutoDrafts[row.id] ?? row.ranking_produto_id ?? "") === produtoMetaUnico.id ? produtoMetaUnico.id : ""}
                        disabled={loadingOptions || rowSaving || rowLocked}
                        onChange={(e) => updateRankingProdutoDraft(row.id, e.target.value)}
                      >
                        <option value="">Nao</option>
                        <option value={produtoMetaUnico.id}>Sim ({produtoMetaUnico.nome})</option>
                      </select>
                    ) : (
                      <select
                        className="form-select"
                        value={rankingProdutoDrafts[row.id] ?? row.ranking_produto_id ?? ""}
                        disabled={loadingOptions || rowSaving || rowLocked}
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
                  <td data-label="Conciliado">{row.conciliado ? "Sim" : "Nao"}</td>
                  <td className="th-actions" data-label="Ações">
                    <div className="action-buttons vtur-table-actions">
                      {rowLocked ? (
                        <AppButton
                          type="button"
                          variant="ghost"
                          className="btn-icon vtur-table-action"
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
                          className="btn-icon vtur-table-action"
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
                        className="btn-icon vtur-table-action"
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
          </AppCard>
        ) : null}

        {secaoAtiva === "alteracoes" ? (
          <AppCard
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
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Grupos</span>
                <strong>{changeGroups.length}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Pendentes</span>
                <strong>{alteracoesPendentesCount}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Selecionadas</span>
                <strong>{selectedPendingCount}</strong>
              </div>
            </div>

            <div className="mt-3">
              <AppField
                as="select"
                label="Alterações"
                value={somenteAlteracoesPendentes ? "pendentes" : "todas"}
                onChange={(e) => setSomenteAlteracoesPendentes(e.target.value === "pendentes")}
                disabled={loadingChanges}
                options={[
                  { label: "Somente nao revertidas", value: "pendentes" },
                  { label: "Todas", value: "todas" },
                ]}
              />
            </div>

            <div className="mt-3">
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
                empty={!loadingChanges && changeGroups.length === 0}
                emptyMessage={
                  <EmptyState
                    title={precisaEmpresaMaster ? "Selecione uma empresa" : "Nenhuma alteracao registrada"}
                    description={
                      precisaEmpresaMaster
                        ? "Escolha a empresa para consultar o historico de alteracoes."
                        : "Nao ha alteracoes para o recorte atual."
                    }
                  />
                }
                colSpan={9}
                className="table-header-blue table-mobile-cards min-w-[920px]"
              >
                {changeGroups.map((group) => {
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
          </AppCard>
        ) : null}
      </div>
    </AppPrimerProvider>
  );
}
