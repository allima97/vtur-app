import { Dialog } from "../ui/primer/legacyCompat";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  extractContratosFromPdf,
  extractContratosFromText,
  extractPdfText,
  ContratoDraft,
} from "../../lib/vendas/contratoCvcExtractor";
import { extractCruzeiroFromText } from "../../lib/vendas/cruzeiroExtractor";
import { saveContratoImport } from "../../lib/vendas/saveContratoImport";
import { supabase } from "../../lib/supabase";
import { normalizeText } from "../../lib/normalizeText";
import { formatNumberBR } from "../../lib/format";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import TableActions from "../ui/TableActions";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppNoticeDialog from "../ui/primer/AppNoticeDialog";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type CidadeSugestao = {
  id: string;
  nome: string;
  subdivisao_nome?: string | null;
  pais_nome?: string | null;
};

type Produto = {
  id: string;
  nome: string;
  cidade_id: string | null;
  todas_as_cidades?: boolean | null;
};

type ContratoDraftUI = ContratoDraft & {
  aplica_du?: boolean | null;
};

type TipoPacote = {
  id: string;
  nome: string;
  ativo?: boolean | null;
};

function formatCurrency(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const num = Number(value);
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}R$ ${withSep},${decPart}`;
}

function formatMoneyInput(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return formatNumberBR(Number(value), 2);
}

function parseMoneyInput(value: string) {
  if (!value) return null;
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const base = value.includes("T") ? value.split("T")[0] : value;
  if (base.includes("/")) return base;
  const parts = base.split("-");
  if (parts.length !== 3) return base;
  const [year, month, day] = parts;
  if (!year || !month || !day) return base;
  return `${day}/${month}/${year}`;
}

function normalizeCpf(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function formatCpf(value?: string | null) {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return (value || "").trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function parseIsoDate(value?: string | null) {
  const base = (value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const [y, m, d] = base.split("-").map((n) => Number(n));
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function calcAge(birthIso?: string | null, refIso?: string | null) {
  const birth = parseIsoDate(birthIso);
  const ref = parseIsoDate(refIso);
  if (!birth || !ref) return null;
  let age = ref.y - birth.y;
  if (ref.m < birth.m || (ref.m === birth.m && ref.d < birth.d)) age -= 1;
  return age;
}

function formatCidadeLabel(cidade: CidadeSugestao) {
  return cidade.subdivisao_nome ? `${cidade.nome} (${cidade.subdivisao_nome})` : cidade.nome;
}

function sanitizeCidadeSeed(value?: string | null) {
  if (!value) return "";
  let term = value.replace(/\s+/g, " ").trim();
  if (!term) return "";
  term = term.replace(/\s*[-–—]\s*\d+\s*(?:dia|dias|noite|noites)\b.*$/i, "");

  const parts = term
    .split(/\s*(?:\/|,|;|\||→|->)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/\s*(?:\/|-)\s*[a-z]{2}$/i, "").trim())
    .filter(Boolean);

  if (parts.length > 0) return parts[0];
  return term;
}

async function fetchCidadeSuggestions(params: { query: string; limit?: number; signal?: AbortSignal }) {
  const query = String(params.query || "").trim();
  if (query.length < 2) return [] as CidadeSugestao[];
  const qs = new URLSearchParams();
  qs.set("q", query);
  qs.set("limite", String(params.limit ?? 60));
  qs.set("no_cache", "1");
  const response = await fetch(`/api/v1/vendas/cidades-busca?${qs.toString()}`, {
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = (await response.json()) as CidadeSugestao[];
  return Array.isArray(data) ? data : [];
}

function isLocacaoCarroTerm(value?: string | null) {
  const term = normalizeText(value || "");
  if (!term) return false;
  if (term.includes("locacao") || term.includes("locadora")) return true;
  if (term.includes("rent a car") || term.includes("rental car")) return true;
  return term.includes("carro") && term.includes("alug");
}

function isContratoLocacao(contrato?: ContratoDraft | null) {
  if (!contrato) return false;
  return (
    isLocacaoCarroTerm(contrato.produto_principal) ||
    isLocacaoCarroTerm(contrato.produto_tipo) ||
    isLocacaoCarroTerm(contrato.produto_detalhes)
  );
}

function hasTransporteAereo(contrato?: ContratoDraft | null) {
  if (!contrato) return false;
  const texts = [
    contrato.produto_principal,
    contrato.produto_tipo,
    contrato.produto_detalhes,
    contrato.roteiro_reserva?.roteiro?.descricao,
    contrato.roteiro_reserva?.roteiro?.mensagem,
    ...(contrato.roteiro_reserva?.fornecedores || []).flatMap((f) => [
      f.transporte_aereo,
      f.descricao,
      f.servico,
      f.nome,
    ]),
  ];
  const joined = texts.filter(Boolean).join(" ");
  const norm = normalizeText(joined, { trim: true, collapseWhitespace: true });
  return norm.includes("transporte aereo");
}

function isViagemNacional(contrato?: ContratoDraft | null, fallbackPaisNome?: string | null) {
  const destinoPais = contrato?.roteiro_reserva?.destino?.pais;
  const origemPais = contrato?.roteiro_reserva?.origem?.pais;
  const parts = [destinoPais, origemPais, fallbackPaisNome]
    .map((p) => normalizeText(p || "", { trim: true, collapseWhitespace: true }))
    .filter(Boolean);
  if (!parts.length) return false;
  // Heurística simples: considera nacional quando explicitamente Brasil.
  return parts.some((p) => p === "brasil");
}

function getPaxCount(contrato?: ContratoDraft | null) {
  const byList = contrato?.passageiros?.length;
  if (typeof byList === "number" && byList > 0) return byList;
  const byRoteiro = Number(contrato?.roteiro_reserva?.contratante?.passageiros || 0);
  return Number.isFinite(byRoteiro) && byRoteiro > 0 ? byRoteiro : 0;
}

function calcDuDefault(contrato?: ContratoDraft | null) {
  const pax = getPaxCount(contrato);
  if (pax <= 0) return 0;
  return 20 * pax;
}

function extractNavioFromReservaCruzeiroText(text: string) {
  const cleaned = (text || "").replace(/\r/g, "\n").replace(/\u00a0/g, " ");
  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const startIdx = lines.findIndex((line) =>
    normalizeText(line, { trim: true, collapseWhitespace: true }).startsWith("fornecedores")
  );
  let scope = lines;
  if (startIdx >= 0) {
    const endRel = lines.slice(startIdx + 1).findIndex((line) => {
      const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
      return (
        norm.startsWith("dados da reserva") ||
        norm.startsWith("passageiros") ||
        norm.startsWith("orcamento") ||
        norm.startsWith("orçamento") ||
        norm.startsWith("pagamento")
      );
    });
    const endIdx = endRel >= 0 ? startIdx + 1 + endRel : lines.length;
    scope = lines.slice(startIdx, endIdx);
  }

  const scopeText = scope
    .join("\n")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = scopeText.match(/\b\d{5,}\s+([A-Za-zÀ-ÿ0-9 .'-]+?)\s+CAT\b/i);
  const navio = match?.[1]?.replace(/\s+/g, " ").trim() || "";
  const navioNorm = normalizeText(navio, { trim: true, collapseWhitespace: true });
  if (
    navio &&
    navioNorm &&
    /[a-z]/i.test(navio) &&
    navioNorm !== "navio" &&
    !navioNorm.includes("numero") &&
    !navioNorm.includes("acordo") &&
    !navioNorm.includes("categoria") &&
    !navioNorm.includes("servico")
  ) {
    return navio;
  }

  for (const rawLine of scope) {
    const cols = rawLine.includes("|")
      ? rawLine.split("|").map((p) => p.trim()).filter(Boolean)
      : rawLine.split(/(?:\t+|\s{2,})/).map((p) => p.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    const first = cols[0] || "";
    const second = cols[1] || "";
    const firstDigits = first.replace(/\D/g, "");
    if (firstDigits.length >= 5 && /^\d+$/.test(firstDigits) && /[A-Za-zÀ-ÿ]/.test(second)) {
      const secondNorm = normalizeText(second, { trim: true, collapseWhitespace: true });
      if (
        secondNorm &&
        !secondNorm.includes("navio") &&
        !secondNorm.includes("numero") &&
        !secondNorm.includes("acordo")
      ) {
        return second.trim();
      }
    }
  }

  const fallback = scope
    .join("\n")
    .replace(/[|]/g, " ")
    .match(/Navio\s+([A-Za-zÀ-ÿ0-9 .'-]+?)(?=\s+CAT\b|\s+Categoria|\s+Servi|\n|$)/i);
  const fallbackValue = fallback?.[1]?.replace(/\s+/g, " ").trim() || "";
  const fallbackNorm = normalizeText(fallbackValue, { trim: true, collapseWhitespace: true });
  if (
    fallbackValue &&
    fallbackNorm &&
    /[a-z]/i.test(fallbackValue) &&
    fallbackNorm !== "navio" &&
    !fallbackNorm.includes("numero") &&
    !fallbackNorm.includes("acordo") &&
    !fallbackNorm.includes("categoria") &&
    !fallbackNorm.includes("servico")
  ) {
    return fallbackValue;
  }
  return null;
}

function formatLabelValue(value?: string | null) {
  return value && value.trim() ? value : "-";
}

function stripLeadingProdutoCodigo(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/^\s*\d{5,}\s*[-‐‑‒–—―−﹣－]\s*/, "").trim();
  return stripped || trimmed;
}

function getFornecedorProdutoNome(fornecedor: any) {
  const tipo = normalizeText(fornecedor?.tipo_servico || "");
  const categoria = normalizeText(fornecedor?.categoria || "");
  if (tipo.includes("receptivo") || categoria.includes("receptivo")) {
    const base = stripLeadingProdutoCodigo(fornecedor?.servico || fornecedor?.descricao || fornecedor?.nome || null);
    return base || null;
  }
  return fornecedor?.nome || null;
}

export default function VendaContratoImportIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;
  const podeVer = can("Importar Contratos") || can("Vendas");
  const podeCriar = can("Importar Contratos", "create") || can("Vendas", "create");

  const [tipoImportacao, setTipoImportacao] = useState<"cvc" | "roteiro">("cvc");
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [contratos, setContratos] = useState<ContratoDraftUI[]>([]);
  const [contratoFiles, setContratoFiles] = useState<(File | null)[]>([]);
  const [principalIndex, setPrincipalIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 4000 });
  const [duplicadoModal, setDuplicadoModal] = useState<{ mensagem: string } | null>(null);
  const [tipoPacoteModal, setTipoPacoteModal] = useState<{ mensagem: string } | null>(null);
  const isReguaTipoPacote = (valor?: string | null) =>
    normalizeText(valor || "", { trim: true, collapseWhitespace: true }).includes("regua abaixo de 10");

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [errorProdutos, setErrorProdutos] = useState<string | null>(null);
  const [tiposPacote, setTiposPacote] = useState<TipoPacote[]>([]);

  const [buscaCidade, setBuscaCidade] = useState("");
  const [cidadeId, setCidadeId] = useState("");
  const [cidadeNome, setCidadeNome] = useState("");
  const [cidadeSelecionadaLabel, setCidadeSelecionadaLabel] = useState("");
  const [cidadePaisNome, setCidadePaisNome] = useState<string | null>(null);
  const [mostrarSugestoesCidade, setMostrarSugestoesCidade] = useState(false);
  const [resultadosCidade, setResultadosCidade] = useState<CidadeSugestao[]>([]);
  const [buscandoCidade, setBuscandoCidade] = useState(false);
  const [erroCidade, setErroCidade] = useState<string | null>(null);
  const [dataVenda, setDataVenda] = useState(() => new Date().toISOString().split("T")[0]);
  const [cidadeManual, setCidadeManual] = useState(false);
  const [cidadeAutoIndefinida, setCidadeAutoIndefinida] = useState(false);
  const [loadingCidadeIndefinida, setLoadingCidadeIndefinida] = useState(false);

  const [buscaDestino, setBuscaDestino] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [destinoManual, setDestinoManual] = useState(false);
  const [incluirMaisRecibos, setIncluirMaisRecibos] = useState(false);
  const isRoteiro = tipoImportacao === "roteiro";
  const [roteiroAvisoAberto, setRoteiroAvisoAberto] = useState(false);
  const [cpfInputIndex, setCpfInputIndex] = useState<number | null>(null);
  const [cvcModalOpen, setCvcModalOpen] = useState(tipoImportacao === "cvc");

  const tiposPacoteMap = useMemo(() => {
    const map = new Map<string, string>();
    tiposPacote.forEach((tipo) => {
      const key = normalizeText(tipo.nome || "", { trim: true, collapseWhitespace: true });
      if (key) map.set(key, tipo.nome);
    });
    return map;
  }, [tiposPacote]);

  useEffect(() => {
    if (tipoImportacao === "roteiro") {
      setRoteiroAvisoAberto(true);
      return;
    }
    setRoteiroAvisoAberto(false);
  }, [tipoImportacao]);

  useEffect(() => {
    if (tipoImportacao === "cvc") {
      setCvcModalOpen(true);
    } else {
      setCvcModalOpen(false);
    }
  }, [tipoImportacao]);

  function updateContratoField(index: number, patch: Partial<ContratoDraftUI>) {
    setContratos((prev) =>
      prev.map((c, idx) => (idx === index ? { ...c, ...patch } : c))
    );
  }

  function updateContratoContratante(
    index: number,
    patch: Partial<ContratoDraft["contratante"]>
  ) {
    setContratos((prev) =>
      prev.map((c, idx) => {
        if (idx !== index) return c;
        const base = c.contratante || { nome: "", cpf: "" };
        return { ...c, contratante: { ...base, ...patch } };
      })
    );
  }

  function updateContratanteAll(patch: Partial<ContratoDraft["contratante"]>) {
    setContratos((prev) =>
      prev.map((c) => {
        const base = c.contratante || { nome: "", cpf: "" };
        return { ...c, contratante: { ...base, ...patch } };
      })
    );
  }

  const destinoSelecionado = useMemo(
    () => produtos.find((p) => p.id === destinoId) || null,
    [produtos, destinoId]
  );

  const destinosFiltrados = useMemo(() => {
    const base = cidadeId
      ? produtos.filter((p) => p.todas_as_cidades || p.cidade_id === cidadeId)
      : produtos.filter((p) => p.todas_as_cidades);
    if (!buscaDestino.trim()) return base;
    const term = normalizeText(buscaDestino);
    return base.filter((p) => normalizeText(p.nome).includes(term));
  }, [produtos, buscaDestino, cidadeId]);

  const destinosDisponiveis = useMemo(() => {
    return cidadeId
      ? produtos.filter((p) => p.todas_as_cidades || p.cidade_id === cidadeId)
      : produtos.filter((p) => p.todas_as_cidades);
  }, [produtos, cidadeId]);

  useEffect(() => {
    if (loadPerm || !podeVer) return;
    let active = true;
    setLoadingProdutos(true);
    setErrorProdutos(null);
    supabase
      .from("produtos")
      .select("id, nome, cidade_id, todas_as_cidades")
      .order("nome")
      .then(({ data, error: produtosError }) => {
        if (!active) return;
        if (produtosError) {
          console.error(produtosError);
          setErrorProdutos("Erro ao carregar destinos.");
          return;
        }
        setProdutos((data as Produto[]) || []);
      })
      .finally(() => {
        if (active) setLoadingProdutos(false);
      });
    return () => {
      active = false;
    };
  }, [loadPerm, podeVer]);

  useEffect(() => {
    if (loadPerm || !podeVer) return;
    let active = true;
    supabase
      .from("tipo_pacotes")
      .select("id, nome, ativo")
      .eq("ativo", true)
      .order("nome")
      .then(({ data, error: pacoteError }) => {
        if (!active) return;
        if (pacoteError) {
          console.error(pacoteError);
          return;
        }
        setTiposPacote((data as TipoPacote[]) || []);
      });
    return () => {
      active = false;
    };
  }, [loadPerm, podeVer]);

  useEffect(() => {
    if (cidadeAutoIndefinida) {
      setResultadosCidade([]);
      setMostrarSugestoesCidade(false);
      return;
    }
    if (buscaCidade.trim().length < 2) {
      setResultadosCidade([]);
      setMostrarSugestoesCidade(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBuscandoCidade(true);
      setErroCidade(null);
      try {
        const data = await fetchCidadeSuggestions({
          query: buscaCidade.trim(),
          limit: 60,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setResultadosCidade(data);
        setErroCidade(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Erro ao buscar cidades via endpoint:", err);
        setErroCidade("Erro ao buscar cidades (API). Tentando fallback...");
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("cidades")
          .select("id, nome")
          .ilike("nome", `%${buscaCidade.trim()}%`)
          .order("nome")
          .limit(60);
        if (controller.signal.aborted) return;
        if (fallbackError) {
          console.error("Erro no fallback de cidades:", fallbackError);
          setErroCidade("Erro ao buscar cidades.");
          setResultadosCidade([]);
        } else {
          setResultadosCidade((fallbackData as CidadeSugestao[]) || []);
          setErroCidade(null);
        }
      } finally {
        if (!controller.signal.aborted) setBuscandoCidade(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [buscaCidade, cidadeAutoIndefinida]);

  useEffect(() => {
    if (!contratos.length) return;
    const principal = contratos[principalIndex] || contratos[0];
    if (!cidadeManual && !cidadeAutoIndefinida) {
      setBuscaCidade(sanitizeCidadeSeed(principal.destino || ""));
      setCidadeId("");
      setCidadeNome("");
      setCidadeSelecionadaLabel("");
      setCidadePaisNome(null);
    }
    if (!destinoManual) {
      const destinoTexto = principal.produto_principal || principal.destino || "";
      setBuscaDestino(destinoTexto);
      const normalizado = normalizeText(destinoTexto);
      const match = produtos.find(
        (p) =>
          normalizeText(p.nome) === normalizado &&
          (cidadeId ? p.todas_as_cidades || p.cidade_id === cidadeId : p.todas_as_cidades)
      );
      setDestinoId(match?.id || "");
    }
  }, [contratos, principalIndex, cidadeManual, destinoManual, produtos, cidadeId, cidadeAutoIndefinida]);

  useEffect(() => {
    if (!contratos.length) {
      setCidadeAutoIndefinida(false);
      return;
    }
    const principal = contratos[principalIndex] || contratos[0];
    const deveAuto = isContratoLocacao(principal);
    if (!deveAuto) {
      if (cidadeAutoIndefinida) {
        setCidadeAutoIndefinida(false);
        if (normalizeText(cidadeNome) === "indefinida") {
          setCidadeId("");
          setCidadeNome("");
          setBuscaCidade("");
          setCidadeSelecionadaLabel("");
          setCidadePaisNome(null);
        }
      }
      return;
    }
    if (cidadeAutoIndefinida && cidadeId && cidadeNome) return;
    setCidadeAutoIndefinida(true);
    setLoadingCidadeIndefinida(true);
    supabase
      .from("cidades")
      .select("id, nome")
      .ilike("nome", "Indefinida")
      .maybeSingle()
      .then(({ data, error: cidadeError }) => {
        if (cidadeError) {
          console.error(cidadeError);
          setErroCidade("Cidade 'Indefinida' não encontrada.");
          return;
        }
        if (!data?.id) {
          setErroCidade("Cidade 'Indefinida' não encontrada.");
          return;
        }
        setCidadeManual(true);
        setErroCidade(null);
        setCidadeId(data.id);
        setCidadeNome(data.nome || "Indefinida");
        setBuscaCidade(data.nome || "Indefinida");
        setCidadeSelecionadaLabel(data.nome || "Indefinida");
        setCidadePaisNome(null);
      })
      .finally(() => setLoadingCidadeIndefinida(false));
  }, [contratos, principalIndex, cidadeAutoIndefinida, cidadeId, cidadeNome]);

  useEffect(() => {
    if (!destinoId) return;
    const prod = produtos.find((p) => p.id === destinoId);
    if (!prod) return;
    if (cidadeId && !prod.todas_as_cidades && prod.cidade_id !== cidadeId) {
      setDestinoId("");
    }
  }, [cidadeId, destinoId, produtos]);

  async function handleExtract() {
    setError(null);
    setStatus(null);
    setExtracting(true);
    try {
      let result;
      const rawText = textInput.trim();
      const hasText = Boolean(rawText);
      const hasFile = Boolean(file);
      let fonteTexto = "";
      if (!hasText && !hasFile) {
        setError("Envie um PDF ou cole o texto do contrato/orçamento.");
        return;
      }
      if (contratos.length > 0 && !incluirMaisRecibos) {
        setError("Ative a opção de incluir mais recibos ou clique em Limpar para recomeçar.");
        return;
      }
      if (hasText) {
        setStatus(hasFile ? "Processando texto (PDF ignorado)..." : "Processando texto...");
        if (isRoteiro) {
          fonteTexto = rawText;
          try {
            result = await extractCruzeiroFromText(rawText);
          } catch (err: any) {
            // fallback: mantém compatibilidade com outros textos "Consulta de Roteiro e Reserva"
            result = await extractContratosFromText(rawText, { forceRoteiro: true });
          }
        } else {
          result = await extractContratosFromText(rawText, { disableRoteiro: true });
        }
      } else {
        setStatus("Processando PDF...");
        if (isRoteiro) {
          const textoPdf = await extractPdfText(file as File, { maxPages: 6 });
          if (!textoPdf.trim()) {
            throw new Error("Não foi possível extrair texto do PDF. Tente colar o texto do contrato.");
          }
          fonteTexto = textoPdf;
          try {
            result = await extractCruzeiroFromText(textoPdf);
          } catch (err: any) {
            // fallback: mantém compatibilidade com outros textos "Consulta de Roteiro e Reserva"
            result = await extractContratosFromText(textoPdf, { forceRoteiro: true });
          }
        } else {
          result = await extractContratosFromPdf(file as File, { disableRoteiro: true });
        }
      }
      if (!result.contratos.length) {
        setError("Nenhum contrato identificado.");
        return;
      }
      let novosContratos = result.contratos;
      if (isRoteiro) {
        const navio = extractNavioFromReservaCruzeiroText(fonteTexto || rawText);
        novosContratos = novosContratos.map((contrato) => ({
          ...contrato,
          produto_principal: navio || contrato.produto_principal,
          tipo_pacote: "Cruzeiro",
        }));
      }
      if (tiposPacoteMap.size > 0) {
        novosContratos = novosContratos.map((contrato) => {
          const key = normalizeText(contrato.tipo_pacote || "", { trim: true, collapseWhitespace: true });
          const match = key ? tiposPacoteMap.get(key) : null;
          if (!match) return contrato;
          return { ...contrato, tipo_pacote: match };
        });
      }
      const arquivosNovos = novosContratos.map(() => (hasFile ? file : null));
      if (contratos.length > 0) {
        setContratos((prev) => [...prev, ...novosContratos]);
        setContratoFiles((prev) => [...prev, ...arquivosNovos]);
        setStatus(
          `Contratos adicionados: ${novosContratos.length}. Total: ${contratos.length + novosContratos.length}`
        );
      } else {
        setContratos(novosContratos);
        setContratoFiles(arquivosNovos);
        setPrincipalIndex(0);
        setCidadeManual(false);
        setDestinoManual(false);
        setCidadeAutoIndefinida(false);
        setLoadingCidadeIndefinida(false);
        setBuscaCidade("");
        setCidadeId("");
        setCidadeNome("");
        setCidadeSelecionadaLabel("");
        setBuscaDestino("");
        setDestinoId("");
        setStatus(`Contratos encontrados: ${novosContratos.length}`);
      }
      setFile(null);
      setTextInput("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (e: any) {
      setError(e?.message || "Erro ao extrair contratos.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!podeCriar) return;
    if (!contratos.length) {
      setError("Nenhum contrato para salvar.");
      return;
    }
    if (!cidadeId) {
      const msg = cidadeAutoIndefinida
        ? "Cidade 'Indefinida' não encontrada."
        : "Confirme a cidade de destino antes de salvar.";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    const destinoTexto = destinoId
      ? destinoSelecionado?.nome || buscaDestino.trim()
      : buscaDestino.trim();
    if (!destinoTexto) {
      const msg = "Confirme o destino antes de salvar.";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    if (destinoSelecionado && cidadeId && !destinoSelecionado.todas_as_cidades) {
      const cidadeOk = destinoSelecionado.cidade_id === cidadeId;
      if (!cidadeOk) {
        const msg = "O destino selecionado não pertence à cidade escolhida.";
        setError(msg);
        showToast(msg, "error");
        return;
      }
    }
    const contratoSemCpfIndex = contratos.findIndex(
      (contrato) => !(contrato.contratante?.cpf || "").trim()
    );
    if (contratoSemCpfIndex >= 0) {
      const msg = "Informe o CPF do contratante antes de salvar a venda.";
      setCpfInputIndex(contratoSemCpfIndex);
      setError(msg);
      showToast(msg, "error");
      return;
    }
    if (!dataVenda) {
      const msg = "Informe a data da venda (Systur).";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    const contratoSemTipoPacote = contratos.findIndex((contrato) => !normalizeText(contrato.tipo_pacote || ""));
    if (contratoSemTipoPacote >= 0) {
      setTipoPacoteModal({
        mensagem: "É obrigatório a escolha de um tipo de pacote.",
      });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const contratosSanitizados = contratos.map((contrato) => {
        const nacional = isViagemNacional(contrato, cidadePaisNome);
        const aplicar = nacional && Boolean((contrato as any).aplica_du);
        const duAtual = Number((contrato as any).taxa_du || 0);
        const taxa_du = aplicar ? (duAtual > 0 ? duAtual : calcDuDefault(contrato) || null) : null;
        const { aplica_du, ...rest } = contrato as any;
        return { ...rest, taxa_du } as ContratoDraft;
      });
      const result = await saveContratoImport({
        contratos: contratosSanitizados,
        principalIndex,
        file,
        contratoFiles,
        destinoCidadeId: cidadeId,
        destinoCidadeNome: cidadeNome || null,
        destinoProdutoId: destinoId || null,
        destinoProdutoNome: destinoTexto || null,
        dataVenda,
      });
      showToast("Venda criada com sucesso.", "success");
      if (typeof window !== "undefined") {
        window.location.href = `/vendas/consulta?id=${result.venda_id}`;
      }
    } catch (e: any) {
      const code = String(e?.code || e?.message || "");
      if (code === "RECIBO_DUPLICADO" || code === "RESERVA_DUPLICADA") {
        const alvo = code === "RECIBO_DUPLICADO" ? "Recibo" : "Reserva";
        setDuplicadoModal({
          mensagem: `${alvo} já foi cadastrado no sistema. Só é possível cadastrar ${alvo.toLowerCase()}s novos.`,
        });
      } else {
        const message = e?.message || "Erro ao salvar venda.";
        setError(message);
        showToast(message, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancelarImportacao() {
    if (typeof window !== "undefined") {
      window.location.href = "/vendas/consulta";
    }
  }

  async function handlePreviewPdf() {
    if (!file) {
      setPreviewError("Selecione um PDF para visualizar.");
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    setPreviewText("");
    try {
      const text = await extractPdfText(file, { maxPages: isRoteiro ? 6 : 4 });
      setPreviewText(text);
      setPreviewOpen(true);
      if (!text.trim()) {
        setPreviewError("Nenhum texto foi extraido do PDF.");
      }
    } catch (e: any) {
      setPreviewError(e?.message || "Erro ao extrair texto do PDF.");
    } finally {
      setPreviewing(false);
    }
  }

  function handleCidadeInput(value: string) {
    if (cidadeAutoIndefinida) return;
    setCidadeManual(true);
    setBuscaCidade(value);
    const valorNormalizado = normalizeText(value);
    const selecionadaNormalizada = normalizeText(cidadeSelecionadaLabel);
    const mantemCidade =
      !!cidadeId &&
      (valorNormalizado === selecionadaNormalizada ||
        valorNormalizado.startsWith(selecionadaNormalizada));
    if (!mantemCidade) {
      setCidadeId("");
      setCidadeNome("");
      setCidadePaisNome(null);
    }
    setMostrarSugestoesCidade(true);
  }

  function handleDestinoInput(value: string) {
    setDestinoManual(true);
    setBuscaDestino(value);
    if (destinoId) {
      const nomeSelecionado = destinoSelecionado?.nome || "";
      if (normalizeText(nomeSelecionado) !== normalizeText(value)) {
        setDestinoId("");
      }
    }
  }

  const principalContrato = contratos[principalIndex] || contratos[0] || null;
  const totalPassageiros = useMemo(
    () => contratos.reduce((acc, contrato) => acc + ((contrato.passageiros || []).length || 0), 0),
    [contratos]
  );
  const contratosSemCpf = useMemo(
    () => contratos.filter((contrato) => !(contrato.contratante?.cpf || "").trim()).length,
    [contratos]
  );
  const resumoImportacao = tipoImportacao === "roteiro" ? "Reserva de Cruzeiro" : "Contrato CVC";

  function resetImportacao() {
    setFile(null);
    setTextInput("");
    setContratos([]);
    setContratoFiles([]);
    setPrincipalIndex(0);
    setStatus(null);
    setError(null);
    setPreviewError(null);
    setPreviewOpen(false);
    setPreviewText("");
    setBuscaCidade("");
    setCidadeId("");
    setCidadeNome("");
    setCidadeSelecionadaLabel("");
    setMostrarSugestoesCidade(false);
    setResultadosCidade([]);
    setErroCidade(null);
    setBuscaDestino("");
    setDestinoId("");
    setCidadeManual(false);
    setDestinoManual(false);
    setCidadeAutoIndefinida(false);
    setLoadingCidadeIndefinida(false);
    setIncluirMaisRecibos(false);
    setCpfInputIndex(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  if (loadPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Acesso negado ao módulo de importação.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap">
        <AppToolbar
          className="mb-3"
          sticky
          tone="config"
          title="Importação de contratos"
          subtitle={`Fluxo de ${resumoImportacao} com revisão comercial antes da criação da venda.`}
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton type="button" variant="secondary" onClick={resetImportacao} disabled={extracting}>
                Limpar importação
              </AppButton>
              <AppButton type="button" variant="ghost" onClick={handleCancelarImportacao} disabled={saving}>
                Cancelar
              </AppButton>
            </div>
          }
        >
          <div className="vtur-choice-grid">
            <AppButton
              type="button"
              variant={tipoImportacao === "cvc" ? "primary" : "secondary"}
              className="vtur-choice-button"
              onClick={() => setTipoImportacao("cvc")}
              disabled={contratos.length > 0}
            >
              <span className="vtur-choice-button-content">
                <span className="vtur-choice-button-title">Contrato CVC</span>
                <span className="vtur-choice-button-caption">
                  Importação padrão do contrato ou orçamento em PDF/texto.
                </span>
              </span>
            </AppButton>
            <AppButton
              type="button"
              variant={tipoImportacao === "roteiro" ? "primary" : "secondary"}
              className="vtur-choice-button"
              onClick={() => setTipoImportacao("roteiro")}
              disabled={contratos.length > 0}
            >
              <span className="vtur-choice-button-content">
                <span className="vtur-choice-button-title">Reserva de Cruzeiro</span>
                <span className="vtur-choice-button-caption">
                  Leitura otimizada do roteiro e da reserva com passageiros e fornecedores.
                </span>
              </span>
            </AppButton>
          </div>
          {contratos.length > 0 ? (
            <div className="vtur-inline-note">
              Limpe os contratos para trocar o tipo de importação.
            </div>
          ) : null}

          <div className="vtur-quote-summary-grid" style={{ marginTop: 16 }}>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Contratos</span>
              <strong>{contratos.length}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Passageiros</span>
              <strong>{totalPassageiros}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">CPF pendente</span>
              <strong>{contratosSemCpf}</strong>
            </div>
          </div>
        </AppToolbar>

        {status ? (
          <AlertMessage variant="info" className="mb-3">
            {status}
          </AlertMessage>
        ) : null}
        {error ? (
          <AlertMessage variant="error" className="mb-3">
            {error}
          </AlertMessage>
        ) : null}
        {previewError ? (
          <AlertMessage variant="error" className="mb-3">
            {previewError}
          </AlertMessage>
        ) : null}

        <AppCard
          className="mb-3"
          title="Fonte do contrato"
          subtitle="Envie o PDF do contrato/orçamento ou cole o texto bruto para extrair os recibos."
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <div className="vtur-import-upload-stack">
              <label className="form-label">PDF do contrato/orçamento</label>
              <div className="vtur-import-upload-row">
                <input
                  id="contrato-file-input"
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0] || null;
                    setFile(nextFile);
                    if (nextFile) {
                      setTextInput("");
                    }
                  }}
                />
                <label htmlFor="contrato-file-input" className="vtur-import-upload-trigger">
                  Escolher arquivo
                </label>
                <span className="vtur-import-file-name">{file?.name || "Nenhum arquivo selecionado"}</span>
              </div>
              <div className="vtur-form-actions">
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={handleExtract}
                  disabled={extracting || (contratos.length > 0 && !incluirMaisRecibos)}
                >
                  {extracting
                    ? "Extraindo..."
                    : contratos.length > 0 && incluirMaisRecibos
                      ? "Adicionar recibos"
                      : "Extrair"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={handlePreviewPdf}
                  disabled={extracting || previewing || !file}
                >
                  {previewing ? "Abrindo..." : "Pré-visualizar PDF"}
                </AppButton>
              </div>
            </div>

            <AppField
              as="textarea"
              label="Texto do contrato/orçamento"
              rows={10}
              placeholder="Cole aqui o texto do contrato/orçamento"
              value={textInput}
              onChange={(e) => {
                const value = e.target.value;
                setTextInput(value);
                if (value.trim() && file) {
                  setFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }
              }}
            />
          </div>
        </AppCard>

        {contratos.length > 0 ? (
          <div className="vtur-modal-body-stack">
            <AppCard
              title="Contratos identificados"
              subtitle="Revise recibos, defina o principal e ajuste dados comerciais antes de salvar a venda."
            >
              <div className="vtur-import-contract-list">
                {contratos.map((c, idx) => {
                  const hasCpf = Boolean((c.contratante?.cpf || "").trim());
                  const cpfControlsVisible = cpfInputIndex === idx;
                  const passageiros = (c.passageiros || []).filter((p) => (p?.nome || "").trim());
                  const adultos = passageiros.filter((p) => {
                    const age = calcAge(p.nascimento || null, dataVenda);
                    return age != null && age >= 18;
                  });
                  const passageirosContratante = adultos.length ? adultos : passageiros;
                  const selectedContratanteIndex = (() => {
                    if (!passageirosContratante.length) return "";
                    const currentCpf = normalizeCpf(c.contratante?.cpf || "");
                    if (currentCpf) {
                      const found = passageirosContratante.findIndex(
                        (p) => normalizeCpf(p.cpf) === currentCpf
                      );
                      if (found >= 0) return String(found);
                    }
                    const currentNomeNorm = normalizeText(c.contratante?.nome || "", {
                      trim: true,
                      collapseWhitespace: true,
                    });
                    if (currentNomeNorm) {
                      const found = passageirosContratante.findIndex(
                        (p) =>
                          normalizeText(p.nome || "", { trim: true, collapseWhitespace: true }) ===
                          currentNomeNorm
                      );
                      if (found >= 0) return String(found);
                    }
                    return "";
                  })();

                  const contractActions = [
                    {
                      key: `principal-${idx}`,
                      label: principalIndex === idx ? "Principal" : "Definir principal",
                      variant: principalIndex === idx ? "primary" : "light",
                      onClick: () => setPrincipalIndex(idx),
                      disabled: principalIndex === idx,
                    },
                    {
                      key: `cpf-${idx}`,
                      label: cpfControlsVisible ? "Ocultar CPF" : hasCpf ? "Editar CPF" : "Informar CPF",
                      variant: hasCpf ? "ghost" : "primary",
                      onClick: () => setCpfInputIndex(cpfControlsVisible ? null : idx),
                    },
                  ];

                  const tipoPacoteOptions = [
                    { label: "Selecione", value: "" },
                    ...tiposPacote.map((tipo) => ({
                      label: tipo.nome || "",
                      value: tipo.nome || "",
                    })),
                  ];
                  if (
                    c.tipo_pacote &&
                    !tiposPacote.some(
                      (tipo) =>
                        normalizeText(tipo.nome) ===
                        normalizeText(c.tipo_pacote || "", { trim: true, collapseWhitespace: true })
                    )
                  ) {
                    tipoPacoteOptions.push({
                      label: `${c.tipo_pacote} (nao cadastrado)`,
                      value: c.tipo_pacote,
                    });
                  }

                  return (
                    <AppCard
                      key={`${c.contrato_numero}-${idx}`}
                      tone={principalIndex === idx ? "config" : "default"}
                      className="vtur-import-contract-card"
                      title={`Contrato ${c.contrato_numero || "-"}`}
                      subtitle={
                        principalIndex === idx
                          ? "Este recibo define o destino e o contexto principal da venda."
                          : "Recibo complementar vinculado a esta importação."
                      }
                      actions={<TableActions actions={contractActions as any[]} />}
                    >
                      <div className="vtur-import-contract-summary">
                        <div className="vtur-import-contract-summary-item">
                          <span className="vtur-quote-summary-label">Contratante</span>
                          <strong>{c.contratante?.nome || "-"}</strong>
                          <span>{c.contratante?.cpf ? formatCpf(c.contratante.cpf) : "CPF pendente"}</span>
                        </div>
                        <div className="vtur-import-contract-summary-item">
                          <span className="vtur-quote-summary-label">Reserva</span>
                          <strong>{c.reserva_numero || "-"}</strong>
                          <span>{formatDate(c.data_saida)} até {formatDate(c.data_retorno)}</span>
                        </div>
                        <div className="vtur-import-contract-summary-item">
                          <span className="vtur-quote-summary-label">Produto</span>
                          <strong>{c.produto_principal || "-"}</strong>
                          <span>{c.tipo_pacote || "Tipo de pacote pendente"}</span>
                        </div>
                        <div className="vtur-import-contract-summary-item">
                          <span className="vtur-quote-summary-label">Financeiro</span>
                          <strong>{formatCurrency(c.total_bruto)}</strong>
                          <span>Pago {formatCurrency(c.total_pago)}</span>
                        </div>
                      </div>

                      {isRoteiro && idx === principalIndex && passageiros.length >= 2 ? (
                        <div className="vtur-form-grid" style={{ marginTop: 16 }}>
                          <AppField
                            as="select"
                            label="Selecionar contratante (passageiros >= 18 anos)"
                            value={selectedContratanteIndex}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (!value) return;
                              const passenger = passageirosContratante[Number(value)];
                              if (!passenger) return;
                              updateContratanteAll({
                                nome: passenger.nome,
                                cpf: normalizeCpf(passenger.cpf) || "",
                                nascimento: passenger.nascimento || null,
                              });
                              setCpfInputIndex(null);
                            }}
                            options={[
                              { label: "Manter como está", value: "" },
                              ...passageirosContratante.map((p, pIdx) => {
                                const age = calcAge(p.nascimento || null, dataVenda);
                                const cpfDigits = normalizeCpf(p.cpf);
                                const ageLabel = age != null ? `${age} anos` : "idade ?";
                                const cpfLabel =
                                  cpfDigits.length === 11 ? formatCpf(cpfDigits) : "CPF nao informado";
                                return {
                                  label: `${p.nome} - ${ageLabel} - ${cpfLabel}`,
                                  value: String(pIdx),
                                };
                              }),
                            ]}
                          />
                        </div>
                      ) : null}

                      <div className="vtur-inline-note" style={{ marginTop: 16 }}>
                        {hasCpf
                          ? "Atualize o CPF quando necessário."
                          : "CPF do contratante não encontrado. Informe-o antes de concluir a criação da venda."}
                      </div>

                      {cpfControlsVisible ? (
                        <div className="vtur-form-grid" style={{ marginTop: 16 }}>
                          <AppField
                            label="CPF do contratante"
                            type="text"
                            inputMode="numeric"
                            placeholder="000.000.000-00"
                            value={c.contratante?.cpf || ""}
                            onChange={(e) => updateContratoContratante(idx, { cpf: e.target.value })}
                          />
                        </div>
                      ) : null}

                      <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                        <AppField
                          label="Produto (ajuste se necessário)"
                          className="w-full search-input-field"
                          list="listaProdutosImportAll"
                          placeholder={cidadeId ? "Digite ou selecione um produto" : "Digite o produto do recibo"}
                          value={c.produto_principal || ""}
                          onChange={(e) => updateContratoField(idx, { produto_principal: e.target.value })}
                          disabled={loadingProdutos}
                        />
                        <div>
                          <AppField
                            as="select"
                            label="Tipo de pacote"
                            value={c.tipo_pacote || ""}
                            onChange={(e) => updateContratoField(idx, { tipo_pacote: e.target.value })}
                            disabled={isRoteiro || tiposPacote.length === 0}
                            options={tipoPacoteOptions}
                          />
                          {tiposPacote.length === 0 && !isRoteiro ? (
                            <AppField
                              wrapperClassName="mt-2"
                              label="Tipo de pacote manual"
                              placeholder="Ex: Somente Hotel"
                              value={c.tipo_pacote || ""}
                              onChange={(e) => updateContratoField(idx, { tipo_pacote: e.target.value })}
                            />
                          ) : null}
                          {isReguaTipoPacote(c.tipo_pacote) ? (
                            <div className="vtur-inline-feedback">
                              Tipo de pacote em régua especial de comissionamento.
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {(hasTransporteAereo(c) || Number(c.taxa_du || 0) > 0) ? (
                        <AppCard
                          className="vtur-sales-embedded-card"
                          tone="info"
                          title="DU comissionada"
                          subtitle="Informe o valor embutido nas taxas quando a viagem permitir comissão sobre DU."
                        >
                          {isViagemNacional(c, cidadePaisNome) ? (
                            <div className="vtur-sales-principal-toggle">
                              <span>Aplicar DU automática?</span>
                              <AppButton
                                type="button"
                                variant={c.aplica_du ? "primary" : "secondary"}
                                onClick={() => {
                                  const next = !Boolean(c.aplica_du);
                                  if (next) {
                                    const duAtual = Number(c.taxa_du || 0);
                                    const duDefault = calcDuDefault(c);
                                    updateContratoField(idx, {
                                      aplica_du: true,
                                      taxa_du: duAtual > 0 ? duAtual : duDefault > 0 ? duDefault : null,
                                    });
                                  } else {
                                    updateContratoField(idx, { aplica_du: false, taxa_du: null });
                                  }
                                }}
                              >
                                {c.aplica_du ? "SIM" : "NAO"}
                              </AppButton>
                            </div>
                          ) : null}
                          <div className="vtur-form-grid" style={{ marginTop: 12 }}>
                            <AppField
                              label="Valor da DU"
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9,.]*"
                              placeholder="20,00"
                              value={formatMoneyInput(c.taxa_du ?? null)}
                              onChange={(e) => updateContratoField(idx, { taxa_du: parseMoneyInput(e.target.value) })}
                              disabled={!isViagemNacional(c, cidadePaisNome) ? true : !c.aplica_du}
                              caption="DU padrão: R$ 20,00 por passageiro (apenas Brasil)."
                            />
                          </div>
                        </AppCard>
                      ) : null}

                      {c.roteiro_reserva ? (
                        <div style={{ marginTop: 16 }}>
                          <details className="vtur-import-accordion">
                            <summary>Reserva de Cruzeiro</summary>
                            <div className="vtur-import-accordion-grid">
                              <div className="vtur-import-accordion-box">
                                <strong>Contratante</strong>
                                <div>Nome: {formatLabelValue(c.roteiro_reserva.contratante?.nome || null)}</div>
                                <div>Recibo: {formatLabelValue(c.roteiro_reserva.contratante?.recibo || null)}</div>
                                <div>Valor: {formatCurrency(c.roteiro_reserva.contratante?.valor || null)}</div>
                                <div>Taxa embarque: {formatCurrency(c.roteiro_reserva.contratante?.taxa_embarque || null)}</div>
                                <div>Taxa DU: {formatCurrency(c.roteiro_reserva.contratante?.taxa_du || null)}</div>
                              </div>
                              <div className="vtur-import-accordion-box">
                                <strong>Roteiro</strong>
                                <div>Descrição: {formatLabelValue(c.roteiro_reserva.roteiro?.descricao || null)}</div>
                                <div>Tipo de produto: {formatLabelValue(c.roteiro_reserva.roteiro?.tipo_produto || null)}</div>
                                <div>Número do roteiro: {formatLabelValue(c.roteiro_reserva.roteiro?.numero || null)}</div>
                                <div>Roteiro Systur: {formatLabelValue(c.roteiro_reserva.roteiro?.systur || null)}</div>
                                <div>Saída: {formatDate(c.roteiro_reserva.roteiro?.data_saida || null)}</div>
                                <div>Retorno: {formatDate(c.roteiro_reserva.roteiro?.data_retorno || null)}</div>
                                <div>Vendedor: {formatLabelValue(c.roteiro_reserva.roteiro?.vendedor || null)}</div>
                                <div>Office ID: {formatLabelValue(c.roteiro_reserva.roteiro?.office_id || null)}</div>
                                <div>Voo: {formatLabelValue(c.roteiro_reserva.roteiro?.voo || null)}</div>
                                <div>Mensagem: {formatLabelValue(c.roteiro_reserva.roteiro?.mensagem || null)}</div>
                              </div>
                              <div className="vtur-import-accordion-box">
                                <strong>Origem</strong>
                                <div>
                                  {formatLabelValue(c.roteiro_reserva.origem?.pais || null)} /{" "}
                                  {formatLabelValue(c.roteiro_reserva.origem?.estado || null)} /{" "}
                                  {formatLabelValue(c.roteiro_reserva.origem?.cidade || null)}
                                </div>
                              </div>
                              <div className="vtur-import-accordion-box">
                                <strong>Destino</strong>
                                <div>
                                  {formatLabelValue(c.roteiro_reserva.destino?.pais || null)} /{" "}
                                  {formatLabelValue(c.roteiro_reserva.destino?.estado || null)} /{" "}
                                  {formatLabelValue(c.roteiro_reserva.destino?.cidade || null)}
                                </div>
                              </div>
                              <div className="vtur-import-accordion-box">
                                <strong>Dados da Reserva</strong>
                                <div>Filial: {formatLabelValue(c.roteiro_reserva.dados_reserva?.filial || null)}</div>
                                <div>Carrinho ID: {formatLabelValue(c.roteiro_reserva.dados_reserva?.carrinho_id || null)}</div>
                                <div>Tipo de venda: {formatLabelValue(c.roteiro_reserva.dados_reserva?.tipo_venda || null)}</div>
                                <div>Pedido: {formatLabelValue(c.roteiro_reserva.dados_reserva?.pedido || null)}</div>
                                <div>Pedido dinâmico: {formatLabelValue(c.roteiro_reserva.dados_reserva?.pedido_dinamico || null)}</div>
                                <div>Número da reserva: {formatLabelValue(c.roteiro_reserva.dados_reserva?.numero_reserva || null)}</div>
                                <div>Vendedor da reserva: {formatLabelValue(c.roteiro_reserva.dados_reserva?.vendedor_reserva || null)}</div>
                                <div>Data da reserva: {formatLabelValue(c.roteiro_reserva.dados_reserva?.data_reserva || null)}</div>
                                <div>Remarcação: {formatLabelValue(c.roteiro_reserva.dados_reserva?.remarcacao || null)}</div>
                                <div>Validade: {formatLabelValue(c.roteiro_reserva.dados_reserva?.validade_reserva || null)}</div>
                                <div>Tipo de reserva: {formatLabelValue(c.roteiro_reserva.dados_reserva?.tipo_reserva || null)}</div>
                                <div>Tabela: {formatLabelValue(c.roteiro_reserva.dados_reserva?.tabela || null)}</div>
                                <div>Observação: {formatLabelValue(c.roteiro_reserva.dados_reserva?.observacao || null)}</div>
                                <div>Operador online: {formatLabelValue(c.roteiro_reserva.dados_reserva?.operador_online || null)}</div>
                                <div>Tipo de pacote: {formatLabelValue(c.roteiro_reserva.dados_reserva?.tipo_pacote || null)}</div>
                                <div>Desvio loja: {formatLabelValue(c.roteiro_reserva.dados_reserva?.desvio_loja || null)}</div>
                              </div>

                              {c.roteiro_reserva.fornecedores && c.roteiro_reserva.fornecedores.length > 0 ? (
                                <div className="vtur-import-accordion-box">
                                  <strong>Fornecedores</strong>
                                  <div className="vtur-modal-list" style={{ marginTop: 8 }}>
                                    {c.roteiro_reserva.fornecedores.map((f, i) => {
                                      const produtoNome = getFornecedorProdutoNome(f);
                                      const titulo = produtoNome || f.nome || null;
                                      const mostrarFornecedor = Boolean(produtoNome && f.nome && produtoNome !== f.nome);
                                      return (
                                        <div key={`${c.contrato_numero}-for-${i}`} className="vtur-modal-list-item">
                                          <div><strong>{formatLabelValue(titulo)}</strong></div>
                                          {mostrarFornecedor ? (
                                            <div>Fornecedor: {formatLabelValue(f.nome || null)}</div>
                                          ) : null}
                                          <div>Tipo: {formatLabelValue(f.tipo_servico || null)}</div>
                                          <div>Nº acordo: {formatLabelValue(f.numero_acordo || null)}</div>
                                          <div>Cidade: {formatLabelValue(f.cidade || null)}</div>
                                          <div>Categoria: {formatLabelValue(f.categoria || null)}</div>
                                          <div>Serviço: {formatLabelValue(f.servico || null)}</div>
                                          <div>Transporte aéreo: {formatLabelValue(f.transporte_aereo || null)}</div>
                                          <div>Trecho: {formatLabelValue(f.trecho || null)}</div>
                                          <div>Data inicial: {formatDate(f.data_inicial || null)}</div>
                                          <div>Data final: {formatDate(f.data_final || null)}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {c.roteiro_reserva.passageiros && c.roteiro_reserva.passageiros.length > 0 ? (
                                <div className="vtur-import-accordion-box">
                                  <strong>Passageiros</strong>
                                  <div className="vtur-modal-list" style={{ marginTop: 8 }}>
                                    {c.roteiro_reserva.passageiros.map((p, i) => (
                                      <div key={`${c.contrato_numero}-pax-${i}`} className="vtur-modal-list-item">
                                        <div>{formatLabelValue([p.sobrenome, p.nome].filter(Boolean).join(" ") || null)}</div>
                                        <div>Nascimento: {formatDate(p.nascimento || null)}</div>
                                        <div>Sexo: {formatLabelValue(p.sexo || null)}</div>
                                        <div>Idade: {formatLabelValue(p.idade || null)}</div>
                                        <div>Local embarque: {formatLabelValue(p.local_embarque || null)}</div>
                                        <div>Documento: {formatLabelValue(p.documento_numero || null)}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {c.roteiro_reserva.orcamento ? (
                                <div className="vtur-import-accordion-box">
                                  <strong>Orçamento</strong>
                                  <div>Valor total: {formatCurrency(c.roteiro_reserva.orcamento.valor_total || null)}</div>
                                  <div>Férias protegidas: {formatCurrency(c.roteiro_reserva.orcamento.valor_ferias_protegidas || null)}</div>
                                  <div>Forma: {formatLabelValue(c.roteiro_reserva.orcamento.forma_pagamento || null)}</div>
                                  <div>Plano: {formatLabelValue(c.roteiro_reserva.orcamento.plano || null)}</div>
                                </div>
                              ) : null}

                              {c.roteiro_reserva.pagamento ? (
                                <div className="vtur-import-accordion-box">
                                  <strong>Pagamento</strong>
                                  <div>Forma: {formatLabelValue(c.roteiro_reserva.pagamento.forma || null)}</div>
                                  <div>Plano: {formatLabelValue(c.roteiro_reserva.pagamento.plano || null)}</div>
                                  {c.roteiro_reserva.pagamento.parcelas ? (
                                    <div className="vtur-modal-list" style={{ marginTop: 8 }}>
                                      {c.roteiro_reserva.pagamento.parcelas.map((parcela, i) => (
                                        <div key={`${c.contrato_numero}-par-${i}`} className="vtur-modal-list-item">
                                          {parcela.numero} - {formatCurrency(parcela.valor)}{" "}
                                          {parcela.vencimento ? `(${formatDate(parcela.vencimento)})` : ""}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </details>
                        </div>
                      ) : null}

                      {c.pagamentos && c.pagamentos.length > 0 ? (
                        <AppCard
                          className="vtur-sales-embedded-card"
                          title="Pagamentos identificados"
                          subtitle="Resumo dos recebimentos extraídos deste contrato."
                        >
                          <div className="vtur-modal-list">
                            {c.pagamentos.map((p, i) => (
                              <div key={`${c.contrato_numero}-pg-${i}`} className="vtur-modal-list-item">
                                {p.forma} {p.operacao ? `(${p.operacao})` : ""} - {formatCurrency(p.valor_bruto)}
                              </div>
                            ))}
                          </div>
                        </AppCard>
                      ) : null}
                    </AppCard>
                  );
                })}
              </div>
            </AppCard>

            <AppCard
              title="Destino principal da venda"
              subtitle="Confirme cidade, produto e data da venda. Esses dados determinam o contexto comercial salvo."
            >
              <div className="vtur-form-grid vtur-form-grid-3">
                <div className="vtur-city-picker">
                  <AppField
                    label="Cidade"
                    placeholder="Digite o nome da cidade"
                    value={buscaCidade}
                    onChange={(e) => handleCidadeInput(e.target.value)}
                    onFocus={() => setMostrarSugestoesCidade(true)}
                    onBlur={() => setTimeout(() => setMostrarSugestoesCidade(false), 150)}
                    disabled={cidadeAutoIndefinida || loadingCidadeIndefinida}
                    validation={!cidadeId && buscaCidade.trim() ? "Selecione uma cidade na lista para confirmar." : undefined}
                    validationVariant="error"
                  />
                  {mostrarSugestoesCidade && (buscandoCidade || buscaCidade.trim().length >= 2) ? (
                    <div className="vtur-city-dropdown">
                      {buscandoCidade ? (
                        <div className="vtur-city-helper">Buscando cidades...</div>
                      ) : null}
                      {!buscandoCidade && erroCidade ? (
                        <div className="vtur-city-helper error">{erroCidade}</div>
                      ) : null}
                      {!buscandoCidade && !erroCidade && resultadosCidade.length === 0 ? (
                        <div className="vtur-city-helper">Nenhuma cidade encontrada.</div>
                      ) : null}
                      {!buscandoCidade && !erroCidade
                        ? resultadosCidade.map((c) => {
                            const label = formatCidadeLabel(c);
                            return (
                              <AppButton
                                key={c.id}
                                type="button"
                                variant="ghost"
                                className="vtur-city-option"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setCidadeManual(true);
                                  setCidadeId(c.id);
                                  setCidadeNome(c.nome);
                                  setBuscaCidade(label);
                                  setCidadeSelecionadaLabel(label);
                                  setCidadePaisNome(c.pais_nome || null);
                                  setMostrarSugestoesCidade(false);
                                  setResultadosCidade([]);
                                }}
                              >
                                {label}
                                {c.pais_nome ? <span className="vtur-city-helper"> - {c.pais_nome}</span> : null}
                              </AppButton>
                            );
                          })
                        : null}
                    </div>
                  ) : null}
                  {loadingCidadeIndefinida ? (
                    <div className="vtur-city-helper">Definindo cidade automaticamente...</div>
                  ) : null}
                  {cidadeAutoIndefinida && !loadingCidadeIndefinida ? (
                    <div className="vtur-city-helper">Cidade definida automaticamente: Indefinida (locação de carros).</div>
                  ) : null}
                </div>

                <div>
                  <AppField
                    label="Produto"
                    className="w-full search-input-field"
                    list="listaDestinosImport"
                    placeholder={cidadeId ? "Digite ou selecione um produto" : "Selecione a cidade primeiro"}
                    value={buscaDestino}
                    onChange={(e) => handleDestinoInput(e.target.value)}
                    onBlur={() => {
                      const texto = buscaDestino.trim();
                      if (!texto) {
                        setDestinoId("");
                        return;
                      }
                      const achado = destinosFiltrados.find(
                        (p) => normalizeText(p.nome) === normalizeText(texto)
                      );
                      if (achado) {
                        setDestinoId(achado.id);
                        setBuscaDestino(achado.nome);
                      } else {
                        setDestinoId("");
                      }
                    }}
                    disabled={!cidadeId || loadingProdutos}
                  />
                  <datalist id="listaDestinosImport">
                    {destinosFiltrados.map((p) => (
                      <option key={p.id} value={p.nome} />
                    ))}
                  </datalist>
                  <datalist id="listaProdutosImportAll">
                    {destinosDisponiveis.map((p) => (
                      <option key={p.id} value={p.nome} />
                    ))}
                  </datalist>
                  {loadingProdutos ? <div className="vtur-city-helper">Carregando produtos...</div> : null}
                  {errorProdutos ? <div className="vtur-city-helper error">{errorProdutos}</div> : null}
                  {!destinoId && buscaDestino.trim() && cidadeId && !loadingProdutos ? (
                    <div className="vtur-city-helper">Produto será criado automaticamente para a cidade selecionada.</div>
                  ) : null}
                </div>

                <AppField
                  label={
                    <span>
                      Data da Venda *
                      <span
                        title="Informe a data da venda conforme no Systur. Campo importante para emissão de nota fiscal."
                        style={{ marginLeft: 6, color: "#0ea5e9", cursor: "help" }}
                      >
                        ?
                      </span>
                    </span>
                  }
                  type="date"
                  value={dataVenda}
                  onFocus={selectAllInputOnFocus}
                  onChange={(e) => setDataVenda(e.target.value)}
                />
              </div>
            </AppCard>

            <AppCard
              title="Finalização"
              subtitle="Decida se vai anexar novos recibos a esta mesma venda ou concluir a criação agora."
            >
              <div className="vtur-choice-grid">
                <AppButton
                  type="button"
                  variant={!incluirMaisRecibos ? "primary" : "secondary"}
                  className="vtur-choice-button"
                  onClick={() => setIncluirMaisRecibos(false)}
                >
                  <span className="vtur-choice-button-content">
                    <span className="vtur-choice-button-title">Não incluir mais recibos</span>
                    <span className="vtur-choice-button-caption">
                      Finaliza a revisão e libera o salvamento da venda.
                    </span>
                  </span>
                </AppButton>
                <AppButton
                  type="button"
                  variant={incluirMaisRecibos ? "primary" : "secondary"}
                  className="vtur-choice-button"
                  onClick={() => setIncluirMaisRecibos(true)}
                >
                  <span className="vtur-choice-button-content">
                    <span className="vtur-choice-button-title">Adicionar mais recibos</span>
                    <span className="vtur-choice-button-caption">
                      Continue importando outros PDFs/textos antes de salvar a venda consolidada.
                    </span>
                  </span>
                </AppButton>
              </div>
              {incluirMaisRecibos ? (
                <div className="vtur-inline-note">
                  Use os campos acima para importar outro PDF ou colar texto e clique em "Adicionar recibos". Selecione "Não incluir mais recibos" para finalizar.
                </div>
              ) : null}

              <div className="vtur-form-actions">
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving || !podeCriar || incluirMaisRecibos}
                >
                  {saving ? "Salvando..." : "Salvar venda"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={handleCancelarImportacao}
                  disabled={saving}
                >
                  Cancelar
                </AppButton>
              </div>
            </AppCard>
          </div>
        ) : (
          <AppCard tone="info">
            <EmptyState
              title="Nenhum contrato extraído ainda"
              description="Escolha o tipo de importação, envie o arquivo ou cole o texto bruto para iniciar a leitura do contrato."
            />
          </AppCard>
        )}

        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        {previewOpen ? (
          <Dialog
            title="Texto extraído do PDF"
            width="xlarge"
            onClose={() => setPreviewOpen(false)}
            footerButtons={[
              {
                content: "Fechar",
                buttonType: "primary",
                onClick: () => setPreviewOpen(false),
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                tone="info"
                title="Pré-visualização do texto"
                subtitle="Use esta visão para conferir se o PDF está legível antes de extrair os recibos."
              >
                <AppField as="textarea" label="Texto extraído" rows={14} readOnly value={previewText} />
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        <AppNoticeDialog
          open={cvcModalOpen}
          title="ATENÇÃO!"
          icon={<i className="pi pi-exclamation-triangle" aria-hidden="true" />}
          onClose={() => setCvcModalOpen(false)}
          message={
            <div className="vtur-modal-body-stack">
              <p style={{ margin: 0 }}>
                Para que a importação do contrato seja correta e o cálculo das comissões reflita o cenário real,
                informe o tipo de pacote conforme o documento original.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Exemplos:</strong> Fretamento, Terrestre, Ingressos, VHI Plus, Terrestre + Aéreo,
                Somente Hotel, Navio, Chip.
              </p>
              <p style={{ margin: 0 }}>
                Isso determina os produtos com possibilidade de ajuste na régua de comissionamento.
              </p>
            </div>
          }
        />

        <AppNoticeDialog
          open={roteiroAvisoAberto}
          title="ATENÇÃO!"
          icon={<i className="pi pi-exclamation-triangle" aria-hidden="true" />}
          onClose={() => setRoteiroAvisoAberto(false)}
          message={
            <div className="vtur-modal-body-stack">
              <p style={{ margin: 0 }}>
                Esta opção é válida somente para importação de <strong>Reserva de Cruzeiro</strong>.
              </p>
              <p style={{ margin: 0 }}>
                Para que o fluxo funcione corretamente, abra o campo <strong>+ Dados Pessoais</strong> de cada passageiro.
                Caso contrário, o CPF deverá ser informado manualmente.
              </p>
            </div>
          }
        />

        <AppNoticeDialog
          open={Boolean(duplicadoModal)}
          title="ATENÇÃO!"
          icon={<i className="pi pi-exclamation-triangle" aria-hidden="true" />}
          onClose={() => setDuplicadoModal(null)}
          message={duplicadoModal?.mensagem || ""}
        />

        <AppNoticeDialog
          open={Boolean(tipoPacoteModal)}
          title="ATENÇÃO!"
          icon={<i className="pi pi-exclamation-triangle" aria-hidden="true" />}
          onClose={() => setTipoPacoteModal(null)}
          message={tipoPacoteModal?.mensagem || ""}
        />
      </div>
    </AppPrimerProvider>
  );
}
