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
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { AlertTriangle } from "lucide-react";

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
        const { data, error: cidadesError } = await supabase.rpc(
          "buscar_cidades",
          { q: buscaCidade.trim(), limite: 10 },
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          if (cidadesError) {
            console.error("Erro ao buscar cidades:", cidadesError);
            setErroCidade("Erro ao buscar cidades (RPC). Tentando fallback...");
            const { data: fallbackData, error: fallbackError } = await supabase
              .from("cidades")
              .select("id, nome")
              .ilike("nome", `%${buscaCidade.trim()}%`)
              .order("nome");
            if (fallbackError) {
              console.error("Erro no fallback de cidades:", fallbackError);
              setErroCidade("Erro ao buscar cidades.");
            } else {
              setResultadosCidade((fallbackData as CidadeSugestao[]) || []);
              setErroCidade(null);
            }
          } else {
            setResultadosCidade((data as CidadeSugestao[]) || []);
          }
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
      setBuscaCidade(principal.destino || "");
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

  if (loadPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <div className="card-base card-config">
        <strong>Acesso negado ao módulo de importação.</strong>
      </div>
    );
  }

  return (
    <div className="page-content-wrap">
      <div className="card-base mb-3">
        <h3 style={{ marginTop: 0 }}>Importar contrato</h3>
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Tipo de importação</label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tipo-importacao"
                  checked={tipoImportacao === "cvc"}
                  onChange={() => setTipoImportacao("cvc")}
                  disabled={contratos.length > 0}
                />
                Contrato CVC
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tipo-importacao"
                  checked={tipoImportacao === "roteiro"}
                  onChange={() => setTipoImportacao("roteiro")}
                  disabled={contratos.length > 0}
                />
                Reserva de Cruzeiro
              </label>
            </div>
            {contratos.length > 0 && (
              <small style={{ color: "#64748b" }}>
                Limpe os contratos para trocar o tipo de importação.
              </small>
            )}
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
            <label className="form-label">PDF do contrato/orçamento</label>
            <div className="file-input-stack">
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
              <label htmlFor="contrato-file-input" className="btn btn-light w-full sm:w-auto">
                Escolher arquivo
              </label>
              <span className="file-input-name">{file?.name || "Nenhum arquivo escolhido"}</span>
            </div>
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Texto do contrato/orçamento</label>
            <textarea
              className="form-input"
              rows={8}
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
        </div>
        <div className="mobile-stack-buttons" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExtract}
            disabled={extracting || (contratos.length > 0 && !incluirMaisRecibos)}
          >
            {extracting
              ? "Extraindo..."
              : contratos.length > 0 && incluirMaisRecibos
              ? "Adicionar recibos"
              : "Extrair"}
          </button>
          <button
            type="button"
            className="btn btn-light"
            onClick={handlePreviewPdf}
            disabled={extracting || previewing || !file}
          >
            {previewing ? "Abrindo..." : "Pré-visualizar PDF"}
          </button>
          <button
            type="button"
            className="btn btn-light"
            onClick={() => {
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
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
            disabled={extracting}
          >
            Limpar
          </button>
        </div>
        {status && <div style={{ marginTop: 12, fontSize: 14 }}>{status}</div>}
        {error && <div style={{ marginTop: 12, color: "#b91c1c" }}>{error}</div>}
        {previewError && (
          <div style={{ marginTop: 12, color: "#b91c1c" }}>{previewError}</div>
        )}
      </div>

      {contratos.length > 0 && (
        <div className="card-base">
          <h3 style={{ marginTop: 0 }}>Contratos identificados</h3>
          <p style={{ marginTop: 4 }}>
            Selecione qual contrato deve ser o principal (define o destino da venda).
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {contratos.map((c, idx) => {
              const hasCpf = Boolean((c.contratante?.cpf || "").trim());
              const cpfControlsVisible = cpfInputIndex === idx;
              const buttonClass =
                cpfControlsVisible || hasCpf
                  ? "btn btn-ghost btn-ghost-xs"
                  : "btn btn-primary";
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
              return (
                <div key={`${c.contrato_numero}-${idx}`} className="card-base" style={{ border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong>Contrato {c.contrato_numero || "-"}</strong>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="contrato-principal"
                      checked={principalIndex === idx}
                      onChange={() => setPrincipalIndex(idx)}
                    />
                    Principal
                  </label>
                </div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.4 }}>
                  <div>
                    <strong>Contratante:</strong> {c.contratante?.nome || "-"} (
                    {c.contratante?.cpf ? formatCpf(c.contratante.cpf) : "-"})
                  </div>
                  {isRoteiro && idx === principalIndex && passageiros.length >= 2 && (
                    <div style={{ marginTop: 8 }}>
                      <label className="form-label" style={{ marginBottom: 6 }}>
                        Selecionar contratante (passageiros ≥ 18 anos, aplica em todos)
                      </label>
                      <select
                        className="form-select"
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
                      >
                        <option value="">Manter como está</option>
                        {passageirosContratante.map((p, pIdx) => {
                          const age = calcAge(p.nascimento || null, dataVenda);
                          const cpfDigits = normalizeCpf(p.cpf);
                          const ageLabel = age != null ? `${age} anos` : "idade ?";
                          const cpfLabel =
                            cpfDigits.length === 11 ? formatCpf(cpfDigits) : "CPF não informado";
                          return (
                            <option key={`${p.nome}-${pIdx}`} value={String(pIdx)}>
                              {`${p.nome} — ${ageLabel} — ${cpfLabel}`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  <div><strong>Reserva:</strong> {c.reserva_numero || "-"}</div>
                  <div><strong>Destino:</strong> {c.destino || "-"}</div>
                  <div><strong>Período:</strong> {formatDate(c.data_saida)} até {formatDate(c.data_retorno)}</div>
                  <div><strong>Produto:</strong> {c.produto_principal || "-"}</div>
                  <div><strong>Tipo de pacote:</strong> {c.tipo_pacote || "-"}</div>
                  <div><strong>Passageiros:</strong> {c.passageiros?.length || 0}</div>
                  <div><strong>Total bruto:</strong> {formatCurrency(c.total_bruto)}</div>
                  <div><strong>Total pago:</strong> {formatCurrency(c.total_pago)}</div>
                  <div><strong>Desconto comercial:</strong> {formatCurrency(c.desconto_comercial)}</div>
                </div>
                <div
                  className="form-row"
                  style={{
                    marginTop: 8,
                    gap: 4,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      className={
                        hasCpf ? "text-sm text-slate-500" : "text-sm text-red-500"
                      }
                    >
                      {hasCpf
                        ? "Atualize o CPF quando necessário."
                        : "CPF do contratante não encontrado, Informe-o agora para continuar."}
                    </span>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() =>
                        setCpfInputIndex(cpfControlsVisible ? null : idx)
                      }
                    >
                      {cpfControlsVisible
                        ? "Ocultar CPF"
                        : hasCpf
                        ? "Editar CPF"
                        : "Informar CPF"}
                    </button>
                  </div>
                </div>
                {cpfControlsVisible && (
                  <div className="form-row" style={{ marginTop: 8 }}>
                    <div className="form-group flex-1 min-w-[220px]">
                      <label className="form-label">CPF do contratante *</label>
                      <input
                        className="form-input"
                        type="text"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={c.contratante?.cpf || ""}
                        onChange={(e) =>
                          updateContratoContratante(idx, { cpf: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="form-row" style={{ marginTop: 12, marginBottom: 4 }}>
                  <div className="form-group flex-1 min-w-[220px]">
                    <label className="form-label">Produto (ajuste se necessário)</label>
                    <input
                      className="form-input"
                      list="listaProdutosImportAll"
                      placeholder={cidadeId ? "Digite ou selecione um produto" : "Digite o produto do recibo"}
                      value={c.produto_principal || ""}
                      onChange={(e) => updateContratoField(idx, { produto_principal: e.target.value })}
                      disabled={loadingProdutos}
                    />
                  </div>
                  <div className="form-group flex-1 min-w-[220px]">
                    <label className="form-label">Tipo de Pacote</label>
                    <select
                      className="form-select"
                      value={c.tipo_pacote || ""}
                      onChange={(e) => updateContratoField(idx, { tipo_pacote: e.target.value })}
                      disabled={isRoteiro || tiposPacote.length === 0}
                      style={
                        isReguaTipoPacote(c.tipo_pacote)
                          ? { color: "#b91c1c", fontWeight: 700 }
                          : undefined
                      }
                    >
                      <option value="">Selecione</option>
                      {tiposPacote.map((tipo) => {
                        const label = tipo.nome || "";
                        const isRegua = isReguaTipoPacote(label);
                        return (
                          <option
                            key={tipo.id}
                            value={label}
                            style={isRegua ? { color: "#b91c1c", fontWeight: 600 } : undefined}
                          >
                            {label}
                          </option>
                        );
                      })}
                      {c.tipo_pacote &&
                        !tiposPacote.some(
                          (tipo) =>
                            normalizeText(tipo.nome) ===
                            normalizeText(c.tipo_pacote || "", { trim: true, collapseWhitespace: true })
                        ) && (
                          <option value={c.tipo_pacote}>{`${c.tipo_pacote} (não cadastrado)`}</option>
                        )}
                    </select>
                    {tiposPacote.length === 0 && !isRoteiro && (
                      <input
                        className="form-input mt-2"
                        placeholder="Ex: Somente Hotel"
                        value={c.tipo_pacote || ""}
                        onChange={(e) => updateContratoField(idx, { tipo_pacote: e.target.value })}
                      />
                    )}
                  </div>
                </div>
                {(hasTransporteAereo(c) || Number(c.taxa_du || 0) > 0) && (
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <div className="form-group flex-1 min-w-[220px]">
                      <label className="form-label" title="DU comissionada. Informe o valor embutido nas taxas para entrar na comissao.">
                        DU (comissionada)
                      </label>
                      {/* Confirmação se aplica DU */}
                      {isViagemNacional(c, cidadePaisNome) && (
                        <div style={{ marginBottom: 6 }}>
                          <span>Aplicar DU automática? </span>
                          <button
                            type="button"
                            className={c.aplica_du ? "btn btn-primary btn-xs" : "btn btn-light btn-xs"}
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
                            {c.aplica_du ? "SIM" : "NÃO"}
                          </button>
                        </div>
                      )}
                      <input
                        className="form-input"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9,.]*"
                        placeholder="20,00"
                        value={formatMoneyInput(c.taxa_du ?? null)}
                        onChange={(e) => updateContratoField(idx, { taxa_du: parseMoneyInput(e.target.value) })}
                        disabled={!isViagemNacional(c, cidadePaisNome) ? true : !c.aplica_du}
                      />
                      <small style={{ color: "#64748b" }}>
                        DU padrão: R$ 20,00 por passageiro (apenas Brasil). Edite se necessário.
                      </small>
                    </div>
                  </div>
                )}
                {c.roteiro_reserva && (
                  <div style={{ marginTop: 12 }}>
                    <details className="card-base" style={{ padding: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Reserva de Cruzeiro</summary>
                      <div style={{ marginTop: 10, display: "grid", gap: 10, fontSize: 14 }}>
                        <div>
                          <strong>Contratante</strong>
                          <div>Nome: {formatLabelValue(c.roteiro_reserva.contratante?.nome || null)}</div>
                          <div>Recibo: {formatLabelValue(c.roteiro_reserva.contratante?.recibo || null)}</div>
                          <div>Valor: {formatCurrency(c.roteiro_reserva.contratante?.valor || null)}</div>
                          <div>Taxa embarque: {formatCurrency(c.roteiro_reserva.contratante?.taxa_embarque || null)}</div>
                          <div>Taxa DU: {formatCurrency(c.roteiro_reserva.contratante?.taxa_du || null)}</div>
                        </div>
                        <div>
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
                        <div>
                          <strong>Origem</strong>
                          <div>
                            {formatLabelValue(c.roteiro_reserva.origem?.pais || null)} /{" "}
                            {formatLabelValue(c.roteiro_reserva.origem?.estado || null)} /{" "}
                            {formatLabelValue(c.roteiro_reserva.origem?.cidade || null)}
                          </div>
                        </div>
                        <div>
                          <strong>Destino</strong>
                          <div>
                            {formatLabelValue(c.roteiro_reserva.destino?.pais || null)} /{" "}
                            {formatLabelValue(c.roteiro_reserva.destino?.estado || null)} /{" "}
                            {formatLabelValue(c.roteiro_reserva.destino?.cidade || null)}
                          </div>
                        </div>
                        <div>
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
                        {c.roteiro_reserva.fornecedores && c.roteiro_reserva.fornecedores.length > 0 && (
                          <div>
                            <strong>Fornecedores</strong>
                            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                              {c.roteiro_reserva.fornecedores.map((f, i) => {
                                const produtoNome = getFornecedorProdutoNome(f);
                                const titulo = produtoNome || f.nome || null;
                                const mostrarFornecedor = Boolean(produtoNome && f.nome && produtoNome !== f.nome);
                                return (
                                <div key={`${c.contrato_numero}-for-${i}`} style={{ padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                                  <div><strong>{formatLabelValue(titulo)}</strong></div>
                                  {mostrarFornecedor && (
                                    <div>Fornecedor: {formatLabelValue(f.nome || null)}</div>
                                  )}
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
                        )}
                        {c.roteiro_reserva.passageiros && c.roteiro_reserva.passageiros.length > 0 && (
                          <div>
                            <strong>Passageiros</strong>
                            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                              {c.roteiro_reserva.passageiros.map((p, i) => (
                                <div key={`${c.contrato_numero}-pax-${i}`} style={{ padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                                  <div>
                                    {formatLabelValue([p.sobrenome, p.nome].filter(Boolean).join(" ") || null)}
                                  </div>
                                  <div>Nascimento: {formatDate(p.nascimento || null)}</div>
                                  <div>Sexo: {formatLabelValue(p.sexo || null)}</div>
                                  <div>Idade: {formatLabelValue(p.idade || null)}</div>
                                  <div>Local embarque: {formatLabelValue(p.local_embarque || null)}</div>
                                  <div>Documento: {formatLabelValue(p.documento_numero || null)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {c.roteiro_reserva.orcamento && (
                          <div>
                            <strong>Orçamento</strong>
                            <div>Valor total: {formatCurrency(c.roteiro_reserva.orcamento.valor_total || null)}</div>
                            <div>Férias protegidas: {formatCurrency(c.roteiro_reserva.orcamento.valor_ferias_protegidas || null)}</div>
                            <div>Forma: {formatLabelValue(c.roteiro_reserva.orcamento.forma_pagamento || null)}</div>
                            <div>Plano: {formatLabelValue(c.roteiro_reserva.orcamento.plano || null)}</div>
                          </div>
                        )}
                        {c.roteiro_reserva.pagamento && (
                          <div>
                            <strong>Pagamento</strong>
                            <div>Forma: {formatLabelValue(c.roteiro_reserva.pagamento.forma || null)}</div>
                            <div>Plano: {formatLabelValue(c.roteiro_reserva.pagamento.plano || null)}</div>
                            {c.roteiro_reserva.pagamento.parcelas && (
                              <div>
                                <div>Parcelas:</div>
                                <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                                  {c.roteiro_reserva.pagamento.parcelas.map((parcela, i) => (
                                    <div key={`${c.contrato_numero}-par-${i}`}>
                                      {parcela.numero} - {formatCurrency(parcela.valor)} {parcela.vencimento ? `(${formatDate(parcela.vencimento)})` : ""}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
                {c.pagamentos && c.pagamentos.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <strong>Pagamentos</strong>
                    <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                      {c.pagamentos.map((p, i) => (
                        <li key={`${c.contrato_numero}-pg-${i}`}>
                          {p.forma} {p.operacao ? `(${p.operacao})` : ""} — {formatCurrency(p.valor_bruto)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
          </div>
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: 0 }}>Confirme cidade e Produto</h4>
            <p style={{ marginTop: 4, marginBottom: 12, color: "#64748b", fontSize: 13 }}>
              Esses dados serão usados como cidade e produto principal da venda. O produto pode ser escolhido ou criado.
            </p>
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group flex-1 min-w-[220px] relative">
                <label className="form-label">Cidade *</label>
                <input
                  className="form-input"
                  placeholder="Digite o nome da cidade"
                  value={buscaCidade}
                  onChange={(e) => handleCidadeInput(e.target.value)}
                  onFocus={() => setMostrarSugestoesCidade(true)}
                  onBlur={() => setTimeout(() => setMostrarSugestoesCidade(false), 150)}
                  style={{ marginBottom: 6 }}
                  disabled={cidadeAutoIndefinida || loadingCidadeIndefinida}
                />
                {mostrarSugestoesCidade && (buscandoCidade || buscaCidade.trim().length >= 2) && (
                  <div
                    className="card-base card-config"
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      maxHeight: 160,
                      overflowY: "auto",
                      zIndex: 20,
                      padding: "4px 0",
                    }}
                  >
                    {buscandoCidade && (
                      <div style={{ padding: "6px 12px", color: "#64748b" }}>
                        Buscando cidades...
                      </div>
                    )}
                    {!buscandoCidade && erroCidade && (
                      <div style={{ padding: "6px 12px", color: "#dc2626" }}>{erroCidade}</div>
                    )}
                    {!buscandoCidade && !erroCidade && resultadosCidade.length === 0 && (
                      <div style={{ padding: "6px 12px", color: "#94a3b8" }}>
                        Nenhuma cidade encontrada.
                      </div>
                    )}
                    {!buscandoCidade &&
                      !erroCidade &&
                      resultadosCidade.map((c) => {
                        const label = formatCidadeLabel(c);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className="btn btn-ghost w-full text-left"
                            style={{ padding: "6px 12px" }}
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
                            {c.pais_nome ? (
                              <span style={{ color: "#6b7280", marginLeft: 6 }}> - {c.pais_nome}</span>
                            ) : null}
                          </button>
                        );
                      })}
                  </div>
                )}
                {loadingCidadeIndefinida && (
                  <small style={{ color: "#64748b" }}>Definindo cidade automaticamente...</small>
                )}
                {cidadeAutoIndefinida && !loadingCidadeIndefinida && (
                  <small style={{ color: "#0f766e" }}>
                    Cidade definida automaticamente: Indefinida (locação de carros).
                  </small>
                )}
                {!cidadeId && buscaCidade.trim() && (
                  <small style={{ color: "#b45309" }}>
                    Selecione uma cidade na lista para confirmar.
                  </small>
                )}
              </div>

              <div className="form-group flex-1 min-w-[220px]">
                <label className="form-label">Produto *</label>
                <input
                  className="form-input"
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
                {loadingProdutos && (
                  <small style={{ color: "#64748b" }}>Carregando produtos...</small>
                )}
                {errorProdutos && (
                  <small style={{ color: "#dc2626" }}>{errorProdutos}</small>
                )}
                {!destinoId && buscaDestino.trim() && cidadeId && !loadingProdutos && (
                  <small style={{ color: "#0f766e" }}>
                    Produto será criado automaticamente para a cidade selecionada.
                  </small>
                )}
              </div>

              <div className="form-group" style={{ minWidth: 180 }}>
                <label className="form-label">
                  Data da Venda *
                  <span title="Informe a data da venda conforme no Systur. Campo importante para Emissão de Nota Fiscal!" style={{ marginLeft: 6, color: '#0ea5e9', cursor: 'help' }}>?</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={dataVenda}
                  onFocus={selectAllInputOnFocus}
                  onChange={(e) => setDataVenda(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: 0 }}>Deseja incluir mais recibos?</h4>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="incluir-mais-recibos"
                  checked={!incluirMaisRecibos}
                  onChange={() => setIncluirMaisRecibos(false)}
                />
                Não
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="incluir-mais-recibos"
                  checked={incluirMaisRecibos}
                  onChange={() => setIncluirMaisRecibos(true)}
                />
                Sim
              </label>
            </div>
            {incluirMaisRecibos && (
              <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                Use os campos acima para importar outro PDF ou colar texto. Clique em &quot;Adicionar recibos&quot;.
                Selecione &quot;Não&quot; para finalizar e salvar.
              </div>
            )}
          </div>
          <div
            className="mobile-stack-buttons"
            style={{
              marginTop: 16,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !podeCriar || incluirMaisRecibos}
            >
              {saving ? "Salvando..." : "Salvar venda"}
            </button>
            <button
              type="button"
              className="btn btn-light"
              onClick={handleCancelarImportacao}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {previewOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <div className="modal-title">Texto extraido do PDF</div>
            </div>
            <div className="modal-body">
              <textarea
                className="form-input"
                rows={14}
                readOnly
                value={previewText}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-light" onClick={() => setPreviewOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {cvcModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Aviso sobre importação de contrato"
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header">
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>
                Para que a importação do Contrato seja correta, e o cálculo das comissões
                sejam mostradas corretamente, informe o Tipo de Pacote, de acordo com o que
                está informado na Reserva de Cruzeiro em Tipo de Pacote, por exemplo:
              </p>
              <p style={{ margin: 0 }}>
                <strong>
                  Fretamento, Terrestre (Quando o produto for Ingresso, marque Ingressos),
                  VHI Plus, Terrestre + Aéreo, Somente Hotel, Navio, Chip
                </strong>
                , etc.
              </p>
              <p style={{ margin: 0 }}>
                Isso deve ser feito para determinar os produtos que possuem opção de mudar a Régua
                de Comissionamento!
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setCvcModalOpen(false)}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
      {roteiroAvisoAberto && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Aviso sobre importação de reserva de cruzeiro"
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header">
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>
                Opção válida para importação somente de{" "}
                <span style={{ color: "#b45309", fontWeight: 700 }}>Reserva do Cruzeiro</span>.
                Para que funcione corretamente, é preciso abrir o campo <strong>+ Dados Pessoais</strong> de cada
                passageiro, caso contrário você deverá informar manualmente o CPF do cliente.
              </p>
              <p style={{ margin: 0 }}>
                Caso não tenha CPF cadastrado, deverá ser feito manualmente.
              </p>
            </div>
            <div className="modal-footer mobile-stack-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRoteiroAvisoAberto(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {duplicadoModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Duplicidade de recibo"
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header">
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>{duplicadoModal.mensagem}</p>
            </div>
            <div className="modal-footer mobile-stack-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDuplicadoModal(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {tipoPacoteModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Tipo de pacote obrigatório"
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header">
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>{tipoPacoteModal.mensagem}</p>
            </div>
            <div className="modal-footer mobile-stack-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setTipoPacoteModal(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
