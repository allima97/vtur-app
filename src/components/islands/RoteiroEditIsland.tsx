import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { exportRoteiroPdf } from "../../lib/quote/roteiroPdf";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import { extractPlainTextFromFile } from "../../lib/documentosViagens/extractPlainTextFromFile";

// ─── Types ────────────────────────────────────────────────────────────────────
type RotHotel = {
  id?: string;
  cidade: string;
  hotel: string;
  data_inicio: string;
  data_fim: string;
  noites: number;
  apto: string;
  categoria: string;
  regime: string;
  ordem: number;
};
type RotPasseio = {
  id?: string;
  cidade: string;
  passeio: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  ingressos: string;
  ordem: number;
};
type RotTransporte = {
  id?: string;
  tipo: string;
  fornecedor: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  categoria: string;
  observacao: string;
  ordem: number;
};
type RotDia = {
  id?: string;
  percurso: string;
  cidade: string;
  data: string;
  descricao: string;
  ordem: number;
};
type RotInvestimento = {
  id?: string;
  tipo: string;
  valor_por_pessoa: number;
  qtd_apto: number;
  valor_por_apto: number;
  ordem: number;
};
type RotPagamento = {
  id?: string;
  servico: string;
  valor_total_com_taxas: number;
  taxas: number;
  forma_pagamento: string;
  ordem: number;
};
type Cliente = { id: string; nome: string; whatsapp?: string; email?: string };
type DiaBanco = { id: string; percurso?: string; cidade: string; descricao: string; data?: string };

type AbaId = "hoteis" | "passeios" | "transporte" | "itinerario" | "investimento" | "pagamento" | "inclusoes" | "informacoes";
const ABAS: { id: AbaId; label: string }[] = [
  { id: "hoteis", label: "Hotéis Sugeridos" },
  { id: "passeios", label: "Passeios Principais" },
  { id: "transporte", label: "Transporte Incluído" },
  { id: "itinerario", label: "Itinerário Detalhado" },
  { id: "investimento", label: "Investimento" },
  { id: "pagamento", label: "Formas de Pagamento" },
  { id: "inclusoes", label: "Incluído / Não Incluído" },
  { id: "informacoes", label: "Informações Importantes" },
];

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  roteiroId: string;
  roteiro?: any | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hojeISO(): string {
  // YYYY-MM-DD no fuso local (evita min=hoje “voltar” um dia em alguns fusos)
  const now = new Date();
  const tzOffsetMinutes = now.getTimezoneOffset();
  const local = new Date(now.getTime() - tzOffsetMinutes * 60000);
  return local.toISOString().slice(0, 10);
}

function calcNoites(di: string, df: string): number {
  if (!di || !df) return 0;
  const a = new Date(di + "T12:00:00");
  const b = new Date(df + "T12:00:00");
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(diff, 0);
}

function calcVpa(vpp: number, qtd: number): number {
  return vpp * Math.max(qtd, 1);
}

function normalizeDiaKey(d: Pick<RotDia, "cidade" | "percurso" | "data" | "descricao">): string {
  const cidade = String(d.cidade || "").trim().toLocaleLowerCase();
  const percurso = String(d.percurso || "").trim().toLocaleLowerCase();
  const data = String(d.data || "").trim();
  const descricao = String(d.descricao || "").trim().toLocaleLowerCase();
  return `${data}__${cidade}__${percurso}__${descricao}`;
}

function normalizeDiasForPersist(list: RotDia[]): RotDia[] {
  const sorted = (list || [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const filtered = sorted
    .map((d) => ({
      ...d,
      percurso: String(d.percurso || "").trim(),
      cidade: String(d.cidade || "").trim(),
      data: String(d.data || "").trim(),
      descricao: String(d.descricao || "").trim(),
    }))
    .filter((d) => Boolean(d.percurso || d.cidade || d.data || d.descricao));

  const seen = new Set<string>();
  const unique: RotDia[] = [];
  for (const d of filtered) {
    const key = normalizeDiaKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...d, ordem: unique.length });
  }

  return unique;
}

const labelSt: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  display: "block",
  marginBottom: 4,
};

const cardSt: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const inputSt: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 12,
  outline: "none",
  background: "#fff",
  color: "#111827",
  boxSizing: "border-box",
};

const tdSt: React.CSSProperties = {
  padding: "7px 8px",
  verticalAlign: "top",
};

const actionBtnSt: React.CSSProperties = {
  padding: "4px 8px",
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
};

