import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";

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
  last_checked_at: string | null;
  conciliado_em: string | null;
  created_at: string;
  updated_at: string;
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
  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;
  origem?: string | null;
  raw?: any;
};

function parsePtBrNumber(value: any): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, "").replace(/,/g, ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseMovimentoDateFromTxt(text: string): string | null {
  const m = text.match(/Movimenta[cç][aã]o\s+do\s+Dia:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;
  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function inferStatus(descricao: string): "BAIXA" | "OPFAX" | "ESTORNO" | "OUTRO" {
  const t = String(descricao || "").toUpperCase();
  if (t.includes("ESTORNO")) return "ESTORNO";
  if (t.includes("OPFAX")) return "OPFAX";
  if (t.includes("BAIXA") && t.includes("RECIBO")) return "BAIXA";
  return "OUTRO";
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
    const valor_opfax = parsePtBrNumber(parts[10]);
    const valor_saldo = parsePtBrNumber(parts[11]);

    linhas.push({
      documento,
      movimento_data: movimentoData,
      status: inferStatus(descricao),
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
    });
  }

  return { movimentoData, linhas };
}

async function parseConciliacaoXls(file: File, origem: string): Promise<{ movimentoData: string | null; linhas: LinhaInput[] }> {
  const module = await import("xlsx");
  const XLSX = (module as any).default ?? module;
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return { movimentoData: null, linhas: [] };
  const ws = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  if (!rows || rows.length === 0) return { movimentoData: null, linhas: [] };

  const headerIdx = rows.findIndex((r) => r.some((cell) => String(cell || "").toUpperCase().includes("DOCUMENTO")));
  if (headerIdx < 0) {
    return { movimentoData: null, linhas: [] };
  }

  const headerRow = rows[headerIdx].map((c) => String(c || "").trim());
  const colIndexAny = (needles: string[]) => {
    const norm = (v: any) =>
      String(v || "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
    const headerNorm = headerRow.map(norm);
    const wanted = needles.map(norm);
    return headerNorm.findIndex((h) => wanted.some((n) => h.includes(n)));
  };

  const cDocumento = colIndexAny(["DOCUMENTO"]);
  const cDescricao = colIndexAny(["DESCRICAO", "DESCRI"]);
  const cLanc = colIndexAny(["LANCAMENTOS", "LANC"]);
  const cTaxas = colIndexAny(["TAXAS"]);
  const cDesc = colIndexAny(["DESCONTOS", "DESCONT"]);
  const cAbat = colIndexAny(["ABATIMENTOS", "ABAT"]);
  const cCalc = colIndexAny(["CALCULADA LOJA", "CALCUL"]);
  const cVisao = colIndexAny(["VISAO MASTER", "VISAO", "VIS"]);
  const cOpfax = colIndexAny(["OPFAX"]);
  const cSaldo = colIndexAny(["SALDO"]);

  const linhas: LinhaInput[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const doc = String(r[cDocumento] || "").trim();
    if (!doc) continue;
    if (/^(SUBTOTAL|TOTAL)\b/i.test(doc)) continue;

    const descricao = cDescricao >= 0 ? String(r[cDescricao] || "").trim() : "";

    const pick = (idx: number) => (idx >= 0 ? parsePtBrNumber(r[idx]) : null);

    linhas.push({
      documento: doc,
      status: inferStatus(descricao),
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
    });
  }

  return { movimentoData: null, linhas };
}

function formatMoney(value: number | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pt-BR");
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

  const [somentePendentes, setSomentePendentes] = useState(true);
  const [loadingLista, setLoadingLista] = useState(false);
  const [itens, setItens] = useState<ConciliacaoItem[]>([]);

  const [importando, setImportando] = useState(false);
  const [conciliando, setConciliando] = useState(false);

  const [showChanges, setShowChanges] = useState(false);
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

      const resp = await fetch(`/api/v1/conciliacao/list?${qs.toString()}`, {
        method: "GET",
        credentials: "same-origin",
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
  }, [resolvedCompanyId, somentePendentes]);

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
          linhas: parsedLinhas,
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const json = (await resp.json()) as any;

      showToast(
        `Importado: ${json?.imported || 0}. Checados: ${json?.checked || 0}. Conciliados: ${json?.reconciled || 0}.`,
        "success"
      );

      await carregarLista();
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

  const preview = useMemo(() => {
    if (!parsedLinhas.length) return [];
    return parsedLinhas.slice(0, 10);
  }, [parsedLinhas]);

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <div className="card-base card-config">
        <strong>Você não possui acesso ao módulo Conciliação.</strong>
      </div>
    );
  }

  if (loadingUser) return <LoadingUsuarioContext />;

  const precisaEmpresaMaster = isMaster && !resolvedCompanyId;

  return (
    <div className="conciliacao-page">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      <div className="card-base mb-3 list-toolbar-sticky">
        <div
          className="form-row mobile-stack"
          style={{ gap: 12, gridTemplateColumns: isMaster ? "minmax(240px, 1fr) 1fr auto" : "minmax(240px, 1fr) auto" }}
        >
          {isMaster && (
            <div className="form-group">
              <label className="form-label">Empresa</label>
              <select
                className="form-select"
                value={empresaSelecionada}
                onChange={(e) => setEmpresaSelecionada(e.target.value)}
              >
                <option value="all">Selecione...</option>
                {empresas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_fantasia || c.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Arquivo (TXT/XLS/XLSX)</label>
            <input
              ref={fileRef}
              className="form-input"
              type="file"
              accept=".txt,.xls,.xlsx"
              disabled={importando || conciliando || precisaEmpresaMaster}
              onChange={(e) => onPickFile(e.target.files?.[0] || null)}
            />
            <small className="text-muted">
              Linhas reconhecidas: <strong>{parsedLinhas.length}</strong>
              {parsedMovimentoData ? ` • Data: ${parsedMovimentoData}` : ""}
            </small>
          </div>

          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <div className="form-label" aria-hidden="true">
              &nbsp;
            </div>
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-primary w-full sm:w-auto"
                disabled={importando || conciliando || !arquivo || parsedLinhas.length === 0 || precisaEmpresaMaster}
                onClick={importar}
              >
                {importando ? "Importando..." : "Importar"}
              </button>
              <button
                type="button"
                className="btn btn-light w-full sm:w-auto"
                disabled={importando || conciliando || precisaEmpresaMaster}
                onClick={conciliarPendentes}
              >
                {conciliando ? "Conciliando..." : "Conciliar pendentes"}
              </button>
            </div>
          </div>
        </div>

        {preview.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <small className="text-muted">
              Preview (primeiras {preview.length} linhas):
            </small>
            <div className="table-container overflow-x-auto mt-2">
              <table className="table-default table-mobile-cards min-w-[820px]">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Status</th>
                    <th>Descrição</th>
                    <th>Total</th>
                    <th>Taxas</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((l) => (
                    <tr key={l.documento}>
                      <td data-label="Documento">{l.documento}</td>
                      <td data-label="Status">{l.status || "OUTRO"}</td>
                      <td data-label="Descrição">{l.descricao || "-"}</td>
                      <td data-label="Total">{formatMoney(l.valor_lancamentos)}</td>
                      <td data-label="Taxas">{formatMoney(l.valor_taxas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card-base mb-3">
        <div className="form-row mobile-stack" style={{ gap: 12, alignItems: "flex-end" }}>
          <div className="form-group">
            <label className="form-label">Mostrar</label>
            <select
              className="form-select"
              value={somentePendentes ? "pendentes" : "todas"}
              onChange={(e) => setSomentePendentes(e.target.value === "pendentes")}
              disabled={loadingLista}
            >
              <option value="pendentes">Somente pendentes</option>
              <option value="todas">Todas</option>
            </select>
          </div>
          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <button
              type="button"
              className="btn btn-light w-full sm:w-auto"
              disabled={loadingLista || precisaEmpresaMaster}
              onClick={carregarLista}
            >
              {loadingLista ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </div>

      <div className="table-container overflow-x-auto">
        <table className="table-default table-mobile-cards min-w-[1200px]">
          <thead>
            <tr>
              <th>Data</th>
              <th>Documento</th>
              <th>Status</th>
              <th>Total (arq)</th>
              <th>Taxas (arq)</th>
              <th>Total (sist)</th>
              <th>Taxas (sist)</th>
              <th>Diff total</th>
              <th>Diff taxas</th>
              <th>Conciliado</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((row) => (
              <tr key={row.id}>
                <td data-label="Data">{row.movimento_data || "-"}</td>
                <td data-label="Documento">{row.documento}</td>
                <td data-label="Status">{row.status}</td>
                <td data-label="Total (arq)">{formatMoney(row.valor_lancamentos)}</td>
                <td data-label="Taxas (arq)">{formatMoney(row.valor_taxas)}</td>
                <td data-label="Total (sist)">{formatMoney(row.sistema_valor_total)}</td>
                <td data-label="Taxas (sist)">{formatMoney(row.sistema_valor_taxas)}</td>
                <td data-label="Diff total">{formatMoney(row.diff_total)}</td>
                <td data-label="Diff taxas">{formatMoney(row.diff_taxas)}</td>
                <td data-label="Conciliado">{row.conciliado ? "Sim" : "Não"}</td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={10} className="text-muted" style={{ textAlign: "center", padding: 16 }}>
                  {precisaEmpresaMaster
                    ? "Selecione uma empresa."
                    : loadingLista
                    ? "Carregando..."
                    : "Nenhum registro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card-base mt-3">
        <div className="form-row mobile-stack" style={{ gap: 12, alignItems: "flex-end" }}>
          <div className="form-group">
            <label className="form-label">Alterações</label>
            <select
              className="form-select"
              value={somenteAlteracoesPendentes ? "pendentes" : "todas"}
              onChange={(e) => setSomenteAlteracoesPendentes(e.target.value === "pendentes")}
              disabled={loadingChanges}
            >
              <option value="pendentes">Somente não revertidas</option>
              <option value="todas">Todas</option>
            </select>
          </div>

          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <div className="mobile-stack-buttons">
              <button
                type="button"
                className="btn btn-light w-full sm:w-auto"
                disabled={loadingChanges || precisaEmpresaMaster}
                onClick={() => {
                  setShowChanges(true);
                  carregarAlteracoes();
                }}
              >
                {loadingChanges ? "Carregando..." : "Ver alterações"}
              </button>
              <button
                type="button"
                className="btn btn-light w-full sm:w-auto"
                disabled={loadingChanges || precisaEmpresaMaster}
                onClick={() => setShowChanges(false)}
              >
                Ocultar
              </button>
            </div>
          </div>

          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-light w-full sm:w-auto"
                disabled={loadingChanges || precisaEmpresaMaster || selectedGroupKeys.size === 0}
                onClick={reverterSelecionados}
              >
                Reverter selecionados
              </button>
              <button
                type="button"
                className="btn btn-light w-full sm:w-auto"
                disabled={loadingChanges || precisaEmpresaMaster}
                onClick={reverterTudo}
              >
                Reverter tudo
              </button>
            </div>
          </div>
        </div>

        {showChanges && (
          <div className="table-container overflow-x-auto mt-3">
            <table className="table-default table-mobile-cards min-w-[920px]">
              <thead>
                <tr>
                  <th style={{ width: 48 }}></th>
                  <th>Quando</th>
                  <th>Recibo</th>
                  <th>Alterações</th>
                  <th>Taxas (antes)</th>
                  <th>Taxas (novo)</th>
                  <th>Origem</th>
                  <th>Por</th>
                  <th>Revertido</th>
                </tr>
              </thead>
              <tbody>
                {changeGroups.map((g) => {
                  const hasPending = g.count_pendentes > 0;
                  const checked = selectedGroupKeys.has(g.key);
                  const labelRecibo = g.numero_recibo || "-";
                  const origem = g.actor === "user" ? "manual" : "cron";
                  const revertLabel = g.reverted_at ? formatDateTime(g.reverted_at) : "-";

                  return (
                    <tr key={g.key}>
                      <td data-label="Selecionar">
                        <input
                          type="checkbox"
                          disabled={!hasPending}
                          checked={checked}
                          onChange={(e) => {
                            setSelectedGroupKeys((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(g.key);
                              else next.delete(g.key);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td data-label="Quando">{formatDateTime(g.last_changed_at)}</td>
                      <td data-label="Recibo">{labelRecibo}</td>
                      <td data-label="Alterações">
                        {g.count_total}
                        {hasPending ? ` (${g.count_pendentes} pend.)` : ""}
                      </td>
                      <td data-label="Taxas (antes)">{formatMoney(g.old_value)}</td>
                      <td data-label="Taxas (novo)">{formatMoney(g.new_value)}</td>
                      <td data-label="Origem">{origem}</td>
                      <td data-label="Por">{g.changed_by_label}</td>
                      <td data-label="Revertido">{revertLabel}</td>
                    </tr>
                  );
                })}
                {changeGroups.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-muted" style={{ textAlign: "center", padding: 16 }}>
                      {precisaEmpresaMaster
                        ? "Selecione uma empresa."
                        : loadingChanges
                        ? "Carregando..."
                        : "Nenhuma alteração registrada."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