function toUtcDateOrNull(value?: string | null) {
  const v = String(value || "").trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addUtcDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISODateUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDiasFromHoteis(params: { hoteis: RotHotel[]; inicioCidade?: string | null }): RotDia[] {
  const inicioCidade = String(params.inicioCidade || "").trim();

  const blocks = (params.hoteis || [])
    .map((h) => ({
      cidade: String(h.cidade || "").trim(),
      di: String(h.data_inicio || "").trim(),
      df: String(h.data_fim || "").trim(),
    }))
    .filter((h) => Boolean(h.cidade && h.di && h.df));

  const sorted = blocks
    .slice()
    .sort((a, b) => {
      const da = toUtcDateOrNull(a.di);
      const db = toUtcDateOrNull(b.di);
      return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
    });

  const out: RotDia[] = [];
  let prevCity = "";

  for (let bi = 0; bi < sorted.length; bi++) {
    const block = sorted[bi];
    const start = toUtcDateOrNull(block.di);
    const end = toUtcDateOrNull(block.df);
    if (!start || !end) continue;

    const isFirstBlock = bi === 0;
    const fromCity = isFirstBlock ? inicioCidade : prevCity;
    const isMoveDay = Boolean(fromCity && fromCity !== block.cidade);
    const firstDayPercurso = isMoveDay ? `${fromCity} - ${block.cidade}` : block.cidade;

    if (end.getTime() <= start.getTime()) {
      out.push({
        data: toISODateUTC(start),
        percurso: firstDayPercurso,
        cidade: block.cidade,
        descricao: "",
        ordem: out.length,
      });
      prevCity = block.cidade;
      continue;
    }

    let cur = start;
    let dayIndexInBlock = 0;
    while (cur.getTime() < end.getTime()) {
      out.push({
        data: toISODateUTC(cur),
        percurso: dayIndexInBlock === 0 ? firstDayPercurso : block.cidade,
        cidade: block.cidade,
        descricao: "",
        ordem: out.length,
      });
      cur = addUtcDays(cur, 1);
      dayIndexInBlock++;
      if (dayIndexInBlock > 60) break;
    }

    prevCity = block.cidade;
  }

  return out;
}

function newHotel(ordem: number): RotHotel {
  return {
    cidade: "",
    hotel: "",
    data_inicio: "",
    data_fim: "",
    noites: 0,
    apto: "",
    categoria: "",
    regime: "",
    ordem,
  };
}

function newPasseio(ordem: number): RotPasseio {
  return {
    cidade: "",
    passeio: "",
    data_inicio: "",
    data_fim: "",
    tipo: "Compartilhado",
    ingressos: "Inclui Ingressos",
    ordem,
  };
}

function newTransporte(ordem: number): RotTransporte {
  return {
    tipo: "",
    fornecedor: "",
    descricao: "",
    data_inicio: "",
    data_fim: "",
    categoria: "",
    observacao: "",
    ordem,
  };
}

function newDia(ordem: number): RotDia {
  return {
    percurso: "",
    cidade: "",
    data: "",
    descricao: "",
    ordem,
  };
}

function newInvestimento(ordem: number): RotInvestimento {
  const valor_por_pessoa = 0;
  const qtd_apto = 1;
  return {
    tipo: "",
    valor_por_pessoa,
    qtd_apto,
    valor_por_apto: calcVpa(valor_por_pessoa, qtd_apto),
    ordem,
  };
}

function newPagamento(ordem: number): RotPagamento {
  return {
    servico: "",
    valor_total_com_taxas: 0,
    taxas: 0,
    forma_pagamento: "",
    ordem,
  };
}

// ─── RowActions ───────────────────────────────────────────────────────────────
function RowActions({
  onAdd, onDelete, onUp, onDown,
}: {
  onAdd: () => void;
  onDelete: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  return (
    <td className="th-actions" style={{ ...tdSt, whiteSpace: "nowrap", textAlign: "center" }}>
      <button onClick={onUp} style={actionBtnSt} title="Subir">▲</button>{" "}
      <button onClick={onDown} style={actionBtnSt} title="Descer">▼</button>{" "}
      <button onClick={onAdd} style={actionBtnSt} title="Adicionar abaixo">+</button>{" "}
      <button onClick={onDelete} style={{ ...actionBtnSt, color: "#dc2626", borderColor: "#fca5a5" }} title="Excluir">🗑</button>
    </td>
  );
}

// ─── AutocompleteInput ────────────────────────────────────────────────────────
function AutocompleteInput({
  value,
  onChange,
  onBlurSave,
  suggestions,
  placeholder,
  style,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlurSave?: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  // Precisa ser estável entre SSR e hidratação (evita warning "Prop `list` did not match")
  const reactId = useId();
  const listId = useMemo(() => {
    const cleaned = String(reactId).replace(/[^a-zA-Z0-9_-]/g, "");
    return `ac-${cleaned || "id"}`;
  }, [reactId]);
  return (
    <>
      <input
        style={style ?? inputSt}
        list={listId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && onBlurSave) onBlurSave(v);
        }}
      />
      <datalist id={listId}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RoteiroEditIsland({ roteiroId, roteiro }: Props) {
  const isNew = roteiroId === "novo";
  const hoje = hojeISO();

  // ─── Info
  const [nome, setNome] = useState(roteiro?.nome || "");
  const [duracao, setDuracao] = useState<number | "">(roteiro?.duracao ?? "");
  const [inicioCidade, setInicioCidade] = useState(roteiro?.inicio_cidade || "");
  const [fimCidade, setFimCidade] = useState(roteiro?.fim_cidade || "");
  const [incluiTexto, setIncluiTexto] = useState(roteiro?.inclui_texto || "");
  const [naoIncluiTexto, setNaoIncluiTexto] = useState(roteiro?.nao_inclui_texto || "");
  const [informacoesImportantes, setInformacoesImportantes] = useState(roteiro?.informacoes_importantes || "");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingFile, setImportingFile] = useState(false);

  // ─── Seções
  const [hoteis, setHoteis] = useState<RotHotel[]>(
    (roteiro?.roteiro_hotel || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_hotel || []).sort((a: any, b: any) => a.ordem - b.ordem)
      : [newHotel(0)]
  );
  const [passeios, setPasseios] = useState<RotPasseio[]>(() => {
    const raw = (roteiro?.roteiro_passeio || []).sort((a: any, b: any) => a.ordem - b.ordem);
    if (raw.length === 0) return [newPasseio(0)];
    return raw.map((p: any) => ({
      ...p,
      data_inicio: p.data_inicio || p.data || "",
      data_fim: p.data_fim || "",
    }));
  });
  const [transportes, setTransportes] = useState<RotTransporte[]>(
    (roteiro?.roteiro_transporte || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_transporte || []).sort((a: any, b: any) => a.ordem - b.ordem)
      : [newTransporte(0)]
  );
  const [dias, setDias] = useState<RotDia[]>(
    (roteiro?.roteiro_dia || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_dia || [])
          .sort((a: any, b: any) => a.ordem - b.ordem)
          .map((d: any) => ({
            ...d,
            percurso: String(d?.percurso || "").trim(),
            cidade: String(d?.cidade || "").trim(),
            data: String(d?.data || "").trim(),
            descricao: String(d?.descricao || "").trim(),
          }))
      : [newDia(0)]
  );
  const [investimentos, setInvestimentos] = useState<RotInvestimento[]>(
    (roteiro?.roteiro_investimento || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_investimento || []).sort((a: any, b: any) => a.ordem - b.ordem)
      : [newInvestimento(0)]
  );
  const [pagamentos, setPagamentos] = useState<RotPagamento[]>(
    (roteiro?.roteiro_pagamento || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_pagamento || []).sort((a: any, b: any) => a.ordem - b.ordem)
      : [newPagamento(0)]
  );

  // ─── UI state
  const [abaAtiva, setAbaAtiva] = useState<AbaId>("hoteis");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(isNew ? null : roteiroId);

  // ─── Sugestões autocomplete
  const [sugestoes, setSugestoes] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch("/api/v1/roteiros/sugestoes-busca")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.sugestoes) setSugestoes(d.sugestoes); })
      .catch(() => {});
  }, []);

  const salvarSugestao = useCallback(async (tipo: string, valor: string) => {
    const v = valor.trim();
    if (!v) return;
    const existing = (sugestoes[tipo] || []).map((s) => s.toLowerCase());
    if (existing.includes(v.toLowerCase())) return;
    try {
      await fetch("/api/v1/roteiros/sugestoes-salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, valor: v }),
      });
      setSugestoes((prev) => ({ ...prev, [tipo]: [...(prev[tipo] || []), v] }));
    } catch {}
  }, [sugestoes]);

  // ─── Modal busca dias
  const [showDiasBusca, setShowDiasBusca] = useState(false);
  const [diasBuscaQ, setDiasBuscaQ] = useState("");
  const [diasBuscaCidade, setDiasBuscaCidade] = useState("");
  const [diasBuscaResults, setDiasBuscaResults] = useState<DiaBanco[]>([]);
  const [diasBuscaLoading, setDiasBuscaLoading] = useState(false);

  // ─── Modal gerar orçamento
  const [showGerarModal, setShowGerarModal] = useState(false);
  const [gerarClienteQ, setGerarClienteQ] = useState("");
  const [gerarClienteResults, setGerarClienteResults] = useState<Cliente[]>([]);
  const [gerarClienteSel, setGerarClienteSel] = useState<Cliente | null>(null);
  const [gerarClienteNome, setGerarClienteNome] = useState("");
  const [gerarLoading, setGerarLoading] = useState(false);
  const [gerarClienteLoading, setGerarClienteLoading] = useState(false);
  const clienteSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const pdfBusy = exportingPdf || previewingPdf;

  // ─── Section list helpers ─────────────────────────────────────────────────
  function listOps<T extends { ordem: number }>(
    list: T[],
    setList: React.Dispatch<React.SetStateAction<T[]>>,
    newFn: (ordem: number) => T
  ) {
    const reorder = (arr: T[]) => arr.map((item, i) => ({ ...item, ordem: i }));
    return {
      update: (index: number, patch: Partial<T>) =>
        setList((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item))),
      add: (afterIndex: number) =>
        setList((prev) => {
          const next = [...prev];
          next.splice(afterIndex + 1, 0, newFn(afterIndex + 1));
          return reorder(next);
        }),
      remove: (index: number) =>
        setList((prev) => reorder(prev.filter((_, i) => i !== index))),
      moveUp: (index: number) =>
        setList((prev) => {
          if (index === 0) return prev;
          const next = [...prev];
          [next[index - 1], next[index]] = [next[index], next[index - 1]];
          return reorder(next);
        }),
      moveDown: (index: number) =>
        setList((prev) => {
          if (index === prev.length - 1) return prev;
          const next = [...prev];
          [next[index], next[index + 1]] = [next[index + 1], next[index]];
          return reorder(next);
        }),
    };
  }

  const hotelOps = listOps(hoteis, setHoteis, newHotel);
  const passeioOps = listOps(passeios, setPasseios, newPasseio);
  const transporteOps = listOps(transportes, setTransportes, newTransporte);
  const diaOps = listOps(dias, setDias, newDia);
  const investimentoOps = listOps(investimentos, setInvestimentos, newInvestimento);
  const pagamentoOps = listOps(pagamentos, setPagamentos, newPagamento);

  // ─── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!nome.trim()) { alert("Nome do roteiro é obrigatório."); return; }
    setSaving(true);
    setSaveMsg(null);
    try {
      let diasToPersist = normalizeDiasForPersist(dias);
      if (diasToPersist.length === 0) {
        const autoDias = buildDiasFromHoteis({ hoteis, inicioCidade });
        if (autoDias.length > 0) {
          diasToPersist = normalizeDiasForPersist(autoDias);
        }
      }
      const body = {
        id: currentId || undefined,
        nome: nome.trim(),
        duracao: duracao !== "" ? Number(duracao) : null,
        inicio_cidade: inicioCidade.trim() || null,
        fim_cidade: fimCidade.trim() || null,
        inclui_texto: incluiTexto,
        nao_inclui_texto: naoIncluiTexto,
        informacoes_importantes: informacoesImportantes,
        hoteis,
        passeios,
        transportes,
        dias: diasToPersist,
        investimentos,
        pagamentos,
      };
      const res = await fetch("/api/v1/roteiros/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!currentId && data.id) {
        setCurrentId(data.id);
        window.history.replaceState({}, "", `/orcamentos/personalizados/${data.id}`);
      }

      // garante que a UI e o PDF reflitam o que foi persistido (sem duplicados/linhas vazias)
      setDias(diasToPersist.length ? diasToPersist : [newDia(0)]);
      setSaveMsg("Salvo com sucesso!");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Export PDF ───────────────────────────────────────────────────────────
  function buildRoteiroParaPdf() {
    let diasToExport = normalizeDiasForPersist(dias);
    if (diasToExport.length === 0) {
      const autoDias = buildDiasFromHoteis({ hoteis, inicioCidade });
      if (autoDias.length > 0) {
        diasToExport = normalizeDiasForPersist(autoDias);
      }
    }
    return {
      nome: nome || "roteiro",
      duracao: duracao !== "" ? Number(duracao) : undefined,
      inicio_cidade: inicioCidade || undefined,
      fim_cidade: fimCidade || undefined,
      inclui_texto: incluiTexto,
      nao_inclui_texto: naoIncluiTexto,
        informacoes_importantes: informacoesImportantes,
      hoteis,
      passeios,
      transportes,
      dias: diasToExport,
      investimentos,
      pagamentos,
    };
  }

  async function handlePreviewPdf() {
    setPreviewingPdf(true);
    try {
      await exportRoteiroPdf(buildRoteiroParaPdf(), { action: "preview" });
    } catch (err: any) {
      alert(err.message || "Erro ao visualizar PDF.");
    } finally {
      setPreviewingPdf(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportRoteiroPdf(buildRoteiroParaPdf(), { action: "download" });
    } catch (err: any) {
      alert(err.message || "Erro ao exportar PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  // ─── Busca dias banco ─────────────────────────────────────────────────────
  async function handleBuscarDias() {
    setDiasBuscaLoading(true);
    try {
      const params = new URLSearchParams();
      if (diasBuscaQ) params.set("q", diasBuscaQ);
      if (diasBuscaCidade) params.set("cidade", diasBuscaCidade);
      const res = await fetch(`/api/v1/roteiros/dias-busca?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDiasBuscaResults(data.dias || []);
    } catch (err: any) {
      alert(err.message || "Erro ao buscar dias.");
    } finally {
      setDiasBuscaLoading(false);
    }
  }

  function addDiaBanco(dia: DiaBanco) {
    setDias((prev) => {
      const nextItem: RotDia = {
        percurso: String((dia as any).percurso || "").trim(),
        cidade: String(dia.cidade || "").trim(),
        data: String(dia.data || "").trim(),
        descricao: String(dia.descricao || "").trim(),
        ordem: prev.length,
      };
      const key = normalizeDiaKey(nextItem);
      const hasDuplicate = prev.some((d) => normalizeDiaKey(d) === key);
      if (hasDuplicate) return prev;
      return [...prev, nextItem];
    });
    setShowDiasBusca(false);
  }

  // ─── Gerar Orçamento ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showGerarModal) return;
    if (!gerarClienteQ || gerarClienteQ.length < 2) {
      setGerarClienteResults([]);
      return;
    }
    if (clienteSearchTimeout.current) clearTimeout(clienteSearchTimeout.current);
    clienteSearchTimeout.current = setTimeout(async () => {
      setGerarClienteLoading(true);
      try {
        const res = await fetch(`/api/v1/orcamentos/clientes`);
        if (!res.ok) return;
        const data: Cliente[] = await res.json();
        const q = gerarClienteQ.toLowerCase();
        setGerarClienteResults(data.filter((c) => c.nome.toLowerCase().includes(q)).slice(0, 8));
      } finally {
        setGerarClienteLoading(false);
      }
    }, 300);
  }, [gerarClienteQ, showGerarModal]);

  async function handleGerarOrcamento() {
    const clientName = gerarClienteSel?.nome || gerarClienteNome.trim();
    if (!clientName) { alert("Informe o nome do cliente."); return; }
    if (!currentId) { alert("Salve o roteiro primeiro antes de gerar o orçamento."); return; }
    setGerarLoading(true);
    try {
      const res = await fetch("/api/v1/roteiros/gerar-orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roteiro_id: currentId,
          client_id: gerarClienteSel?.id || null,
          client_name: clientName,
          client_whatsapp: gerarClienteSel?.whatsapp || null,
          client_email: gerarClienteSel?.email || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.location.href = `/orcamentos/${data.quote_id}`;
    } catch (err: any) {
      alert(err.message || "Erro ao gerar orçamento.");
      setGerarLoading(false);
    }
  }

  // ─── Totais ───────────────────────────────────────────────────────────────
  const totalPagamento = pagamentos.reduce((s, p) => s + Number(p.valor_total_com_taxas || 0), 0);
  const totalInvestimento = investimentos.reduce((s, i) => s + Number(i.valor_por_pessoa || 0), 0);

  async function handleImportRoteiroFile() {
    if (!importFile) {
      alert("Selecione um arquivo (PDF ou Word .docx).");
      return;
    }

    const shouldReplace =
      !String(informacoesImportantes || "").trim() ||
      window.confirm("Substituir o texto atual de 'Informações Importantes' pelo texto importado?");
    if (!shouldReplace) return;

    try {
      setImportingFile(true);
      const text = await extractPlainTextFromFile(importFile, { maxPages: 12 });
      setInformacoesImportantes(text);
      setAbaAtiva("informacoes");

      if (!String(nome || "").trim()) {
        setNome(String(importFile.name || "Roteiro").replace(/\.[^.]+$/, ""));
      }
    } catch (err: any) {
      alert(err?.message || "Erro ao importar arquivo.");
    } finally {
      setImportingFile(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "0 0 60px" }}>
      <div style={{ padding: "12px 0 0" }}>
        {/* ─── Informações do Roteiro ──────────────────────────────────── */}
        <div style={cardSt}>
          <div className="form-row mobile-stack roteiro-info-row" style={{ gap: 12 }}>
            <div>
              <label style={labelSt}>Nome *</label>
              <input
                style={inputSt}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do roteiro"
              />
            </div>
            <div>
              <label style={labelSt}>Duração (dias)</label>
              <input
                style={inputSt}
                type="number"
                min="1"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Ex: 7"
              />
            </div>
            <div>
              <label style={labelSt}>Cidade / Início</label>
              <AutocompleteInput
                value={inicioCidade}
                onChange={setInicioCidade}
                onBlurSave={(v) => salvarSugestao("cidade", v)}
                suggestions={sugestoes["cidade"] || []}
                placeholder="Ex: São Paulo"
              />
            </div>
            <div>
              <label style={labelSt}>Cidade / Fim</label>
              <AutocompleteInput
                value={fimCidade}
                onChange={setFimCidade}
                onBlurSave={(v) => salvarSugestao("cidade", v)}
                suggestions={sugestoes["cidade"] || []}
                placeholder="Ex: Lisboa"
              />
            </div>
            <div className="mobile-stack-buttons roteiro-info-actions">
              {saveMsg && (
                <span style={{ color: "#16a34a", fontSize: 13, padding: "6px 0" }}>{saveMsg}</span>
              )}
              <button
                onClick={() => (window.location.href = "/orcamentos/personalizados")}
                style={{
                  padding: "7px 16px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handlePreviewPdf}
                disabled={pdfBusy}
                style={{
                  padding: "7px 16px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: pdfBusy ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {previewingPdf ? "Abrindo prévia..." : "Visualizar PDF"}
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "7px 16px",
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>

              <button
                onClick={() => setShowGerarModal(true)}
                style={{
                  padding: "7px 16px",
                  background: "#059669",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Gerar Orçamento
              </button>
            </div>
          </div>

          <div className="form-row mobile-stack" style={{ gap: 12, marginTop: 12, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 360px" }}>
              <label style={labelSt}>Importar roteiro (PDF/Word)</label>
              <input
                style={inputSt}
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleImportRoteiroFile}
                disabled={!importFile || importingFile}
                style={{
                  padding: "7px 16px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: !importFile || importingFile ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {importingFile ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Tab Strip ───────────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid #e5e7eb",
          marginBottom: 16,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch" as any,
        }}>
          {ABAS.map((aba) => (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: abaAtiva === aba.id ? "3px solid #7c3aed" : "3px solid transparent",
                cursor: "pointer",
                fontWeight: abaAtiva === aba.id ? 700 : 500,
                fontSize: 13,
                color: abaAtiva === aba.id ? "#7c3aed" : "#6b7280",
                whiteSpace: "nowrap",
                transition: "color 0.15s, border-color 0.15s",
                marginBottom: -2,
              }}
            >
              {aba.label}
            </button>
          ))}
        </div>

        {/* ─── Aba: Hotéis Sugeridos ───────────────────────────────────── */}
        {abaAtiva === "hoteis" && (
          <div style={cardSt}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Cidade *", "Hotel *", "Data Início", "Data Final", "Noites", "Apto *", "Categoria *", "Regime", ""].map((h) => (
                      <th key={h} style={{ padding: "7px 8px", textAlign: "left", color: "#374151", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hoteis.map((h, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 100 }}
                          value={h.cidade}
                          onChange={(v) => hotelOps.update(i, { cidade: v })}
                          onBlurSave={(v) => salvarSugestao("cidade", v)}
                          suggestions={sugestoes["cidade"] || []}
                          placeholder="Cidade"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 140 }}
                          value={h.hotel}
                          onChange={(v) => hotelOps.update(i, { hotel: v })}
                          onBlurSave={(v) => salvarSugestao("hotel", v)}
                          suggestions={sugestoes["hotel"] || []}
                          placeholder="Hotel"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={hoje}
                          value={h.data_inicio}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const fim = h.data_fim && h.data_fim < v ? v : h.data_fim;
                            hotelOps.update(i, { data_inicio: v, data_fim: fim, noites: calcNoites(v, fim) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={h.data_inicio || hoje}
                          value={h.data_fim}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const bounded = h.data_inicio && v && v < h.data_inicio ? h.data_inicio : v;
                            hotelOps.update(i, { data_fim: bounded, noites: calcNoites(h.data_inicio, bounded) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 50, background: "#f9fafb" }} type="number" value={h.noites} readOnly />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 90 }}
                          value={h.apto}
                          onChange={(v) => hotelOps.update(i, { apto: v })}
                          onBlurSave={(v) => salvarSugestao("apto", v)}
                          suggestions={sugestoes["apto"] || []}
                          placeholder="Apto"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 100 }}
                          value={h.categoria}
                          onChange={(v) => hotelOps.update(i, { categoria: v })}
                          onBlurSave={(v) => salvarSugestao("categoria", v)}
                          suggestions={sugestoes["categoria"] || []}
                          placeholder="Categoria"
                        />
                      </td>
                      <td style={tdSt}>
                        <select style={{ ...inputSt, width: 120 }} value={h.regime} onChange={(e) => hotelOps.update(i, { regime: e.target.value })}>
                          <option value="">—</option>
                          <option>Café da Manhã</option>
                          <option>Meia Pensão</option>
                          <option>Pensão Completa</option>
                          <option>All Inclusive</option>
                          <option>Sem Refeição</option>
                        </select>
                      </td>
                      <RowActions
                        onAdd={() => hotelOps.add(i)}
                        onDelete={() => hotelOps.remove(i)}
                        onUp={() => hotelOps.moveUp(i)}
                        onDown={() => hotelOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {hoteis.length === 0 && (
                <button onClick={() => setHoteis([newHotel(0)])} style={{ marginTop: 8, ...actionBtnSt }}>+ Adicionar hotel</button>
              )}
            </div>
          </div>
        )}

        {/* ─── Aba: Passeios Principais ────────────────────────────────── */}
        {abaAtiva === "passeios" && (
          <div style={cardSt}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Cidade *", "Passeio *", "Data Início", "Data Final", "Tipo", "Ingressos", ""].map((h) => (
                      <th key={h} style={{ padding: "7px 8px", textAlign: "left", color: "#374151", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {passeios.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 100 }}
                          value={p.cidade}
                          onChange={(v) => passeioOps.update(i, { cidade: v })}
                          onBlurSave={(v) => salvarSugestao("cidade", v)}
                          suggestions={sugestoes["cidade"] || []}
                          placeholder="Cidade"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 150 }}
                          value={p.passeio}
                          onChange={(v) => passeioOps.update(i, { passeio: v })}
                          onBlurSave={(v) => salvarSugestao("passeio", v)}
                          suggestions={sugestoes["passeio"] || []}
                          placeholder="Nome do passeio"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={hoje}
                          value={p.data_inicio}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const fim = p.data_fim && p.data_fim < v ? v : p.data_fim;
                            passeioOps.update(i, { data_inicio: v, data_fim: fim });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={p.data_inicio || hoje}
                          value={p.data_fim}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const bounded = p.data_inicio && v && v < p.data_inicio ? p.data_inicio : v;
                            passeioOps.update(i, { data_fim: bounded });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <select style={{ ...inputSt, width: 130 }} value={p.tipo} onChange={(e) => passeioOps.update(i, { tipo: e.target.value })}>
                          <option>Compartilhado</option>
                          <option>Privativo</option>
                        </select>
                      </td>
                      <td style={tdSt}>
                        <select style={{ ...inputSt, width: 150 }} value={p.ingressos} onChange={(e) => passeioOps.update(i, { ingressos: e.target.value })}>
                          <option>Inclui Ingressos</option>
                          <option>NÃO INCLUI</option>
                        </select>
                      </td>
                      <RowActions
                        onAdd={() => passeioOps.add(i)}
                        onDelete={() => passeioOps.remove(i)}
                        onUp={() => passeioOps.moveUp(i)}
                        onDown={() => passeioOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {passeios.length === 0 && (
                <button onClick={() => setPasseios([newPasseio(0)])} style={{ marginTop: 8, ...actionBtnSt }}>+ Adicionar passeio</button>
              )}
            </div>
          </div>
        )}

        {/* ─── Aba: Transporte Incluído ────────────────────────────────── */}
        {abaAtiva === "transporte" && (
          <div style={cardSt}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Tipo *", "Fornecedor *", "Descrição *", "Data Início", "Data Final", "Categoria *", "Observação", ""].map((h) => (
                      <th key={h} style={{ padding: "7px 8px", textAlign: "left", color: "#374151", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transportes.map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 100 }}
                          value={t.tipo}
                          onChange={(v) => transporteOps.update(i, { tipo: v })}
                          onBlurSave={(v) => salvarSugestao("transporte_tipo", v)}
                          suggestions={sugestoes["transporte_tipo"] || []}
                          placeholder="Ônibus, Trem..."
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 120 }}
                          value={t.fornecedor}
                          onChange={(v) => transporteOps.update(i, { fornecedor: v })}
                          onBlurSave={(v) => salvarSugestao("fornecedor", v)}
                          suggestions={sugestoes["fornecedor"] || []}
                          placeholder="Fornecedor"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 150 }}
                          value={t.descricao}
                          onChange={(v) => transporteOps.update(i, { descricao: v })}
                          onBlurSave={(v) => salvarSugestao("transporte_desc", v)}
                          suggestions={sugestoes["transporte_desc"] || []}
                          placeholder="Descrição"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={hoje}
                          value={t.data_inicio}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const fim = t.data_fim && t.data_fim < v ? v : t.data_fim;
                            transporteOps.update(i, { data_inicio: v, data_fim: fim });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={t.data_inicio || hoje}
                          value={t.data_fim}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const bounded = t.data_inicio && v && v < t.data_inicio ? t.data_inicio : v;
                            transporteOps.update(i, { data_fim: bounded });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 100 }}
                          value={t.categoria}
                          onChange={(v) => transporteOps.update(i, { categoria: v })}
                          onBlurSave={(v) => salvarSugestao("transporte_cat", v)}
                          suggestions={sugestoes["transporte_cat"] || []}
                          placeholder="Categoria"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          value={t.observacao}
                          onChange={(e) => transporteOps.update(i, { observacao: e.target.value })}
                          placeholder="Obs."
                        />
                      </td>
                      <RowActions
                        onAdd={() => transporteOps.add(i)}
                        onDelete={() => transporteOps.remove(i)}
                        onUp={() => transporteOps.moveUp(i)}
                        onDown={() => transporteOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {transportes.length === 0 && (
                <button onClick={() => setTransportes([newTransporte(0)])} style={{ marginTop: 8, ...actionBtnSt }}>+ Adicionar transporte</button>
              )}
            </div>
          </div>
        )}

        {/* ─── Aba: Itinerário Detalhado ───────────────────────────────── */}
        {abaAtiva === "itinerario" && (
          <div style={cardSt}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {dias.length} dia(s) cadastrado(s)
              </div>
              <button
                onClick={() => setShowDiasBusca(true)}
                style={{ fontSize: 12, fontWeight: 500, padding: "6px 12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
              >
                🔍 Buscar no banco
              </button>
            </div>
            {dias.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start", flexWrap: "wrap", padding: "8px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                <div>
                  <label style={{ ...labelSt, marginBottom: 2 }}>Data</label>
                  <input
                    style={{ ...inputSt, width: 130 }}
                    type="date"
                    value={d.data}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => diaOps.update(i, { data: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ ...labelSt, marginBottom: 2 }}>Percurso</label>
                  <input
                    style={{ ...inputSt, width: 180 }}
                    value={d.percurso}
                    onChange={(e) => diaOps.update(i, { percurso: e.target.value })}
                    placeholder="Ex: Roma - Veneza"
                  />
                </div>
                <div>
                  <label style={{ ...labelSt, marginBottom: 2 }}>Cidade/Pernoite</label>
                  <AutocompleteInput
                    style={{ ...inputSt, width: 130 }}
                    value={d.cidade}
                    onChange={(v) => diaOps.update(i, { cidade: v })}
                    onBlurSave={(v) => salvarSugestao("cidade", v)}
                    suggestions={sugestoes["cidade"] || []}
                    placeholder="Cidade"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={{ ...labelSt, marginBottom: 2 }}>Descrição do dia</label>
                  <textarea
                    style={{ ...inputSt, minHeight: 60, resize: "vertical" }}
                    value={d.descricao}
                    onChange={(e) => diaOps.update(i, { descricao: e.target.value })}
                    placeholder="Descrição detalhada do dia..."
                  />
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0, paddingTop: 20 }}>
                  <button onClick={() => diaOps.moveUp(i)} style={actionBtnSt} title="Subir">▲</button>
                  <button onClick={() => diaOps.moveDown(i)} style={actionBtnSt} title="Descer">▼</button>
                  <button onClick={() => diaOps.add(i)} style={actionBtnSt} title="Adicionar">+</button>
                  <button onClick={() => diaOps.remove(i)} style={{ ...actionBtnSt, color: "#dc2626" }} title="Excluir">🗑</button>
                </div>
              </div>
            ))}
            {dias.length === 0 && (
              <button onClick={() => setDias([newDia(0)])} style={actionBtnSt}>+ Adicionar dia</button>
            )}
          </div>
        )}

        {/* ─── Aba: Investimento ───────────────────────────────────────── */}
        {abaAtiva === "investimento" && (
          <div style={cardSt}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Tipo *", "Valor por Pessoa (R$)", "Qte Pax", "Valor por Apto (R$)", ""].map((h) => (
                      <th key={h} style={{ padding: "7px 8px", textAlign: "left", color: "#374151", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {investimentos.map((inv, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 160 }}
                          value={inv.tipo}
                          onChange={(v) => investimentoOps.update(i, { tipo: v })}
                          onBlurSave={(v) => salvarSugestao("investimento_tipo", v)}
                          suggestions={sugestoes["investimento_tipo"] || []}
                          placeholder="Ex: Pacote Completo"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 140 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={inv.valor_por_pessoa}
                          onChange={(e) => {
                            const vpp = Number(e.target.value);
                            investimentoOps.update(i, { valor_por_pessoa: vpp, valor_por_apto: calcVpa(vpp, inv.qtd_apto) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={inv.qtd_apto}
                          onChange={(e) => {
                            const qtd = Number(e.target.value);
                            investimentoOps.update(i, { qtd_apto: qtd, valor_por_apto: calcVpa(inv.valor_por_pessoa, qtd) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 140, background: "#f9fafb" }} type="number" value={inv.valor_por_apto} readOnly />
                      </td>
                      <RowActions
                        onAdd={() => investimentoOps.add(i)}
                        onDelete={() => investimentoOps.remove(i)}
                        onUp={() => investimentoOps.moveUp(i)}
                        onDown={() => investimentoOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {investimentos.length === 0 && (
                <button onClick={() => setInvestimentos([newInvestimento(0)])} style={{ marginTop: 8, ...actionBtnSt }}>+ Adicionar investimento</button>
              )}
            </div>
            {investimentos.length > 0 && (
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: "#7c3aed", marginTop: 12 }}>
                Total por pessoa: R$ {totalInvestimento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            )}
          </div>
        )}

        {/* ─── Aba: Formas de Pagamento ────────────────────────────────── */}
        {abaAtiva === "pagamento" && (
          <div style={cardSt}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Serviço", "Valor Total c/Taxas (R$)", "Taxas (R$)", "Forma de Pagamento *", ""].map((h) => (
                      <th key={h} style={{ padding: "7px 8px", textAlign: "left", color: "#374151", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 180 }}
                          list={`servico-opts-${i}`}
                          value={p.servico}
                          onChange={(e) => pagamentoOps.update(i, { servico: e.target.value })}
                          placeholder="Serviço"
                        />
                        <datalist id={`servico-opts-${i}`}>
                          <option>Pacote Completo</option>
                          <option>Passagem Aérea</option>
                          <option>Hospedagem</option>
                          <option>Ingressos</option>
                          <option>Transporte</option>
                          <option>Passeios</option>
                          <option>Seguro Viagem</option>
                          <option>Demais Serviços</option>
                        </datalist>
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 150 }} type="number" min="0" step="0.01" value={p.valor_total_com_taxas} onChange={(e) => pagamentoOps.update(i, { valor_total_com_taxas: Number(e.target.value) })} />
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 120 }} type="number" min="0" step="0.01" value={p.taxas} onChange={(e) => pagamentoOps.update(i, { taxas: Number(e.target.value) })} />
                      </td>
                      <td style={tdSt}>
                        <textarea
                          style={{ ...inputSt, width: 220, minHeight: 58, resize: "vertical" }}
                          value={p.forma_pagamento}
                          onChange={(e) => pagamentoOps.update(i, { forma_pagamento: e.target.value })}
                          onBlur={(e) => {
                            const lines = String(e.target.value || "")
                              .replace(/\r/g, "\n")
                              .split("\n")
                              .map((l) => l.trim())
                              .filter(Boolean);
                            for (const line of lines) {
                              salvarSugestao("forma_pagamento", line);
                            }
                          }}
                          placeholder="Ex:\n• PIX\n• Cartão (em até 10x)\n• Boleto"
                        />
                      </td>
                      <RowActions
                        onAdd={() => pagamentoOps.add(i)}
                        onDelete={() => pagamentoOps.remove(i)}
                        onUp={() => pagamentoOps.moveUp(i)}
                        onDown={() => pagamentoOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {pagamentos.length === 0 && (
                <button onClick={() => setPagamentos([newPagamento(0)])} style={{ marginTop: 8, ...actionBtnSt }}>+ Adicionar pagamento</button>
              )}
            </div>
            {pagamentos.length > 0 && (
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 14, color: "#059669", marginTop: 12 }}>
                Total: R$ {totalPagamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            )}
          </div>
        )}

        {/* ─── Aba: Incluído / Não Incluído ───────────────────────────── */}
        {abaAtiva === "inclusoes" && (
          <div style={cardSt}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 700, color: "#111827", fontSize: 13, marginBottom: 6 }}>
                  O que ESTÁ incluído
                </div>
                <textarea
                  style={{ ...inputSt, width: "100%", minHeight: 140, resize: "vertical" }}
                  value={incluiTexto}
                  onChange={(e) => setIncluiTexto(e.target.value)}
                  placeholder="Escreva aqui o texto do que está incluído (um item por linha; ENTER cria um novo marcador)."
                />
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Esse texto é puxado para o PDF na seção “O que ESTÁ incluído”.
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, color: "#111827", fontSize: 13, marginBottom: 6 }}>
                  O que NÃO está incluído
                </div>
                <textarea
                  style={{ ...inputSt, width: "100%", minHeight: 140, resize: "vertical" }}
                  value={naoIncluiTexto}
                  onChange={(e) => setNaoIncluiTexto(e.target.value)}
                  placeholder="Escreva aqui o texto do que não está incluído (um item por linha; ENTER cria um novo marcador)."
                />
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Esse texto é puxado para o PDF na seção “O que NÃO está incluído”.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Aba: Informações Importantes ──────────────────────────── */}
        {abaAtiva === "informacoes" && (
          <div style={cardSt}>
            <div>
              <div style={{ fontWeight: 700, color: "#111827", fontSize: 13, marginBottom: 6 }}>
                Informações Importantes
              </div>
              <textarea
                style={{ ...inputSt, width: "100%", minHeight: 180, resize: "vertical" }}
                value={informacoesImportantes}
                onChange={(e) => setInformacoesImportantes(e.target.value)}
                placeholder="Escreva aqui as informações importantes (um item por linha; ENTER cria um novo marcador)."
              />
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                Esse texto é puxado para o PDF e para a visualização HTML na seção “Informações Importantes”.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal Busca Dias ────────────────────────────────────────────── */}
      {showDiasBusca && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowDiasBusca(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 560, width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Buscar dias no banco</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input style={{ ...inputSt, flex: 1 }} value={diasBuscaCidade} onChange={(e) => setDiasBuscaCidade(e.target.value)} placeholder="Cidade (opcional)" />
              <input style={{ ...inputSt, flex: 2 }} value={diasBuscaQ} onChange={(e) => setDiasBuscaQ(e.target.value)} placeholder="Buscar por texto..." />
              <button onClick={handleBuscarDias} disabled={diasBuscaLoading} style={{ padding: "6px 14px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, cursor: diasBuscaLoading ? "not-allowed" : "pointer", fontSize: 13 }}>
                {diasBuscaLoading ? "..." : "Buscar"}
              </button>
            </div>
            {diasBuscaResults.length === 0 && (
              <div style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: 24 }}>
                Pesquise para ver resultados
              </div>
            )}
            {diasBuscaResults.map((d) => (
              <div
                key={d.id}
                onClick={() => addDiaBanco(d)}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8, cursor: "pointer" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#f5f3ff")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
              >
                <div style={{ fontWeight: 600, color: "#7c3aed", fontSize: 12, marginBottom: 4 }}>{d.cidade}</div>
                <div style={{ fontSize: 12, color: "#374151" }}>{d.descricao.slice(0, 140)}{d.descricao.length > 140 ? "..." : ""}</div>
              </div>
            ))}
            <button onClick={() => setShowDiasBusca(false)} style={{ marginTop: 12, padding: "7px 16px", background: "#f3f4f6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal Gerar Orçamento ───────────────────────────────────────── */}
      {showGerarModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !gerarLoading && setShowGerarModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 440, width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Gerar Orçamento</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 18 }}>
              Roteiro: <strong>{nome}</strong>
            </div>
            {gerarClienteSel ? (
              <div style={{ padding: "10px 14px", background: "#f5f3ff", borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{gerarClienteSel.nome}</div>
                  {gerarClienteSel.whatsapp && <div style={{ fontSize: 12, color: "#6b7280" }}>{gerarClienteSel.whatsapp}</div>}
                </div>
                <button onClick={() => { setGerarClienteSel(null); setGerarClienteQ(""); setGerarClienteNome(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontSize: 13 }}>Trocar</button>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Cliente</label>
                <input
                  style={{ ...inputSt, marginBottom: 6 }}
                  value={gerarClienteQ}
                  onChange={(e) => { setGerarClienteQ(e.target.value); setGerarClienteNome(e.target.value); }}
                  placeholder="Buscar cliente ou digitar nome..."
                />
                {gerarClienteLoading && <div style={{ fontSize: 12, color: "#6b7280" }}>Buscando...</div>}
                {gerarClienteResults.length > 0 && (
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", marginTop: 4 }}>
                    {gerarClienteResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { setGerarClienteSel(c); setGerarClienteNome(c.nome); setGerarClienteQ(c.nome); setGerarClienteResults([]); }}
                        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#f5f3ff")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
                      >
                        <span style={{ fontWeight: 500 }}>{c.nome}</span>
                        {c.whatsapp && <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 11 }}>{c.whatsapp}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#374151", marginBottom: 4 }}>
                <span>Pagamentos</span>
                <span>{pagamentos.length} item(s)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: "#059669" }}>R$ {totalPagamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowGerarModal(false)} disabled={gerarLoading} style={{ padding: "8px 16px", background: "#f3f4f6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                onClick={handleGerarOrcamento}
                disabled={gerarLoading || (!gerarClienteSel && !gerarClienteNome.trim())}
                style={{ padding: "8px 18px", background: "#059669", color: "#fff", border: "none", borderRadius: 6, cursor: gerarLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14 }}
              >
                {gerarLoading ? "Gerando..." : "Gerar Orçamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
