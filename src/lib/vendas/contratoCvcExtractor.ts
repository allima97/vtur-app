import { normalizeText } from "../normalizeText";

function buildFretamentoLabel(raw?: string | null) {
  if (!raw) return null;
  const firstSegment = raw.split("*").find((seg) => seg && seg.trim());
  if (!firstSegment) return null;
  const texto = firstSegment.trim().replace(/\s+/g, " ");
  if (!texto) return null;
  return `Fretamento - ${texto}`;
}

function buildFretamentoLabelFromDestino(raw?: string | null) {
  if (!raw) return null;
  const firstSegment = raw.split("*").find((seg) => seg && seg.trim());
  if (!firstSegment) return null;
  const texto = firstSegment.trim().replace(/\s+/g, " ");
  if (!texto) return null;
  return `Fretamento - ${texto}`;
}

export type ContratanteDraft = {
  nome: string;
  cpf: string;
  rg?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  nascimento?: string | null; // ISO yyyy-mm-dd
};

export type PassageiroDraft = {
  nome: string;
  cpf: string;
  nascimento?: string | null; // ISO yyyy-mm-dd
};

export type PagamentoParcelaDraft = {
  numero: string;
  valor: number;
  vencimento?: string | null; // ISO yyyy-mm-dd
};

export type PagamentoDraft = {
  forma: string;
  operacao?: string | null;
  plano?: string | null;
  valor_bruto?: number | null;
  desconto?: number | null;
  total?: number | null;
  parcelas?: PagamentoParcelaDraft[];
};

export type RoteiroReservaFornecedorDraft = {
  nome?: string | null;
  numero_acordo?: string | null;
  tipo_servico?: string | null;
  cidade?: string | null;
  categoria?: string | null;
  servico?: string | null;
  data_inicial?: string | null; // ISO yyyy-mm-dd
  data_final?: string | null; // ISO yyyy-mm-dd
  transporte_aereo?: string | null;
  trecho?: string | null;
  descricao?: string | null;
  hotel_nome?: string | null;
};

export type RoteiroReservaPassageiroDraft = {
  sobrenome?: string | null;
  nome?: string | null;
  nascimento?: string | null; // ISO yyyy-mm-dd
  sexo?: string | null;
  idade?: string | null;
  local_embarque?: string | null;
  localizador?: string | null;
  systur?: string | null;
  observacao?: string | null;
  rg?: string | null;
  rg_orgao_uf?: string | null;
  documento_tipo?: string | null;
  documento_numero?: string | null;
  documento_validade?: string | null;
  pais_emissao?: string | null;
  pais_residencia?: string | null;
  telefone?: string | null;
  email?: string | null;
};

export type RoteiroReservaDraft = {
  contratante?: {
    nome?: string | null;
    recibo?: string | null;
    valor?: number | null;
    taxa_embarque?: number | null;
    taxa_du?: number | null;
    taxas?: number | null;
    taxa_traslado?: number | null;
    taxa_remessa?: number | null;
    taxa_iof?: number | null;
    passageiros?: number | null;
  } | null;
  roteiro?: {
    descricao?: string | null;
    tipo_produto?: string | null;
    numero?: string | null;
    systur?: string | null;
    data_saida?: string | null;
    data_retorno?: string | null;
    vendedor?: string | null;
    office_id?: string | null;
    voo?: string | null;
    mensagem?: string | null;
  } | null;
  origem?: {
    pais?: string | null;
    estado?: string | null;
    cidade?: string | null;
  } | null;
  destino?: {
    pais?: string | null;
    estado?: string | null;
    cidade?: string | null;
  } | null;
  fornecedores?: RoteiroReservaFornecedorDraft[];
  dados_reserva?: {
    filial?: string | null;
    carrinho_id?: string | null;
    tipo_venda?: string | null;
    pedido?: string | null;
    pedido_dinamico?: string | null;
    numero_reserva?: string | null;
    vendedor_reserva?: string | null;
    data_reserva?: string | null;
    remarcacao?: string | null;
    validade_reserva?: string | null;
    tipo_reserva?: string | null;
    tabela?: string | null;
    observacao?: string | null;
    operador_online?: string | null;
    tipo_pacote?: string | null;
    desvio_loja?: string | null;
  } | null;
  passageiros?: RoteiroReservaPassageiroDraft[];
  orcamento?: {
    preco_orcamento?: number | null;
    valor_total_taxas?: number | null;
    valor_total_desconto_promocao?: number | null;
    valor_total?: number | null;
    valor_ferias_protegidas?: number | null;
    forma_pagamento?: string | null;
    plano?: string | null;
  } | null;
  pagamento?: {
    forma?: string | null;
    plano?: string | null;
    parcelas?: PagamentoParcelaDraft[];
    total_apurado?: number | null;
  } | null;
};

export type ContratoDraft = {
  contrato_numero: string;
  reserva_numero?: string | null;
  excursao_numero?: string | null;
  destino?: string | null;
  data_saida?: string | null; // ISO yyyy-mm-dd
  data_retorno?: string | null; // ISO yyyy-mm-dd
  produto_principal?: string | null;
  produto_tipo?: string | null;
  produto_detalhes?: string | null;
  contratante?: ContratanteDraft | null;
  passageiros?: PassageiroDraft[];
  pagamentos?: PagamentoDraft[];
  total_bruto?: number | null;
  total_pago?: number | null;
  taxas_embarque?: number | null;
  taxa_du?: number | null;
  desconto_comercial?: number | null;
  raw_text?: string;
  tipo_pacote?: string | null;
  roteiro_reserva?: RoteiroReservaDraft | null;
};

export type ContratoImportResult = {
  contratos: ContratoDraft[];
  raw_text: string;
};

function hasContractSpecificInfo(contrato: ContratoDraft) {
  return Boolean(
    contrato.contrato_numero ||
      contrato.reserva_numero ||
      contrato.excursao_numero ||
      contrato.destino ||
      contrato.data_saida ||
      contrato.data_retorno ||
      contrato.produto_principal ||
      contrato.produto_tipo ||
      contrato.produto_detalhes ||
      contrato.total_bruto != null ||
      contrato.total_pago != null ||
      contrato.taxas_embarque != null ||
      contrato.desconto_comercial != null ||
      (contrato.pagamentos && contrato.pagamentos.length)
  );
}

function scoreContrato(contrato: ContratoDraft) {
  let score = 0;
  if (contrato.contrato_numero) score += 4;
  if (contrato.reserva_numero) score += 3;
  if (contrato.excursao_numero) score += 2;
  if (contrato.destino) score += 2;
  if (contrato.data_saida || contrato.data_retorno) score += 1;
  if (contrato.produto_principal || contrato.produto_tipo) score += 1;
  if (contrato.total_bruto != null || contrato.total_pago != null) score += 1;
  if (contrato.pagamentos && contrato.pagamentos.length) score += 1;
  return score;
}

function dedupeContratos(contratos: ContratoDraft[]) {
  const result: ContratoDraft[] = [];
  const indexByNumero = new Map<string, number>();

  contratos.forEach((contrato) => {
    const numero = contrato.contrato_numero || "";
    if (!numero) {
      result.push(contrato);
      return;
    }
    const existingIndex = indexByNumero.get(numero);
    if (existingIndex == null) {
      indexByNumero.set(numero, result.length);
      result.push(contrato);
      return;
    }
    const existing = result[existingIndex];
    if (scoreContrato(contrato) > scoreContrato(existing)) {
      result[existingIndex] = contrato;
    }
  });

  return result;
}

function cleanText(text: string) {
  return (text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseCurrency(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function extractCurrency(line: string) {
  if (!line) return null;
  const match = line.match(/R\$\s*([0-9.,-]+)/i);
  if (match?.[1]) return parseCurrency(match[1]);
  const fallback = line.match(/([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/);
  if (fallback?.[1]) return parseCurrency(fallback[1]);
  return null;
}

function parseDateBr(value?: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function extractLineValue(block: string, label: string) {
  const regex = new RegExp(`${label}\\s*:?\\s*([^\n]+)`, "i");
  const match = block.match(regex);
  return match?.[1]?.trim() || "";
}

function extractBlockValue(block: string, label: string, stopLabels: string[]) {
  const pattern = new RegExp(
    `${label}\\s*:?\\s*([\\s\\S]*?)(?:${stopLabels.join("|")}|$)`,
    "i"
  );
  const match = block.match(pattern);
  return match?.[1]?.trim() || "";
}

function stripRoteiroInlineStopLabels(value: string) {
  const stops = [
    /\bTipo\s+de\s+Produto\b/i,
    /\bN[uú]mero\s+do\s+Roteiro\b/i,
    /\bRoteiro\s+Systur\b/i,
    /\bData\s+de\s+Sa[ií]da\b/i,
    /\bData\s+de\s+Retorno\b/i,
  ];
  let cutIndex = value.length;
  for (const stop of stops) {
    const idx = value.search(stop);
    if (idx >= 0 && idx < cutIndex) cutIndex = idx;
  }
  return value.slice(0, cutIndex).trim();
}

function extractDescricaoRoteiro(lines: string[]) {
  if (!lines.length) return null;
  const labelRegex = /descri[cç][aã]o/i;
  const stopRegex = /^(tipo\s+de\s+produto|n[uú]mero\s+do\s+roteiro|roteiro\s+systur|data\s+de\s+sa[ií]da|data\s+de\s+retorno|vendedor|office|v[oô]o|mensagem)/i;
  const labelContinuationRegex = /^(roteiro|n[uú]mero)/i;
  const parts: string[] = [];
  let collecting = false;
  let skipNext = false;
  let descriptionStarted = false;

  for (let i = 0; i < lines.length; i += 1) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const line = lines[i].trim();
    if (!line) continue;
    const normalized = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (!collecting) {
      if (labelRegex.test(normalized)) {
        collecting = true;
        continue;
      }
      const nextLine = lines[i + 1]?.trim();
      if (nextLine) {
        const combined = `${line} ${nextLine}`;
        const combinedNorm = normalizeText(combined, { trim: true, collapseWhitespace: true });
        if (labelRegex.test(combinedNorm)) {
          collecting = true;
          skipNext = true;
          continue;
        }
      }
      continue;
    }
    if (!descriptionStarted) {
      if (labelContinuationRegex.test(normalized)) continue;
      descriptionStarted = true;
    }
    if (stopRegex.test(normalized)) break;
    if (!descriptionStarted) continue;
    const sanitized = stripRoteiroInlineStopLabels(line);
    if (sanitized) parts.push(sanitized);
    if (sanitized !== line) break;
  }

  if (!parts.length) return null;
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function normalizePlaceholderValue(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeText(trimmed, { trim: true, collapseWhitespace: true });
  const normalizedNoPunct = normalized.replace(/[.:]/g, "");
  const placeholders = new Set(["-", "—", "–", "nº", "n°", "n", "nao informado", "não informado"]);
  if (placeholders.has(normalized) || placeholders.has(normalizedNoPunct)) return null;
  if (/^-+$/.test(normalized)) return null;
  if (/^n[º°]?$/.test(normalized) || /^n[º°]?$/.test(normalizedNoPunct)) return null;
  return trimmed;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDashChars(value: string) {
  return (value || "").replace(/[‐‑‒–—―−﹣－]/g, "-");
}

function normalizeReciboNumero(value?: string | null) {
  if (!value) return null;
  const normalized = normalizeDashChars(value)
    .replace(/\//g, "-")
    .replace(/\s+/g, "")
    .replace(/[^\d-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  if (!normalized) return null;
  if (!normalized.includes("-")) {
    const digits = normalized.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length >= 14) return `${digits.slice(0, 4)}-${digits.slice(4, 14)}`;
    if (digits.length >= 12) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return digits;
  }
  const [prefix, ...rest] = normalized.split("-");
  const suffix = rest.join("");
  if (prefix?.length === 4 && suffix.length > 10) {
    return `${prefix}-${suffix.slice(0, 10)}`;
  }
  return `${prefix}-${suffix}`.replace(/-+$/g, "").trim();
}

function extractReciboNumero(text: string) {
  const normalized = normalizeDashChars(text || "");
  if (!normalized) return null;

  const candidates: string[] = [];

  for (const match of normalized.matchAll(/recibo[^\d]{0,30}([0-9][0-9\s\\-\\/]{5,50})/gi)) {
    const candidate = normalizeReciboNumero(match[1]);
    if (candidate) candidates.push(candidate);
  }

  for (const match of normalized.matchAll(/\b(\d{4})\s*[-\/]\s*([0-9][0-9\s]{5,50}[0-9])\b/g)) {
    const suffixDigits = match[2].replace(/\s+/g, "");
    const candidate = normalizeReciboNumero(`${match[1]}-${suffixDigits}`);
    if (candidate) candidates.push(candidate);
  }

  // Heuristica para layouts quebrados (ex: pdfjs): o prefixo e o sufixo podem aparecer separados por ruídos.
  // Ex.: "5630 - Araujo ... 0000081682" => "5630-0000081682".
  for (const match of normalized.matchAll(/\b(\d{10})\b/g)) {
    const suffix = match[1];
    const idx = typeof match.index === "number" ? match.index : -1;
    if (idx < 0) continue;
    const before = normalized.slice(Math.max(0, idx - 260), idx);
    const prefixMatches = Array.from(before.matchAll(/\b(\d{4})\b/g));
    for (let p = prefixMatches.length - 1; p >= 0; p -= 1) {
      const prefix = prefixMatches[p]?.[1] || "";
      const prefixNum = Number(prefix);
      if (prefixNum >= 1900 && prefixNum <= 2099) continue;
      const candidate = normalizeReciboNumero(`${prefix}-${suffix}`);
      if (candidate) {
        candidates.push(candidate);
        break;
      }
    }
  }

  if (!candidates.length) return null;
  return candidates.sort(
    (a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length
  )[0];
}

function isConsultaRoteiroReservaText(text: string) {
  const normalized = normalizeText(text, { trim: true, collapseWhitespace: true });
  return normalized.includes("consulta de roteiro e reserva");
}

function extractValueFromLines(lines: string[], labelRegex: RegExp) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (labelRegex.test(line)) {
      const valueInLine = line.replace(labelRegex, "").trim();
      if (valueInLine) return valueInLine;
      const next = lines[i + 1] ? lines[i + 1].trim() : "";
      return next;
    }
  }
  return "";
}

function extractLabelValueFromBlock(block: string, label: string, labels: string[]) {
  const cleaned = block.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const stopLabels = labels.filter((l) => l !== label).map(escapeRegExp).join("|");
  const pattern = stopLabels
    ? new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(.+?)(?=\\s*(?:${stopLabels})\\b|$)`, "i")
    : new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(.+?)$`, "i");
  const match = cleaned.match(pattern);
  return match?.[1]?.trim() || "";
}

function splitTableLine(line: string) {
  if (!line) return [];
  if (line.includes("|")) {
    return line.split("|").map((part) => part.trim());
  }
  return line.split(/(?:\t+|\s{2,})/).map((part) => part.trim());
}

function findColumnIndex(headers: string[], keywords: string[]) {
  const normalizedHeaders = headers.map((h) => normalizeText(h, { trim: true, collapseWhitespace: true }));
  for (const keyword of keywords) {
    const keyNorm = normalizeText(keyword, { trim: true, collapseWhitespace: true });
    const idx = normalizedHeaders.findIndex((h) => h.includes(keyNorm));
    if (idx >= 0) return idx;
  }
  return -1;
}

function isGenericServicoLabel(value?: string | null) {
  const normalized = normalizeText(value || "");
  if (!normalized) return false;
  return (
    normalized === "hotel" ||
    normalized === "receptivo" ||
    normalized === "servicos" ||
    normalized === "serviços" ||
    normalized === "atividades" ||
    normalized === "ingressos" ||
    normalized === "transporte aereo" ||
    normalized === "transporte aéreo" ||
    normalized === "transporte" ||
    normalized === "navio"
  );
}

function isInvalidDestinoValue(value?: string | null) {
  const normalized = normalizeText(value || "", { trim: true, collapseWhitespace: true });
  if (!normalized) return true;
  if (normalized.includes("|")) return true;
  if (normalized.includes("hotel") || normalized.includes("receptivo") || normalized.includes("transporte aereo")) {
    return true;
  }
  return false;
}

function normalizeMaybeNumero(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").trim();
  if (/^\d{5,}$/.test(cleaned)) return cleaned;
  return null;
}

function normalizeServicoNome(value?: string | null) {
  const trimmed = normalizePlaceholderValue(value) || null;
  if (!trimmed) return null;
  const dashed = normalizeDashChars(trimmed);
  const match = dashed.match(/^\s*\d{5,}\s*-\s*(.+)$/);
  const stripped = match?.[1]?.trim() || trimmed.trim();
  return normalizePlaceholderValue(stripped) || null;
}

function sanitizeTipoPacote(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeText(trimmed, { trim: true, collapseWhitespace: true });
  if (!normalized || normalized === "0" || normalized === "00" || normalized === "0,00") return null;
  const blocked = [
    "desvio loja",
    "quantidade de passageiros por hotel",
    "quantidade de hotel",
    "quantidade de apartamento",
    "fornecedor online",
    "reserva da intranet",
    "adultos",
    "criancas",
    "crianças",
  ];
  if (blocked.some((label) => normalized.includes(label))) return null;
  const headerTokens = [
    "sobrenome",
    "nome",
    "nascimento",
    "sexo",
    "idade",
    "local de embarque",
    "turno de refeição",
    "passageiros",
    "observação",
  ];
  if (headerTokens.some((token) => normalized.includes(token))) return null;
  return normalizePlaceholderValue(trimmed) || null;
}

function stripCodigoSuffix(value: string) {
  const tokens = value.trim().split(/\s+/);
  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (/^[\d.\-]+$/.test(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(" ").trim() || null;
}

function cleanTipoProdutoName(value?: string | null) {
  if (!value) return null;
  const stripped = stripCodigoSuffix(value);
  return normalizePlaceholderValue(stripped) || null;
}

function isFooterLine(line: string) {
  const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
  if (!norm) return true;
  if (norm.includes("http")) return true;
  if (norm.includes("systur")) return true;
  if (norm.includes("consulta de roteiro e reserva page")) return true;
  if (/page\s+\d+\s+of\s+\d+/i.test(norm)) return true;
  return false;
}

const CONTRATO_MARKERS = [
  /N\s*(?:\u00BA|\u00B0|o|\.)?\s*(?:do\s+)?Contrato\s*:?\s*[0-9][0-9.\-\s/]*\d(?=\s+Reserva\b|\n|$)/gi,
  /Contrato\s*(?:n\s*(?:\u00BA|\u00B0|o|\.)?)?\s*:?\s*[0-9][0-9.\-\s/]*\d(?=\s+Reserva\b|\n|$)/gi,
];

const ROTEIRO_SECTION_LABELS: Record<string, string[]> = {
  contratante: ["contratante"],
  roteiro: ["roteiro"],
  origem: ["origem"],
  destino: ["destino", "destinos"],
  fornecedores: ["fornecedores"],
  dados_reserva: ["dados da reserva"],
  passageiros: ["passageiros"],
  orcamento: ["orcamento", "orçamento"],
  pagamento: ["pagamento"],
};

const RECIBO_NUMERO_RE = /\b\d{4}\s*[-‐‑‒–—―−﹣－/]\s*\d{10}\b|\b\d{14}\b/;

const ROTEIRO_SECTION_IGNORE_LABELS = [
  "politica de multa",
  "política de multa",
  "seguro online",
  "voo cvc",
  "reserva de passagens aereas",
  "reserva de passagens aéreas",
  "atividades",
  "regras de cancelamento",
  "regras de cancelamento - fornecedor online",
  "quantidade de passageiros por hotel",
  "apartamentalizacao",
  "apartamentalização",
  "programacao do cruzeiro",
  "programação do cruzeiro",
  "locadora de veiculos",
  "locadora de veículos",
  "detalhes do circuito",
  "origem",
];

function splitRoteiroSections(lines: string[]) {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  const sectionKeys = Object.keys(ROTEIRO_SECTION_LABELS);
  sectionKeys.forEach((key) => {
    sections[key] = [];
  });

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const normalized = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (!normalized) continue;
    if (normalized.includes("consulta de roteiro e reserva")) continue;
    const normalizedNoPrefix = normalizeText(
      normalized.replace(/^\d+(?:\.\d+)?\s*[-–.]?\s*/i, ""),
      { trim: true, collapseWhitespace: true }
    );
    const isIgnoredLabel = ROTEIRO_SECTION_IGNORE_LABELS.some((label) => {
      if (normalized === label || normalizedNoPrefix === label) return true;
      if (normalized.startsWith(`${label} `) || normalizedNoPrefix.startsWith(`${label} `)) return true;
      if (normalized.startsWith(`${label}:`) || normalizedNoPrefix.startsWith(`${label}:`)) return true;
      return false;
    });
    if (isIgnoredLabel) {
      current = null;
      continue;
    }
    let matched: string | null = null;
    for (const key of sectionKeys) {
      const labels = ROTEIRO_SECTION_LABELS[key];
      if (
        labels.some((label) => {
          if (normalized === label || normalizedNoPrefix === label) return true;
          if (normalized.startsWith(`${label} `) || normalizedNoPrefix.startsWith(`${label} `)) return true;
          if (normalized.startsWith(`${label}:`) || normalizedNoPrefix.startsWith(`${label}:`)) return true;
          return false;
        })
      ) {
        matched = key;
        break;
      }
    }
    if (matched) {
      current = matched;
      continue;
    }
    if (current) {
      sections[current].push(line);
    }
  }

  return sections;
}

function parseRoteiroContratante(lines: string[]) {
  const isBannedName = (value?: string | null) => {
    if (!value) return false;
    const norm = normalizeText(value, { trim: true, collapseWhitespace: true });
    if (!norm) return false;
    if (norm.includes("http")) return true;
    if (norm.includes("systur")) return true;
    if (norm.includes("consulta de roteiro e reserva")) return true;
    return false;
  };

  if (!lines.length) return null;
  // Junta quebras artificiais (nome em duas linhas, recibo quebrado, etc.)
  const mergedLines: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    let current = lines[i].trim();
    if (!current) continue;
    const next = lines[i + 1]?.trim() || "";
    const currentHasNumber = /\d/.test(current);
    const nextHasNumber = /\d/.test(next);
    const currentHasCurrency = /R\$\s*[0-9]/i.test(current);
    // Recibo quebrado em duas linhas (ex: 5630- / 0000082482)
    if (/[-‐‑‒–—―−﹣－]\s*$/.test(current) && nextHasNumber && !currentHasCurrency) {
      current = `${current}${next}`;
      i += 1;
    } else if (!currentHasNumber && !currentHasCurrency && next && !nextHasNumber && !/R\$/i.test(next)) {
      // Nome quebrado em duas linhas
      current = `${current} ${next}`;
      i += 1;
    }
    mergedLines.push(current);
  }

  const text = mergedLines.join(" ").replace(/\s+/g, " ").trim();
  let nome: string | null = null;
  let nomeConfiavel = false;
  let recibo: string | null = null;
  let valor: number | null = null;
  let taxa_embarque: number | null = null;
  let taxa_du: number | null = null;
  let taxas: number | null = null;
  let taxa_traslado: number | null = null;
  let taxa_remessa: number | null = null;
  let taxa_iof: number | null = null;
  let passageiros: number | null = null;

  const extractNomeAfterNomeLabel = () => {
    const labelIdx = mergedLines.findIndex((line) => {
      const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
      if (!norm) return false;
      if (norm === "nome") return true;
      if (norm.startsWith("nome:")) return true;
      // Cabeçalho do grid (Nome + Recibo)
      return norm.includes("nome") && norm.includes("recibo");
    });
    if (labelIdx < 0) return null;

    for (let i = labelIdx + 1; i < Math.min(mergedLines.length, labelIdx + 12); i += 1) {
      const raw = (mergedLines[i] || "").trim();
      if (!raw) continue;
      if (isFooterLine(raw)) continue;
      const norm = normalizeText(raw, { trim: true, collapseWhitespace: true });
      if (!norm) continue;

      // Ignora cabeçalhos/labels
      if (norm.includes("nome") && norm.includes("recibo")) continue;
      if (norm === "recibo" || norm === "valor" || norm.startsWith("valor em")) continue;
      if (norm.startsWith("taxa") || norm.startsWith("taxas")) continue;
      if (norm.startsWith("passageiros")) continue;

      // Linha tabular: pega o nome antes do recibo.
      const reciboMatch = raw.match(RECIBO_NUMERO_RE);
      if (reciboMatch?.index != null) {
        const before = raw.slice(0, reciboMatch.index).replace(/\s{2,}/g, " ").trim();
        const beforeNorm = normalizeText(before, { trim: true, collapseWhitespace: true });
        if (
          beforeNorm &&
          /[a-z]/i.test(beforeNorm) &&
          !/\d/.test(before) &&
          !/r\$/i.test(before) &&
          !/taxa|valor|passageiro|recibo/i.test(beforeNorm)
        ) {
          return before;
        }
      }

      // Layout vertical: nome costuma ficar logo abaixo do label "Nome".
      if (
        /[a-z]/i.test(norm) &&
        !/\d/.test(raw) &&
        !/r\$/i.test(raw) &&
        !/taxa|valor|passageiro|recibo/i.test(norm)
      ) {
        return raw.replace(/\s+/g, " ").trim();
      }
    }

    return null;
  };

  let valueLine: string | null = null;
  const headerIdx = mergedLines.findIndex((line) => {
    const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (norm.includes("passageiros") && !norm.includes("nome")) return false;
    return norm.includes("nome") && norm.includes("recibo");
  });
  if (headerIdx >= 0) {
    const headerCols = splitTableLine(mergedLines[headerIdx]);
    const windowLines: string[] = [];
    for (let i = headerIdx + 1; i < mergedLines.length && windowLines.length < 8; i += 1) {
      const l = mergedLines[i];
      if (!l.trim()) continue;
      const norm = normalizeText(l, { trim: true, collapseWhitespace: true });
      if (norm === "roteiro" || norm === "destinos" || norm === "destino" || norm === "origem") break;
      windowLines.push(l);
      const joined = windowLines.join(" ");
      if (RECIBO_NUMERO_RE.test(joined) && /\d+,\d{2}/.test(joined)) break;
    }
    valueLine = windowLines.join(" ");
    const valueCols = valueLine ? splitTableLine(valueLine).filter(Boolean) : [];
    // Caso a linha esteja sem separadores (tudo em uma linha única), fazemos um parsing manual
    if (valueLine && valueCols.length <= 1) {
      const reciboMatch = valueLine.match(RECIBO_NUMERO_RE);
      if (reciboMatch) {
        const reciboIdx = reciboMatch.index ?? 0;
        const reciboRaw = reciboMatch[0] || "";
        if (!recibo) recibo = normalizeReciboNumero(reciboRaw) || reciboRaw.replace(/\s+/g, "");
        const before = valueLine.slice(0, reciboIdx).trim();
        if (!nome && before) {
          nome = before.replace(/\s{2,}/g, " ");
          nomeConfiavel = true;
        }
        const after = valueLine.slice(reciboIdx + reciboRaw.length);
        const nums = (after.match(/[0-9]{1,3}(?:\.[0-9]{3})*,\d{2}/g) || [])
          .map(parseCurrency)
          .filter((v): v is number => v != null);
        if (nums[0] != null) valor = nums[0];
        if (nums[1] != null) taxa_embarque = nums[1];
        if (nums[2] != null) taxa_du = nums[2];
        if (nums[3] != null) taxa_remessa = nums[3];
        if (nums[4] != null) taxa_iof = nums[4];
      }
    }
    if (headerCols.length > 1 && valueCols.length > 1) {
      const idxNome = findColumnIndex(headerCols, ["Nome"]);
      const idxRecibo = findColumnIndex(headerCols, ["Recibo"]);
      const idxValor = findColumnIndex(headerCols, ["Valor em R$", "Valor (R$)", "Valor"]);
      const idxEmbarque = findColumnIndex(headerCols, ["Taxa de Embarque", "Taxa embarque"]);
      const idxDu = findColumnIndex(headerCols, ["Taxa DU", "Taxa de Serviço"]);
      const idxTaxas = findColumnIndex(headerCols, ["Taxas em R$", "Taxas"]);
      const idxTraslado = findColumnIndex(headerCols, ["Traslado em R$", "Traslado"]);
      const idxRemessa = findColumnIndex(headerCols, ["Taxa Remessa", "Taxa de Remessa"]);
      const idxIof = findColumnIndex(headerCols, ["Taxa IOF", "IOF"]);
      const idxPassageiros = findColumnIndex(headerCols, ["Passageiros", "Qtd Passageiros"]);

      if (idxNome >= 0 && valueCols[idxNome]) {
        nome = valueCols[idxNome].trim();
        nomeConfiavel = true;
      }
      if (idxRecibo >= 0 && valueCols[idxRecibo]) {
        const reciboVal = valueCols[idxRecibo].trim();
        const reciboParts = reciboVal.split(/\s+/);
        const reciboJoined = reciboParts.join("");
        const reciboMerged = /-/.test(reciboVal) ? reciboVal : reciboParts.join("-");
        recibo =
          normalizeReciboNumero(reciboMerged) ||
          normalizeReciboNumero(reciboJoined) ||
          reciboVal;
      }
      if (idxValor >= 0 && valueCols[idxValor]) valor = parseCurrency(valueCols[idxValor]);
      if (idxEmbarque >= 0 && valueCols[idxEmbarque]) taxa_embarque = parseCurrency(valueCols[idxEmbarque]);
      if (idxDu >= 0 && valueCols[idxDu]) taxa_du = parseCurrency(valueCols[idxDu]);
      if (idxTaxas >= 0 && valueCols[idxTaxas]) taxas = parseCurrency(valueCols[idxTaxas]);
      if (idxTraslado >= 0 && valueCols[idxTraslado]) taxa_traslado = parseCurrency(valueCols[idxTraslado]);
      if (idxRemessa >= 0 && valueCols[idxRemessa]) taxa_remessa = parseCurrency(valueCols[idxRemessa]);
      if (idxIof >= 0 && valueCols[idxIof]) taxa_iof = parseCurrency(valueCols[idxIof]);
      if (idxPassageiros >= 0 && valueCols[idxPassageiros]) {
        const num = parseInt(valueCols[idxPassageiros].replace(/\D/g, ""), 10);
        passageiros = Number.isFinite(num) ? num : null;
      }
    }
  }

  if (valueLine) {
    const reciboInline =
      valueLine.match(RECIBO_NUMERO_RE) || text.match(RECIBO_NUMERO_RE);
    if (!recibo && reciboInline?.[0]) recibo = normalizeReciboNumero(reciboInline[0]) || reciboInline[0];
    if (!nome && reciboInline?.index != null && reciboInline.index > 0) {
      const before = valueLine.slice(0, reciboInline.index).trim();
      if (before) {
        nome = before;
        nomeConfiavel = true;
      }
    }
  }

  if (!nome) {
    const byLabel = extractNomeAfterNomeLabel();
    if (byLabel) {
      nome = byLabel;
      nomeConfiavel = true;
    }
  }

  if (!nome) {
    // fallback específico: primeira linha não vazia após o cabeçalho e antes do recibo
    const firstDataIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
    const candidato = mergedLines
      .slice(firstDataIdx, headerIdx >= 0 ? firstDataIdx + 4 : mergedLines.length)
      .find((l) => {
        const norm = normalizeText(l, { trim: true, collapseWhitespace: true });
        if (!norm) return false;
        if (/https?:\/\//i.test(l)) return false;
        if (norm.includes("systur")) return false;
        if (norm.includes("consulta de roteiro e reserva")) return false;
        if (norm.includes("nome") && norm.includes("recibo")) return false;
        if (norm.includes("taxa") || norm.includes("valor") || norm.includes("passageiro")) return false;
        if (norm.includes("r$")) return false;
        if (/\d/.test(l)) return false;
        return true;
      });
    nome = candidato?.trim() || null;
  }

  if (nome) {
    const nomeNorm = normalizeText(nome, { trim: true, collapseWhitespace: true });
    if (
      nomeNorm.includes("valor") ||
      nomeNorm.includes("taxa") ||
      nomeNorm.includes("passageiro") ||
      /https?:\/\//i.test(nome) ||
      nomeNorm.includes("systur") ||
      nomeNorm.includes("consulta de roteiro e reserva")
    ) {
      nome = null;
    }
  }

  const nomeFromPassageiros = (() => {
    const match = text.match(
      new RegExp(`\\bPassageiros\\b\\s*:?\\s+(.+?)\\s+(?:${RECIBO_NUMERO_RE.source})`, "i")
    );
    if (!match?.[1]) return null;
    const candidate = match[1].replace(/\s+/g, " ").trim();
    if (!candidate || candidate.length < 4) return null;
    if (/\d/.test(candidate)) return null;
    const candidateNorm = normalizeText(candidate, { trim: true, collapseWhitespace: true });
    if (!candidateNorm) return null;
    if (/taxa|valor|recibo|passageiro/i.test(candidateNorm)) return null;
    if (isBannedName(candidate)) return null;
    return candidate;
  })();
  if (nomeFromPassageiros) {
    nome = nomeFromPassageiros;
    nomeConfiavel = true;
  }

  if (!nome) {
    // última tentativa: linha imediatamente anterior ao recibo identificado
    const reciboPos = mergedLines.findIndex((l) => RECIBO_NUMERO_RE.test(l));
    if (reciboPos > 0) {
      const prev = mergedLines[reciboPos - 1].trim();
      const norm = normalizeText(prev, { trim: true, collapseWhitespace: true });
      if (norm && !/\d/.test(norm) && !/r\$/i.test(norm) && !norm.includes("recibo") && !norm.includes("taxa")) {
        nome = prev;
      }
    }
  }

  if (nome) {
    const tokens = nome.trim().split(/\s+/);
    if (!nomeConfiavel) {
      const candidateLongest = mergedLines
        .filter((l) => {
          const norm = normalizeText(l, { trim: true, collapseWhitespace: true });
          if (!norm) return false;
          if (/\d/.test(norm)) return false;
          if (/r\$/.test(norm)) return false;
          if (norm.includes("recibo") || norm.includes("taxa") || norm.includes("valor")) return false;
          if (norm.length <= nome.length) return false;
          return true;
        })
        .sort((a, b) => b.length - a.length)[0];
      if (candidateLongest && candidateLongest.split(/\s+/).length > tokens.length) {
        nome = candidateLongest.trim();
      }
    }
  }

  if (!recibo) {
    const reciboByLabel = extractValueFromLines(mergedLines, /Recibo/i);
    const reciboMatch =
      reciboByLabel.match(RECIBO_NUMERO_RE) ||
      text.match(RECIBO_NUMERO_RE);
    recibo = normalizeReciboNumero(reciboMatch?.[0] || null) || null;
  }

  // Fallback dedicado para layouts verticais (nome acima, recibo na linha seguinte, valores na linha depois)
  if (!recibo) {
    recibo = extractReciboNumero(text);
  }
  if (!recibo) {
    recibo = extractReciboNumero(mergedLines.join(" "));
  }
  const reciboLineIdx = mergedLines.findIndex((l) => RECIBO_NUMERO_RE.test(l));
  if (!nome && reciboLineIdx > 0) {
    const upwards = mergedLines.slice(0, reciboLineIdx).reverse();
    const candidate = upwards.find((l) => {
      const norm = normalizeText(l, { trim: true, collapseWhitespace: true });
      if (!norm) return false;
      if (/https?:\/\//i.test(l)) return false;
      if (norm.includes("systur")) return false;
      if (norm.includes("consulta de roteiro e reserva")) return false;
      if (norm.includes("nome") || norm.includes("recibo")) return false;
      if (norm.includes("taxa") || norm.includes("valor") || norm.includes("passageiro")) return false;
      if (/\d/.test(l)) return false;
      return /[a-z]/.test(norm);
    });
    if (candidate) nome = candidate.trim();
  }
  if (valor == null) {
    const numbersLine =
      mergedLines.find((l) => /[0-9]{1,3}\.[0-9]{3},\d{2}/.test(l) && l.split(/\s+/).length >= 3) || "";
    const nums = (numbersLine.match(/[0-9]{1,3}(?:\.[0-9]{3})*,\d{2}/g) || []).map(parseCurrency).filter((v): v is number => v != null);
    if (nums.length) {
      valor = nums[0] ?? null;
      taxa_embarque = taxa_embarque ?? nums[1] ?? null;
      taxa_du = taxa_du ?? nums[2] ?? null;
      taxa_remessa = taxa_remessa ?? nums[3] ?? null;
      taxa_iof = taxa_iof ?? nums[4] ?? null;
    }
  }

  if (valor == null || taxa_embarque == null || taxa_du == null || taxa_remessa == null || taxa_iof == null) {
    const currencyMatches = Array.from(text.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/g))
      .map((m) => parseCurrency(m[1]))
      .filter((v): v is number => v != null);
    if (valor == null && currencyMatches[0] != null) valor = currencyMatches[0];
    if (taxa_embarque == null && currencyMatches[1] != null) taxa_embarque = currencyMatches[1];
    if (taxa_du == null && currencyMatches[2] != null) taxa_du = currencyMatches[2];
    if (taxa_remessa == null && currencyMatches[3] != null) taxa_remessa = currencyMatches[3];
    if (taxa_iof == null && currencyMatches[4] != null) taxa_iof = currencyMatches[4];
  }

  return {
    nome: isBannedName(nome) ? null : normalizePlaceholderValue(nome) || null,
    recibo: normalizePlaceholderValue(recibo) || null,
    valor,
    taxa_embarque,
    taxa_du,
    taxas,
    taxa_traslado,
    taxa_remessa,
    taxa_iof,
    passageiros,
  };
}

function parseRoteiroRoteiro(lines: string[]) {
  if (!lines.length) return null;
  const text = lines.join("\n");
  const labels = [
    "Descricao do Roteiro",
    "Descrição do Roteiro",
    "Tipo de Produto",
    "Numero do Roteiro",
    "Número do Roteiro",
    "Roteiro Systur",
    "Data de Saida",
    "Data de Saída",
    "Data de Retorno",
    "Vendedor",
    "OFFICE ID",
    "Voo",
    "Vôo",
    "Mensagem",
  ];

  const descricaoRaw =
    extractDescricaoRoteiro(lines) ||
    extractBlockValue(text, "Descri[cç][aã]o\\s+do\\s+Roteiro", [
      "Tipo\\s+de\\s+Produto",
      "N[úu]mero\\s+do\\s+Roteiro",
      "Roteiro\\s+Systur",
      "Data\\s+de\\s+Sa[ií]da",
      "Data\\s+de\\s+Retorno",
      "Vendedor",
      "OFFICE\\s+ID",
      "Voo",
      "Vôo",
      "Mensagem",
    ]) ||
    extractLineValue(text, "Descri[cç][aã]o\\s+do\\s+Roteiro");
  const descricao = descricaoRaw ? descricaoRaw.replace(/\s+/g, " ").trim() : null;
  const tipoProduto = extractLabelValueFromBlock(text, "Tipo de Produto", labels) || null;
  const numeroRoteiro =
    extractLabelValueFromBlock(text, "Numero do Roteiro", labels) ||
    extractLabelValueFromBlock(text, "Número do Roteiro", labels) ||
    null;
  const roteiroSystur = extractLabelValueFromBlock(text, "Roteiro Systur", labels) || null;
  const dataSaidaInline = text.match(/Data\s+de\s+Sa[ií]da\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const dataRetornoInline = text.match(/Data\s+de\s+Retorno\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const dataSaidaRaw = dataSaidaInline?.[1] || extractValueFromLines(lines, /Data\s+de\s+Sa[ií]da/i);
  const dataRetornoRaw = dataRetornoInline?.[1] || extractValueFromLines(lines, /Data\s+de\s+Retorno/i);
  const data_saida = parseDateBr(dataSaidaRaw) || null;
  const data_retorno = parseDateBr(dataRetornoRaw) || null;
  const vendedor = extractLabelValueFromBlock(text, "Vendedor", labels) || null;
  const office_id = extractLabelValueFromBlock(text, "OFFICE ID", labels) || null;
  const voo = extractLabelValueFromBlock(text, "Voo", labels) || extractLabelValueFromBlock(text, "Vôo", labels) || null;
  const mensagem = extractLabelValueFromBlock(text, "Mensagem", labels) || null;

  return {
    descricao: normalizePlaceholderValue(descricao) || null,
    tipo_produto: normalizePlaceholderValue(tipoProduto) || null,
    numero: normalizePlaceholderValue(numeroRoteiro) || null,
    systur: normalizePlaceholderValue(roteiroSystur) || null,
    data_saida,
    data_retorno,
    vendedor: normalizePlaceholderValue(vendedor) || null,
    office_id: normalizePlaceholderValue(office_id) || null,
    voo: normalizePlaceholderValue(voo) || null,
    mensagem: normalizePlaceholderValue(mensagem) || null,
  };
}

function parseRoteiroLocalizacao(lines: string[]) {
  if (!lines.length) return null;
  const isNoise = (line: string) => {
    const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (!norm) return true;
    if (norm.includes("pais") || norm.includes("estado") || norm.includes("cidade")) return true;
    if (norm.includes("fornecedor") || norm.includes("numero do acordo") || norm.includes("categoria")) return true;
    if (norm.includes("hotel") || norm.includes("receptivo") || norm.includes("transporte aereo") || norm.includes("servicos")) {
      return true;
    }
    return false;
  };

  const headerIdx = lines.findIndex((line) => {
    const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
    return norm.includes("pais") && norm.includes("estado") && norm.includes("cidade");
  });

  let valueLine: string | null = null;
  if (headerIdx >= 0) {
    valueLine = lines.slice(headerIdx + 1).find((line) => line.trim() && !isNoise(line)) || null;
  } else {
    valueLine = lines.find((line) => {
      if (!line.trim()) return false;
      if (isNoise(line)) return false;
      return true;
    }) || null;
  }

  if (!valueLine) return null;
  const cols = splitTableLine(valueLine).filter(Boolean);
  if (cols.length >= 3) {
    return {
      pais: cols[0] || null,
      estado: cols[1] || null,
      cidade: cols.slice(2).join(" ").trim() || null,
    };
  }
  const tokens = valueLine.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return {
    pais: tokens[0] || null,
    estado: tokens[1] || null,
    cidade: tokens.slice(2).join(" ").trim() || null,
  };
}

function extractValueBeforeLabel(text: string, label: string, pattern: RegExp) {
  const labelPattern = label
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  const regex = new RegExp(`${pattern.source}\\s+${labelPattern}`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() || "";
}

function containsDigits(value?: string | null) {
  if (!value) return false;
  return /\d/.test(value);
}

function findPreviousValue(lines: string[], labelRegex: RegExp, pattern: RegExp) {
  for (let i = 0; i < lines.length; i += 1) {
    const currentLine = lines[i].trim();
    if (!currentLine) continue;
    const normalized = normalizeText(currentLine, { trim: true, collapseWhitespace: true });
    if (labelRegex.test(normalized)) {
      const candidate = searchBackwards(lines, i - 1, pattern);
      if (candidate) return candidate;
    }
    const nextLine = lines[i + 1]?.trim();
    if (nextLine) {
      const combined = `${currentLine} ${nextLine}`;
      const combinedNormalized = normalizeText(combined, { trim: true, collapseWhitespace: true });
      if (labelRegex.test(combinedNormalized)) {
        const candidate = searchBackwards(lines, i - 1, pattern);
        if (candidate) return candidate;
      }
    }
  }
  return "";
}

function searchBackwards(lines: string[], startIdx: number, pattern: RegExp) {
  for (let j = startIdx; j >= 0; j -= 1) {
    const candidate = lines[j].trim();
    if (!candidate) continue;
    const match = candidate.match(pattern);
    if (match) return match[0].trim();
  }
  return "";
}

function extractValueBetweenSplitLabels(
  lines: string[],
  startLabelRegex: RegExp,
  endLabelRegex: RegExp,
  valueRegex: RegExp,
  maxLookAhead = 3
) {
  for (let i = 0; i < lines.length; i += 1) {
    const startNorm = normalizeText(lines[i] || "", { trim: true, collapseWhitespace: true });
    if (!startNorm) continue;
    if (!startLabelRegex.test(startNorm)) continue;

    for (let j = i + 1; j < lines.length && j <= i + maxLookAhead; j += 1) {
      const endNorm = normalizeText(lines[j] || "", { trim: true, collapseWhitespace: true });
      if (!endNorm) continue;
      if (!endLabelRegex.test(endNorm)) continue;

      const betweenText = lines.slice(i + 1, j).join(" ");
      const match = betweenText.match(valueRegex);
      return match?.[1]?.trim() || match?.[0]?.trim() || "";
    }
  }
  return "";
}

function parseRoteiroDadosReserva(lines: string[]) {
  if (!lines.length) return null;
  const text = lines.join(" ");
  const labels = [
    "Filial",
    "Carrinho ID",
    "Tipo de Venda",
    "Pedido",
    "Pedido gerado Via Orçamento Dinâmico",
    "Pedido gerado Via Orcamento Dinamico",
    "Numero da Reserva",
    "Número da Reserva",
    "Vendedor da Reserva",
    "Data da Reserva",
    "Remarcação",
    "Remarcacao",
    "Validade da Reserva",
    "Tipo de Reserva",
    "Tabela",
    "Observação",
    "Observacao",
    "Operador Online",
    "Tipo de Pacote",
    "Desvio Loja",
  ];

  const filial = extractLabelValueFromBlock(text, "Filial", labels);
  const carrinho_id = extractLabelValueFromBlock(text, "Carrinho ID", labels);
  const tipo_venda = extractLabelValueFromBlock(text, "Tipo de Venda", labels);
  const pedido = extractLabelValueFromBlock(text, "Pedido", labels);
  const pedido_dinamico =
    extractLabelValueFromBlock(text, "Pedido gerado Via Orçamento Dinâmico", labels) ||
    extractLabelValueFromBlock(text, "Pedido gerado Via Orcamento Dinamico", labels);
  const numero_reserva =
    extractLabelValueFromBlock(text, "Numero da Reserva", labels) ||
    extractLabelValueFromBlock(text, "Número da Reserva", labels);
  const vendedor_reserva = extractLabelValueFromBlock(text, "Vendedor da Reserva", labels);
  const data_reserva = extractLabelValueFromBlock(text, "Data da Reserva", labels);
  const remarcacao =
    extractLabelValueFromBlock(text, "Remarcação", labels) ||
    extractLabelValueFromBlock(text, "Remarcacao", labels);
  const validade_reserva = extractLabelValueFromBlock(text, "Validade da Reserva", labels);
  const tipo_reserva = extractLabelValueFromBlock(text, "Tipo de Reserva", labels);
  const tabela = extractLabelValueFromBlock(text, "Tabela", labels);
  const observacao =
    extractLabelValueFromBlock(text, "Observação", labels) ||
    extractLabelValueFromBlock(text, "Observacao", labels);
  const operador_online = extractLabelValueFromBlock(text, "Operador Online", labels);
  const tipo_pacote_raw = extractLabelValueFromBlock(text, "Tipo de Pacote", labels);
  const desvio_loja = extractLabelValueFromBlock(text, "Desvio Loja", labels);
  const numeroReservaFallback = extractValueBeforeLabel(text, "Numero da Reserva", /([0-9-]{5,})/);
  const dataReservaFallback = extractValueBeforeLabel(
    text,
    "Data da Reserva",
    /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/
  );
  const validadeReservaFallback = extractValueBeforeLabel(
    text,
    "Validade da Reserva",
    /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/
  );

  const numeroReservaCandidate = normalizePlaceholderValue(numero_reserva);
  const dataReservaCandidate = normalizePlaceholderValue(data_reserva);
  const validadeReservaCandidate = normalizePlaceholderValue(validade_reserva);
  let numeroReservaValue =
    (numeroReservaCandidate && containsDigits(numeroReservaCandidate) ? numeroReservaCandidate : null) ||
    normalizePlaceholderValue(numeroReservaFallback) ||
    null;
  if (!numeroReservaValue) {
    const previous = findPreviousValue(lines, /numero\s+da\s+reserva/i, /([0-9-]{5,})/i);
    if (previous) {
      numeroReservaValue = normalizePlaceholderValue(previous);
    }
  }
  if (!numeroReservaValue) {
    const between = extractValueBetweenSplitLabels(
      lines,
      /^numero\s+da$/i,
      /^reserva$/i,
      /([0-9-]{5,})/i
    );
    if (between) numeroReservaValue = normalizePlaceholderValue(between);
  }
  let dataReservaValue =
    (dataReservaCandidate && containsDigits(dataReservaCandidate) ? dataReservaCandidate : null) ||
    normalizePlaceholderValue(dataReservaFallback) ||
    null;
  if (!dataReservaValue) {
    const previous = findPreviousValue(
      lines,
      /data\s+da\s+reserva/i,
      /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i
    );
    if (previous) {
      dataReservaValue = normalizePlaceholderValue(previous);
    }
  }
  if (!dataReservaValue) {
    const between = extractValueBetweenSplitLabels(
      lines,
      /^data\s+da$/i,
      /^reserva$/i,
      /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i
    );
    if (between) dataReservaValue = normalizePlaceholderValue(between);
  }
  let validadeReservaValue =
    (validadeReservaCandidate && containsDigits(validadeReservaCandidate) ? validadeReservaCandidate : null) ||
    normalizePlaceholderValue(validadeReservaFallback) ||
    null;
  if (!validadeReservaValue) {
    const previous = findPreviousValue(
      lines,
      /validade\s+da\s+reserva/i,
      /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i
    );
    if (previous) {
      validadeReservaValue = normalizePlaceholderValue(previous);
    }
  }
  if (!validadeReservaValue) {
    const between = extractValueBetweenSplitLabels(
      lines,
      /^validade\s+da$/i,
      /^reserva$/i,
      /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i
    );
    if (between) validadeReservaValue = normalizePlaceholderValue(between);
  }

  return {
    filial: normalizePlaceholderValue(filial) || null,
    carrinho_id: normalizePlaceholderValue(carrinho_id) || null,
    tipo_venda: normalizePlaceholderValue(tipo_venda) || null,
    pedido: normalizePlaceholderValue(pedido) || null,
    pedido_dinamico: normalizePlaceholderValue(pedido_dinamico) || null,
    numero_reserva: numeroReservaValue,
    vendedor_reserva: normalizePlaceholderValue(vendedor_reserva) || null,
    data_reserva: dataReservaValue,
    remarcacao: normalizePlaceholderValue(remarcacao) || null,
    validade_reserva: validadeReservaValue,
    tipo_reserva: normalizePlaceholderValue(tipo_reserva) || null,
    tabela: normalizePlaceholderValue(tabela) || null,
    observacao: normalizePlaceholderValue(observacao) || null,
    operador_online: normalizePlaceholderValue(operador_online) || null,
    tipo_pacote: sanitizeTipoPacote(tipo_pacote_raw),
    desvio_loja: normalizePlaceholderValue(desvio_loja) || null,
  };
}

function parseRoteiroOrcamento(lines: string[]) {
  if (!lines.length) return null;
  const text = lines.join(" ");
  const preco_orcamento_match = text.match(/Pre[cç]o\s+do\s+Or[cç]amento\s+em\s+R\$\s*([0-9.,]+)/i);
  const valor_total_taxas_match = text.match(/Valor\s+Total\s+das?\s+Taxas\s*:?\s*R\$\s*([0-9.,]+)/i);
  const valor_total_desconto_match = text.match(/Valor\s+Total\s+de\s+Desconto\s+por\s+Promo[cç][aã]o\s+em\s*R\$\s*([0-9.,]+)/i);
  const valor_total_match = text.match(/Valor\s+Total\s+do\s+Orcamento\s+em\s+R\$\s*([0-9.,]+)/i);
  const valor_total_match2 = text.match(/Valor\s+Total\s+do\s+Orçamento\s+em\s+R\$\s*([0-9.,]+)/i);
  const valor_ferias_match = text.match(/Valor\s+do\s+F[ÉE]RIAS\s+PROTEGIDAS\s+CVC\s+em\s*R\$\s*([0-9.,]+)/i);
  const forma_pagamento = extractLabelValueFromBlock(text, "Forma de pagamento", ["Forma de pagamento", "Plano", "Parcelas"]);
  const plano = extractLabelValueFromBlock(text, "Plano", ["Forma de pagamento", "Plano", "Parcelas"]);
  const preco_orcamento = parseCurrency(preco_orcamento_match?.[1] || null);
  const valor_total_taxas = parseCurrency(valor_total_taxas_match?.[1] || null);
  const valor_total_desconto = parseCurrency(valor_total_desconto_match?.[1] || null);
  const valor_total = parseCurrency(valor_total_match?.[1] || valor_total_match2?.[1] || null);
  const valor_ferias = parseCurrency(valor_ferias_match?.[1] || null);
  return {
    preco_orcamento: preco_orcamento ?? null,
    valor_total_taxas: valor_total_taxas ?? null,
    valor_total_desconto_promocao: valor_total_desconto ?? null,
    valor_total: valor_total ?? null,
    valor_ferias_protegidas: valor_ferias ?? null,
    forma_pagamento: normalizePlaceholderValue(forma_pagamento) || null,
    plano: normalizePlaceholderValue(plano) || null,
  };
}

function parseRoteiroPagamento(lines: string[]) {
  if (!lines.length) return null;
  const text = lines.join(" ");
  const forma = extractLabelValueFromBlock(text, "Forma de pagamento", ["Forma de pagamento", "Plano", "Parcelas"]);
  const plano = extractLabelValueFromBlock(text, "Plano", ["Forma de pagamento", "Plano", "Parcelas"]);
  const total_apurado_match = text.match(/Total\s+apurado\s*[:\-]?\s*([0-9.,]+)/i);
  const parcelas: PagamentoParcelaDraft[] = [];
  const parcelaRegex = /(\b\d{1,2}\b|Entrada|Valor)\s+([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})(?:\s+(\d{2}\/\d{2}\/\d{4}))?/gi;
  let match;
  while ((match = parcelaRegex.exec(text))) {
    parcelas.push({
      numero: match[1],
      valor: parseCurrency(match[2]) || 0,
      vencimento: match[3] ? parseDateBr(match[3]) : null,
    });
  }
  return {
    forma: normalizePlaceholderValue(forma) || null,
    plano: normalizePlaceholderValue(plano) || null,
    parcelas: parcelas.length ? parcelas : undefined,
    total_apurado: parseCurrency(total_apurado_match?.[1] || null),
  };
}

function parseRoteiroPassageiros(lines: string[]) {
  if (!lines.length) return [];
  const stopHeadings = [
    "apartmentalizacao",
    "apartamentalizacao",
    "voo cvc",
    "reserva de passagens aereas",
    "reserva de passagens aéreas",
    "politica de multa",
    "política de multa",
    "seguro online",
    "atividades",
    "regras de cancelamento",
    "quantidade de passageiros por hotel",
    "programacao do cruzeiro",
    "programação do cruzeiro",
    "orcamento",
    "orçamento",
    "pagamento",
  ];
  const passageiros: RoteiroReservaPassageiroDraft[] = [];
  let current: RoteiroReservaPassageiroDraft | null = null;

  const placeholders = new Set([
    "-",
    "—",
    "–",
    "nao",
    "não",
    "informado",
    "informada",
    "informados",
    "informadas",
  ]);
  const dateRe = /\b\d{2}\/\d{2}\/\d{4}\b/;
  const isStopHeading = (normalized: string) => stopHeadings.some((h) => normalized.startsWith(h));
  const extractSurnameSegment = (raw: string) => {
    const tokens = raw
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const collected: string[] = [];
    for (const token of tokens) {
      const normTok = normalizeText(token, { trim: true, collapseWhitespace: true });
      if (!normTok) continue;
      if (placeholders.has(normTok)) break;
      if (normTok === "cpf" || normTok === "rg" || normTok === "telefone" || normTok === "email") break;
      if (/^\d+$/.test(token)) break;
      if (token === "|") break;
      collected.push(token);
    }
    const value = collected.join(" ").replace(/\s+/g, " ").trim();
    return value || null;
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = (lines[idx] || "").trim();
    if (!line) continue;
    const normalized = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (isStopHeading(normalized)) break;
    if (normalized.includes("sobrenome") && normalized.includes("nascimento")) continue;
    if (normalized.includes("orgao") && normalized.includes("documento")) continue;
    if (normalized.includes("rg") && normalized.includes("cpf")) continue;
    if (normalized.includes("uf") && normalized.includes("documento")) continue;

    const dateMatch = line.match(dateRe);
    if (dateMatch) {
      if (current) passageiros.push(current);
      const cpfInLine = line.match(/\b\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*-?\s*\d{2}\b/);
      const before = line.slice(0, dateMatch.index).trim();
      const after = line.slice((dateMatch.index || 0) + dateMatch[0].length).trim();
      const nameTokens = before.split(/\s+/).filter(Boolean);

      let sobrenome = "";
      let nome = "";
      if (nameTokens.length <= 1) {
        nome = nameTokens[0] || "";
        const prev = (lines[idx - 1] || "").trim();
        const next = (lines[idx + 1] || "").trim();
        const prevNorm = normalizeText(prev, { trim: true, collapseWhitespace: true });
        const nextNorm = normalizeText(next, { trim: true, collapseWhitespace: true });
        const prevPart =
          prev && !dateRe.test(prev) && !isStopHeading(prevNorm) ? extractSurnameSegment(prev) : null;
        const nextPart =
          next && !dateRe.test(next) && !isStopHeading(nextNorm) ? extractSurnameSegment(next) : null;
        sobrenome = [prevPart, nextPart].filter(Boolean).join(" ").trim();
      } else {
        const splitIndex = Math.max(1, Math.ceil(nameTokens.length / 2));
        sobrenome = nameTokens.slice(0, splitIndex).join(" ");
        nome = nameTokens.slice(splitIndex).join(" ");
      }

      const restTokens = after.split(/\s+\|\s+|\s+/).filter(Boolean);
      const tailTokens = restTokens.slice(3);
      let localizador: string | null = null;
      let systur: string | null = null;
      const remaining: string[] = [];
      const locatorRegex = /^[A-Z0-9]{5,}$/;
      const systurRegex = /^[A-Z0-9-]{4,}$/;
      tailTokens.forEach((tok) => {
        if (!localizador && locatorRegex.test(tok)) {
          localizador = tok;
          return;
        }
        if (!systur && systurRegex.test(tok)) {
          systur = tok;
          return;
        }
        remaining.push(tok);
      });
      const observacaoTokens = remaining;
      current = {
        sobrenome: sobrenome || null,
        nome: nome || null,
        nascimento: parseDateBr(dateMatch[0]),
        sexo: restTokens[0] || null,
        idade: restTokens[1] || null,
        local_embarque: restTokens[2] || null,
        localizador: normalizePlaceholderValue(localizador) || null,
        systur: normalizePlaceholderValue(systur) || null,
        observacao: observacaoTokens.join(" ").trim() || null,
      };
      if (cpfInLine) {
        current.documento_tipo = "CPF";
        current.documento_numero = cpfInLine[0].replace(/\D/g, "");
      }
      continue;
    }

    if (!current) continue;
    const cpfMatch = line.match(/\b\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*-?\s*\d{2}\b/);
    if (cpfMatch) {
      current.documento_tipo = "CPF";
      current.documento_numero = cpfMatch[0].replace(/\D/g, "");
    }
    const cpfNumericMatch = line.match(/\bCPF\b[^0-9]{0,20}(\d{11})\b/i);
    if (cpfNumericMatch?.[1]) {
      current.documento_tipo = "CPF";
      current.documento_numero = cpfNumericMatch[1];
    }
    const rgMatch = line.match(/\bRG\b[^0-9]*([0-9.\-]{3,})/i);
    if (rgMatch?.[1]) current.rg = rgMatch[1];
    const telefoneMatch = line.match(/\b(\+?\d{2}\s*)?\d{4,5}[-\s]?\d{4}\b/);
    if (telefoneMatch && !current.telefone) current.telefone = telefoneMatch[0].trim();
    const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) current.email = emailMatch[0];
    const locMatch = line.match(/localizador\s*[:\-]?\s*([A-Z0-9]{5,})/i);
    if (locMatch?.[1]) current.localizador = locMatch[1];
    const systurMatch = line.match(/systur\s*[:\-]?\s*([A-Z0-9-]{3,})/i);
    if (systurMatch?.[1]) current.systur = systurMatch[1];
    if (/pais/i.test(line) && /\bBR\b/.test(line)) {
      current.pais_emissao = "BR";
    }
  }
  if (current) passageiros.push(current);
  return passageiros;
}

function parseRoteiroFornecedores(lines: string[], descricaoRoteiro?: string | null) {
  if (!lines.length) return [];
  const fornecedores: RoteiroReservaFornecedorDraft[] = [];
  const descricaoNorm = normalizeText(descricaoRoteiro || "");
  const ignoreProtecao = descricaoNorm.includes("protecao aerea");

  const headerIdx = lines.findIndex((line) => {
    const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
    return norm.includes("numero do acordo") && (norm.includes("categoria") || norm.includes("trecho"));
  });
  if (headerIdx >= 0 && lines[headerIdx]) {
    let headerCols = splitTableLine(lines[headerIdx]);
    if (headerCols.length) {
      const firstDataCols = (() => {
        for (let i = headerIdx + 1; i < lines.length; i += 1) {
          const candidate = (lines[i] || "").trim();
          if (!candidate) continue;
          const cols = splitTableLine(candidate);
          if (cols.length >= 2) return cols;
        }
        return null;
      })();

      // Em alguns layouts, o cabeçalho vem com uma primeira coluna apenas informativa
      // ("Hotel", "Receptivo", etc) e as linhas não trazem esse valor.
      if (firstDataCols && headerCols.length === firstDataCols.length + 1) {
        const firstHeaderNorm = normalizeText(headerCols[0] || "", { trim: true, collapseWhitespace: true });
        const secondHeaderNorm = normalizeText(headerCols[1] || "", { trim: true, collapseWhitespace: true });
        if (isGenericServicoLabel(firstHeaderNorm) && secondHeaderNorm.includes("numero do acordo")) {
          headerCols = headerCols.slice(1);
        }
      }

      const headerNorms = headerCols.map((col) => normalizeText(col, { trim: true, collapseWhitespace: true }));
      const hotelHeaderIdxs = headerNorms.map((norm, idx) => (norm === "hotel" ? idx : -1)).filter((idx) => idx >= 0);
      const idxHotelNome = hotelHeaderIdxs.length ? hotelHeaderIdxs[hotelHeaderIdxs.length - 1] : -1;
      const receptivoHeaderIdxs = headerNorms
        .map((norm, idx) => (norm === "receptivo" ? idx : -1))
        .filter((idx) => idx >= 0);
      const idxReceptivoNome = receptivoHeaderIdxs.length
        ? receptivoHeaderIdxs[receptivoHeaderIdxs.length - 1]
        : -1;
      const tipoServicoDefault = idxHotelNome >= 0 ? "Hotel" : idxReceptivoNome >= 0 ? "Receptivo" : null;

      const idxAcordo = findColumnIndex(headerCols, ["Número do Acordo", "Numero do Acordo", "Acordo"]);
      const idxTipo = findColumnIndex(headerCols, ["Tipo de serviço", "Tipo do servico", "Tipo de Servico"]);
      const idxCidade = findColumnIndex(headerCols, ["Cidade"]);
      const idxCategoria = findColumnIndex(headerCols, ["Categoria"]);
      const idxServico = findColumnIndex(headerCols, ["Serviço", "Servico", "Tipo de Diária", "Tipo de Diaria"]);
      const idxDataInicial = findColumnIndex(headerCols, ["Data Inicial", "Data inicial", "Inicio"]);
      const idxDataFinal = findColumnIndex(headerCols, ["Data Final", "Data final", "Fim"]);
      const idxTransporte = findColumnIndex(headerCols, ["Transporte Aéreo", "Transporte Aereo", "Cia Aérea"]);
      const idxTrecho = findColumnIndex(headerCols, ["Trecho"]);
      const idxNomeBase = findColumnIndex(headerCols, ["Fornecedor", "Nome"]);
      const idxNomePreferencial =
        idxHotelNome >= 0 ? idxHotelNome : idxReceptivoNome >= 0 ? idxReceptivoNome : idxNomeBase;

      for (let i = headerIdx + 1; i < lines.length; i += 1) {
	        const line = lines[i].trim();
	        if (!line) continue;
	        const cols = splitTableLine(line);
	        if (cols.length < 2) {
	          const last = fornecedores[fornecedores.length - 1];
	          if (last) {
	            const lineNoPipes = line.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
	            const dates = lineNoPipes.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
	            if (dates.length) {
	              if (!last.data_inicial) last.data_inicial = parseDateBr(dates[0]);
	              if (!last.data_final) last.data_final = parseDateBr(dates[1] || dates[0]);
	            }
	            const extraRaw = lineNoPipes
	              .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, "")
	              .replace(/\s+/g, " ")
	              .trim();
	            const extra = normalizeServicoNome(extraRaw) || normalizePlaceholderValue(extraRaw) || null;
	            if (extra) {
	              const append = (prev?: string | null) => {
	                const base = (prev || "").trim();
	                if (!base) return extra;
	                if (base.includes(extra)) return prev || null;
	                return `${base} ${extra}`.trim();
	              };
	              last.servico = append(last.servico);
	              last.descricao = append(last.descricao);
	            }
	          }
	          continue;
	        }

        const nomeCol =
          idxNomePreferencial >= 0 && cols[idxNomePreferencial]
            ? cols[idxNomePreferencial]
            : cols[idxNomeBase >= 0 ? idxNomeBase : idxServico >= 0 ? idxServico : 0] || "";
        const tipoServicoCol = idxTipo >= 0 ? cols[idxTipo] : "";
        const cidade = idxCidade >= 0 ? cols[idxCidade] : "";
        const categoria = idxCategoria >= 0 ? cols[idxCategoria] : "";
        const servico = idxServico >= 0 ? cols[idxServico] : "";
        const dataInicial = idxDataInicial >= 0 ? cols[idxDataInicial] : "";
        const dataFinal = idxDataFinal >= 0 ? cols[idxDataFinal] : "";
        const numeroAcordo = idxAcordo >= 0 ? cols[idxAcordo] : "";
        const transporteCol = idxTransporte >= 0 ? cols[idxTransporte] : "";
        const trechoCol = idxTrecho >= 0 ? cols[idxTrecho] : "";

        const hotelColumnName =
          findHotelNameInTableRow(cols) ||
          (idxCidade >= 0 ? findHotelNameBeforeCityColumn(cols, headerCols, idxCidade) : null);
        const tipoServicoNorm = normalizeText(tipoServicoCol || tipoServicoDefault || nomeCol || "");
        let numeroAcordoFinal = normalizePlaceholderValue(numeroAcordo) || null;
        let categoriaFinal = normalizePlaceholderValue(categoria) || null;
        const categoriaNumero = normalizeMaybeNumero(categoriaFinal);
        if (!numeroAcordoFinal && categoriaNumero) {
          numeroAcordoFinal = categoriaNumero;
          categoriaFinal = null;
        }
        const isAereo =
          Boolean(idxTransporte >= 0 || idxTrecho >= 0) ||
          tipoServicoNorm.includes("aereo") ||
          tipoServicoNorm.includes("aéreo");

        if (
          ignoreProtecao &&
          normalizeText(`${nomeCol} ${servico} ${categoria} ${tipoServicoCol}`).includes("protecao aerea")
        ) {
          continue;
        }

        if (isAereo) {
          let transporte = normalizePlaceholderValue(transporteCol) || null;
          if (!transporte && nomeCol && !isGenericServicoLabel(nomeCol)) {
            transporte = normalizePlaceholderValue(nomeCol);
          }
          const categoriaNorm = normalizeText(categoriaFinal || "");
          const servicoNorm = normalizeText(servico || "");
          if (!transporte && categoriaFinal && /azul|latam|gol|avianca/.test(categoriaNorm)) {
            transporte = categoriaFinal;
            if (servicoNorm.includes("classe") || servicoNorm.includes("tarifa") || servicoNorm.includes("turist")) {
              categoriaFinal = normalizePlaceholderValue(servico) || null;
            }
          } else if (!transporte && servico && /azul|latam|gol|avianca/.test(servicoNorm)) {
            transporte = normalizePlaceholderValue(servico) || null;
          }
          const nomeFinal = normalizePlaceholderValue(hotelColumnName || nomeCol) || null;
          fornecedores.push({
            nome: nomeFinal,
            numero_acordo: numeroAcordoFinal,
            tipo_servico: normalizePlaceholderValue(tipoServicoCol) || "Transporte Aéreo",
            transporte_aereo: transporte,
            categoria: categoriaFinal,
            trecho: normalizePlaceholderValue(trechoCol) || null,
            data_inicial: parseDateBr(dataInicial),
            data_final: parseDateBr(dataFinal),
            descricao: normalizeServicoNome(servico),
            hotel_nome: hotelColumnName ? hotelColumnName.trim() : null,
          });
          continue;
        }

        let nomeFornecedor = normalizePlaceholderValue(hotelColumnName || nomeCol) || null;
        const servicoNorm = normalizeServicoNome(servico);
        if (nomeFornecedor && isGenericServicoLabel(nomeFornecedor) && servicoNorm) {
          nomeFornecedor = servicoNorm;
        }

        fornecedores.push({
          nome: nomeFornecedor,
          numero_acordo: numeroAcordoFinal,
          tipo_servico: normalizePlaceholderValue(tipoServicoCol) || tipoServicoDefault,
          cidade: normalizePlaceholderValue(cidade) || null,
          categoria: categoriaFinal,
          servico: servicoNorm,
          data_inicial: parseDateBr(dataInicial),
          data_final: parseDateBr(dataFinal),
          descricao: servicoNorm,
          hotel_nome: hotelColumnName ? hotelColumnName.trim() : null,
        });
      }
    }
  }

  if (fornecedores.length) return fornecedores;

  const buffer: string[] = [];
  let currentTipo: string | null = null;
  function flushWithLine(line: string) {
    const datePair = line.match(/(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/);
    if (!datePair) return;
    const data_inicial = parseDateBr(datePair[1]);
    const data_final = parseDateBr(datePair[2]);
    const before = line.split(datePair[1])[0] || line;
    const numberMatch = before.match(/\b\d{5,}\b/);
    const numero_acordo = numberMatch?.[0] || null;
    const trechoMatch = line.match(/\b[A-Z]{3}\s*\/\s*[A-Z]{3}\b/);
    const isAereo = (currentTipo && normalizeText(currentTipo).includes("aereo")) || Boolean(trechoMatch);
    const descricao = buffer.join(" ").replace(/\s+/g, " ").trim() || null;
    const nameCandidate =
      buffer.find((b) => /[A-Za-zÀ-ÿ]/.test(b) && !/\d/.test(b)) ||
      before.replace(numero_acordo || "", "").trim();
    const servicoCandidate = buffer.find((b) => b.trim().startsWith("-"))?.replace(/^-+\s*/, "") || null;
    buffer.length = 0;

    if (isAereo) {
      const airlineMatch = line.match(/\b\d{5,}\b\s+([A-Za-zÀ-ÿ0-9 .-]+?)\s+\d{5,}/);
      const categoriaMatch = line.match(/\b([A-Za-z0-9]{3,})\s*-\s*[A-Z]{3}\s*\/\s*[A-Z]{3}/);
      fornecedores.push({
        nome: currentTipo || "Transporte Aéreo",
        numero_acordo,
        tipo_servico: "Transporte Aéreo",
        transporte_aereo: normalizePlaceholderValue(airlineMatch?.[1]) || null,
        categoria: normalizePlaceholderValue(categoriaMatch?.[1]) || null,
        trecho: trechoMatch?.[0]?.replace(/\s+/g, "") || null,
        data_inicial,
        data_final,
        descricao,
      });
      return;
    }

    const cityMatch = descricao?.match(/BR\s*-\s*[A-Z]{2}\s*-\s*([A-Za-zÀ-ÿ\s]+)/i);
    const cidade = cityMatch?.[1]?.trim() || null;

    if (ignoreProtecao && normalizeText(servicoCandidate || descricao || "").includes("protecao aerea")) {
      return;
    }

    fornecedores.push({
      nome: normalizePlaceholderValue(nameCandidate) || null,
      numero_acordo,
      tipo_servico: currentTipo || null,
      cidade,
      servico: normalizePlaceholderValue(servicoCandidate) || null,
      data_inicial,
      data_final,
      descricao,
    });
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (norm.includes("numero do acordo")) continue;
    if (norm.includes("categoria/tipo") || norm.includes("categoria/trecho")) continue;
    if (norm === "hotel" || norm.startsWith("hotel ")) currentTipo = "Hotel";
    if (norm === "transporte aereo" || norm.startsWith("transporte aereo")) currentTipo = "Transporte Aéreo";
    if (norm === "receptivo" || norm.startsWith("receptivo")) currentTipo = "Receptivo";
    if (norm === "servicos" || norm === "servicos" || norm.startsWith("servi")) currentTipo = "Serviços";
    if (norm === "atividades" || norm.startsWith("atividades")) currentTipo = "Atividades";
    if (norm === "ingressos" || norm.startsWith("ingressos")) currentTipo = "Ingressos";

    const hasDatePair = /\d{2}\/\d{2}\/\d{4}.*\d{2}\/\d{2}\/\d{4}/.test(line);
    if (hasDatePair) {
      flushWithLine(line);
      continue;
    }
    buffer.push(line);
  }
  return fornecedores;
}

const SECTION_HEADER_CAPTURE_RE =
  /(?:^|\n)\s*(\d+)(?:\.\d+)?\s*(?:[-–.]|\s+(?:DO|DA|DE|DOS|DAS))\s*[A-ZÀ-Ü]/g;
const CONTRATANTE_SECTION_RE = /(?:^|\n)\s*1\s*(?:\.\s*2)?\s*[-–.]?\s*CONTRATANTE\b/i;
const SERVICOS_SECTION_RE = /(?:^|\n)\s*3\.?\s*[-–.]?\s*DOS\s+SERVI[CÇ]OS\s+PRESTADOS?\b/i;
const PAGAMENTO_SECTION_RE =
  /(?:^|\n)\s*5\.?\s*[-–.]?\s*VALOR\s+E\s+FORMA\s+DE\s+PAGAMENTOS?\b/i;

function sliceSection(text: string, startRegex: RegExp) {
  const match = text.match(startRegex);
  if (!match || typeof match.index !== "number") return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const majorMatch = match[0].match(/\d+/);
  const major = majorMatch ? Number(majorMatch[0]) : null;
  if (!major) return rest.trim();

  SECTION_HEADER_CAPTURE_RE.lastIndex = 0;
  let endIndex = rest.length;
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = SECTION_HEADER_CAPTURE_RE.exec(rest))) {
    const headerMajor = Number(headerMatch[1]);
    if (headerMajor && headerMajor !== major) {
      endIndex = headerMatch.index;
      break;
    }
  }
  return rest.slice(0, endIndex).trim();
}

function normalizeContratoNumero(value?: string | null) {
  if (!value) return "";
  const normalized = value
    .replace(/[–—‑‐‒―−﹣－]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^\d-]/g, "");
  return normalized;
}

function extractContratante(text: string): ContratanteDraft | null {
  const cleaned = cleanText(text);
  const inline = cleaned.replace(/\n+/g, " ");
  const clienteMatch = inline.match(
    /C\s*L\s*I\s*E\s*N\s*T\s*E\s*:\s*([^,]+?)(?=,\s*(?:R\s*G|C\s*P\s*F)|\s+R\s*G|\s+C\s*P\s*F|\s+residente\b|$)/i
  );
  const nome = (clienteMatch?.[1] || "").trim();
  const cpfRegex = /C\s*P\s*F[^0-9]{0,15}([0-9]{3}\s*\.?\s*[0-9]{3}\s*\.?\s*[0-9]{3}\s*-?\s*[0-9]{2})/i;
  const cpfMatch = inline.match(cpfRegex);
  const cpfFallback = inline.match(/\b\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*-?\s*\d{2}\b/);
  const rgMatch = inline.match(/R\s*G\s*(?:n[º°o\.]?)?\s*[:.-]?\s*([0-9][0-9.\-]{3,})/i);
  if (!nome && !cpfMatch && !cpfFallback) return null;

  const cepMatch = inline.match(/CEP\s*:?[\s-]*([0-9]{5}-?[0-9]{3})/i);
  const bairroMatch = inline.match(/Bairro\s*:?[\s-]*([^,]+?)(?=,?\s*(Cidade|UF|CEP|$))/i);
  const cidadeMatch = inline.match(/Cidade\s*:?[\s-]*([^,]+?)(?=,?\s*(UF|CEP|$))/i);
  const ufMatch = inline.match(/UF\s*:?[\s-]*([A-Z]{2})/i);

  const enderecoMatch = inline.match(/residente\s+na\s+(.+?)(?=Bairro:|Cidade:|UF:|CEP:|$)/i);
  const enderecoBlock = enderecoMatch?.[1]?.trim() || "";
  let endereco = enderecoBlock || null;
  let numero: string | null = null;
  if (enderecoBlock) {
    const numMatch = enderecoBlock.match(/(?:^|,|\s)(?:n[ºo°]?|n\.|numero)\s*([0-9]{1,6}[A-Za-z0-9-]*)/i);
    if (numMatch?.[1]) {
      numero = numMatch[1].replace(/\D/g, "") || numMatch[1].trim();
      if (typeof numMatch.index === "number") {
        endereco = enderecoBlock.slice(0, numMatch.index).replace(/[,\s-]+$/g, "").trim() || null;
      }
    }
  }
  if (!numero) {
    const numFallback = inline.match(/residente\s+na[\s\S]{0,120}?(?:n[ºo°]?|n\.|numero)\s*([0-9]{1,6}[A-Za-z0-9-]*)/i);
    if (numFallback?.[1]) numero = numFallback[1].replace(/\D/g, "") || numFallback[1].trim();
  }

  return {
    nome: nome,
    cpf: ((cpfMatch?.[1] || cpfFallback?.[0]) || "").replace(/\D/g, ""),
    rg: rgMatch?.[1]?.trim() || null,
    endereco,
    numero,
    bairro: bairroMatch?.[1]?.trim() || null,
    cidade: cidadeMatch?.[1]?.trim() || null,
    uf: ufMatch?.[1]?.trim() || null,
    cep: cepMatch?.[1]?.trim() || null,
  };
}

function extractPassageiros(text: string): PassageiroDraft[] {
  const cleaned = cleanText(text);
  const sectionMatch = cleaned.match(
    /NOME DO(?:S)? PASSAGEIRO(?:S)?([\s\S]*?)(?:\n4\.|\n4\s+DO PRECO|\n4\s+DO PREÇO|\n4\s+DO PRECO|\n4\s+DO PREÇO)/i
  );
  const section = sectionMatch?.[1] || cleaned;

  function sanitizePassengerName(value: string) {
    const cleanedName = (value || "")
      .replace(/#.+?#/g, " ")
      .replace(/\d+/g, " ")
      .replace(/[|]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!cleanedName) return "";
    const normalized = normalizeText(cleanedName, { trim: true, collapseWhitespace: true });
    if (normalized.includes("nome") && normalized.includes("documento")) return "";
    if (normalized.includes("dt nasc") || normalized.includes("dt.nasc")) return "";
    if (normalized.includes("passageiro")) return "";
    if (normalized.includes("rubrica")) return "";
    return cleanedName;
  }

  function splitWordsIntoParts(words: string[], parts: number) {
    if (parts <= 1) return [words.join(" ").trim()];
    const result: string[] = [];
    let start = 0;
    const connectors = new Set(["da", "de", "do", "dos", "das"]);
    for (let i = 0; i < parts; i += 1) {
      const remainingWords = words.length - start;
      const remainingParts = parts - i;
      let size = Math.ceil(remainingWords / remainingParts);
      if (size <= 0) size = 1;
      let end = start + size;
      if (end < words.length) {
        const lastWord = normalizeText(words[end - 1], { trim: true, collapseWhitespace: true });
        if (connectors.has(lastWord) && end - 1 > start) {
          end -= 1;
        }
      }
      result.push(words.slice(start, end).join(" ").trim());
      start = end;
    }
    while (result.length < parts) result.push("");
    return result;
  }

  const lines = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => normalizeText(line).includes("nome documento"));
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  const cpfRegex = /\b\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*-?\s*\d{2}\b/g;
  const dateRegex = /\b\d{2}\/\d{2}\/\d{4}\b/g;
  const pipeRegex = /([^|\n]+)\|\s*(\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*-?\s*\d{2})\s*(\d{2}\/\d{2}\/\d{4})/g;

  const passengers: PassageiroDraft[] = [];
  const pendingNameLines: string[] = [];

  for (let i = 0; i < dataLines.length; i += 1) {
    const line = dataLines[i];
    const normalized = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (!line || normalized.includes("nome documento")) continue;
    if (normalized.includes("nome do passageiro") || normalized.includes("nome dos passageiros")) continue;

    const lineHasCpf = cpfRegex.test(line);
    cpfRegex.lastIndex = 0;
    if (!lineHasCpf) {
      if (!/\d/.test(line)) pendingNameLines.push(line);
      continue;
    }

    const startsWithDigit = /^\d/.test(line.trim());
    if (line.includes("|") && !startsWithDigit) {
      let match: RegExpExecArray | null;
      pipeRegex.lastIndex = 0;
      while ((match = pipeRegex.exec(line))) {
        const nome = sanitizePassengerName(match[1] || "");
        const cpf = (match[2] || "").replace(/\D/g, "");
        const nascimento = match[3] ? parseDateBr(match[3]) : null;
        if (nome && cpf.length === 11) {
          passengers.push({ nome, cpf, nascimento });
        }
      }
      pendingNameLines.length = 0;
      continue;
    }

    const cpfMatches = Array.from(line.matchAll(cpfRegex));
    const dateMatches = Array.from(line.matchAll(dateRegex));
    const count = cpfMatches.length;
    if (!count) continue;

    let nameParts: string[] = [];
    if (pendingNameLines.length) {
      const words = pendingNameLines.join(" ").split(/\s+/).filter(Boolean);
      nameParts = splitWordsIntoParts(words, count).map((p) => sanitizePassengerName(p));
    } else {
      for (let idx = 0; idx < count; idx += 1) {
        const start = idx === 0 ? 0 : (cpfMatches[idx - 1].index ?? 0) + (cpfMatches[idx - 1][0] || "").length;
        const end = cpfMatches[idx].index ?? line.length;
        nameParts.push(sanitizePassengerName(line.slice(start, end)));
      }
    }

    const nextLine = dataLines[i + 1] || "";
    if (nextLine && !/\d/.test(nextLine)) {
      const suffixWords = nextLine.split(/\s+/).filter(Boolean);
      const suffixParts = splitWordsIntoParts(suffixWords, count);
      nameParts = nameParts.map((name, idx) => {
        const combined = `${name} ${suffixParts[idx] || ""}`.trim();
        return sanitizePassengerName(combined);
      });
      i += 1;
    }

    for (let idx = 0; idx < count; idx += 1) {
      const cpf = (cpfMatches[idx]?.[0] || "").replace(/\D/g, "");
      const dateStr = dateMatches[idx]?.[0] || "";
      const nome = sanitizePassengerName(nameParts[idx] || "");
      if (!nome || cpf.length !== 11) continue;
      passengers.push({
        nome,
        cpf,
        nascimento: dateStr ? parseDateBr(dateStr) : null,
      });
    }
    pendingNameLines.length = 0;
  }

  if (passengers.length === 0) {
    const fallbackRegex = /([A-ZÀ-ÿ'\s]{3,})\s+([0-9.\-]{11,14})\s+(\d{2}\/\d{2}\/\d{4})/g;
    let match;
    while ((match = fallbackRegex.exec(section))) {
      const nome = match[1].replace(/\s+/g, " ").trim();
      if (!nome) continue;
      const nomeNorm = normalizeText(nome);
      if (nomeNorm.includes("nome") || nomeNorm.includes("documento")) continue;
      const cpf = match[2].replace(/\D/g, "");
      if (cpf.length !== 11) continue;
      passengers.push({
        nome,
        cpf,
        nascimento: parseDateBr(match[3]),
      });
    }
  }
  // remove duplicates by CPF
  const seen = new Set<string>();
  return passengers.filter((p) => {
    const key = p.cpf;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const HOTEL_TIPO_PRIORITY = [
  { keyword: "resort", label: "Resort" },
  { keyword: "pousada", label: "Pousada" },
  { keyword: "hotel", label: "Hotel" },
];

const SERVICO_NOISE_KEYWORDS = [
  "pagamento",
  "parcelas",
  "juros",
  "cobranca",
  "cobrancas",
  "correccao",
  "honorario",
  "honorarios",
  "inscricao",
  "restritivos",
  "credito",
  "contratante",
  "cliente",
  "multa",
  "financiamento",
];
const SERVICE_CLAUSE_LINE_RE = /^\.?\d+(?:\.\d+)*[\s\-–\.:]/;
const SERVICE_DATE_LINE_RE = /^\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/;

function inferHotelTipo(normalizedLines: string[], hotelName?: string | null) {
  const parts = [...normalizedLines];
  if (hotelName) {
    parts.push(normalizeText(hotelName, { trim: true, collapseWhitespace: true }));
  }
  const haystack = parts.join(" ");
  for (const item of HOTEL_TIPO_PRIORITY) {
    if (haystack.includes(item.keyword)) return item.label;
  }
  return null;
}

function isServicoNoiseLine(normalized: string) {
  if (!normalized) return true;
  if (normalized.startsWith("tipo acomod")) return true;
  if (normalized.startsWith("pago por")) return true;
  if (/^nr\b/.test(normalized)) return true;
  if (/^\[?res\d{3,}/.test(normalized)) return true;
  if (SERVICE_DATE_LINE_RE.test(normalized)) return true;
  if (SERVICE_CLAUSE_LINE_RE.test(normalized) && normalized.length > 60) return true;
  if (
    normalized.length > 60 &&
    SERVICO_NOISE_KEYWORDS.some((keyword) => normalized.includes(keyword))
  ) {
    return true;
  }
  return false;
}

function isHotelCandidateLine(normalized: string) {
  if (!normalized) return false;
  if (normalized.includes("hotel")) return true;
  if (normalized.includes("pousada")) return true;
  if (normalized.includes("resort")) return true;
  if (normalized.includes("flat")) return true;
  if (normalized.includes("hospedagem")) return true;
  if (normalized.includes("diaria")) return true;
  return false;
}

function findHotelNameInTableRow(cols: string[]) {
  const keywords = ["hotel", "resort", "pousada", "flat", "suite", "suíte", "villa", "palace", "spa"];
  for (const col of cols) {
    if (!col) continue;
    const normalized = normalizeText(col, { trim: true, collapseWhitespace: true });
    if (!normalized) continue;
    if (!keywords.some((keyword) => normalized.includes(keyword))) continue;
    if (/^\d+$/.test(normalized.replace(/\s+/g, ""))) continue;
    return col.trim();
  }
  return null;
}

function findHotelNameBeforeCityColumn(
  cols: string[],
  headers: string[],
  cityIdx: number
) {
  if (cityIdx <= 0 || cityIdx >= cols.length) return null;
  const candidate = cols[cityIdx - 1]?.trim();
  if (!candidate) return null;
  const normalized = normalizeText(candidate, { trim: true, collapseWhitespace: true });
  if (!normalized) return null;
  if (/^\d+$/.test(normalized.replace(/\s+/g, ""))) return null;
  const cityValue = cols[cityIdx] || "";
  const normalizedCity = normalizeText(cityValue, { trim: true, collapseWhitespace: true });
  if (normalized && normalized === normalizedCity && normalizedCity) return null;
  const headerLabel = headers[cityIdx - 1] || "";
  const headerNorm = normalizeText(headerLabel, { trim: true, collapseWhitespace: true });
  const headerBlocklist = [
    "categoria",
    "tipo",
    "tipo de",
    "servico",
    "serviços",
    "data",
    "inicio",
    "fim",
    "periodo",
    "valor",
    "trecho",
    "acomod"
  ];
  if (headerNorm && headerBlocklist.some((keyword) => headerNorm.includes(keyword))) {
    return null;
  }
  if (isGenericServicoLabel(candidate)) return null;
  return candidate;
}

function isFlightLineNormalized(normalized: string) {
  if (!normalized) return false;
  return (
    normalized.includes("transporte aereo") ||
    normalized.includes("passagem aerea") ||
    /\baereo\b/.test(normalized) ||
    /\bvoo\b/.test(normalized) ||
    /\bvoando\b/.test(normalized) ||
    normalized.includes("airlines") ||
    normalized.includes("latam") ||
    /\bgol\b/.test(normalized) ||
    normalized.includes("azul")
  );
}

function cleanHotelName(line: string) {
  if (!line) return "";
  let cleaned = line
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00bf/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned.replace(/SERVI[\u00c7C]OS INCLUSOS/i, "").trim();
  cleaned = cleaned.replace(/^(?:\d+\s*)?DI[\u00c1A]RIAS?\s+(?:NO|NA|EM)\s+/i, "");
  cleaned = cleaned.replace(/^(?:HOSPEDAGEM|ESTADIA)\s+(?:NO|NA|EM)\s+/i, "");

  const dashParts = cleaned.split(/\s+-\s+/);
  if (dashParts.length > 1) {
    const rightNormalized = normalizeText(dashParts.slice(1).join(" "), {
      trim: true,
      collapseWhitespace: true,
    });
    const dashMarkers = [
      "quarto",
      "apartamento",
      "acomod",
      "todos os apartamentos",
      "os quartos",
      "uma cama",
      "ar condicionado",
      "frigobar",
      "banheiro",
      "cafe da manha",
      "acordo cvc",
      "tarifa",
      "nao reembolsavel",
      "hs - tarifa",
      "luxo",
      "promocional",
      "suite",
    ];
    if (dashMarkers.some((marker) => rightNormalized.includes(marker))) {
      cleaned = dashParts[0].trim();
    }
  }

  const parenIndex = cleaned.indexOf("(");
  if (parenIndex > 0) {
    cleaned = cleaned.slice(0, parenIndex).trim();
  }

  const hardStopPatterns = [
    /\s+tipo\s+acomod/i,
    /\s+pago\s+por/i,
    /\s+nr\s*:?/i,
    /\s+\[res/i,
    /\s+res\d{3,}/i,
  ];
  for (const pattern of hardStopPatterns) {
    const match = cleaned.match(pattern);
    if (match && typeof match.index === "number" && match.index > 0) {
      cleaned = cleaned.slice(0, match.index).trim();
    }
  }

  return cleaned.replace(/[.,;:\-]+$/g, "").trim();
}

function extractProdutoPrincipal(text: string): { nome: string | null; tipo: string | null; detalhes: string | null } {
  const cleaned = cleanText(text);
  const sectionMatch = cleaned.match(
    /SERVI[ÇC]OS INCLUSOS([\s\S]*?)(?:NOME DOS PASSAGEIROS|4\.|4\s+DO PRE[ÇC]O|5\.|VALOR E FORMA|$)/i
  );
  const section = sectionMatch?.[1] || cleaned;
  const normalized = section
    .replace(/[•·]/g, "\n")
    .replace(/[¿]/g, " - ")
    .replace(/\u2022/g, "\n")
    .replace(/SERVI[Ã‡C]OS INCLUSOS/gi, "");
  const lines = normalized
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const detalhes = lines.length ? lines.join("\n") : null;
  const normalizedLines = lines.map((line) => normalizeText(line, { trim: true, collapseWhitespace: true }));

  const firstServicoLine = (() => {
    for (let i = 0; i < lines.length; i += 1) {
      const norm = normalizedLines[i] || "";
      if (!norm) continue;
      if (isServicoNoiseLine(norm)) continue;
      return cleanServiceProductLine(lines[i]);
    }
    return cleanServiceProductLine(lines[0] || "");
  })();

  const seguroKeywords = [
    "inter basico",
    "inter top",
    "inter plus",
    "inter prime",
    "inter diamante",
    "maritimo inter",
    "maritimo nacional",
    "nacional plus",
    "nacional top",
    "receptivo top",
    "receptivo plus",
    "receptivo prime",
    "on trip",
  ];
  const hasSeguro = normalizedLines.some((line) => seguroKeywords.some((k) => line.includes(k)));
  if (hasSeguro) {
    const seguroNome = firstServicoLine || lines.find((line) => normalizeText(line).includes("seguro")) || "Seguro Viagem";
    return { nome: seguroNome, tipo: "Seguro viagem", detalhes };
  }

  const ingressoLineIdx = normalizedLines.findIndex((line) => line.includes("ingresso"));
  if (ingressoLineIdx >= 0) {
    return { nome: lines[ingressoLineIdx], tipo: "Ingressos", detalhes };
  }

  const carKeywords = ["locacao", "locadora", "veiculo", "km livre", "km", "locação", "locadora"];
  const hasCar = normalizedLines.some((line) => carKeywords.some((k) => line.includes(k)));
  if (hasCar) {
    const carLine =
      lines.find((line) => /^[A-Z0-9]{3,5}\s*-\s*/.test(line.trim())) ||
      lines.find((line) => carKeywords.some((k) => normalizeText(line).includes(k)));
    const carName = cleanServiceProductLine(carLine || "");
    return { nome: carName || carLine || firstServicoLine || "Locação de Veículo", tipo: "Aluguel de Carro", detalhes };
  }


  let hotelLine: string | null = null;
  for (let i = 0; i < normalizedLines.length; i += 1) {
    const normalizedLine = normalizedLines[i];
    if (isServicoNoiseLine(normalizedLine)) continue;
    if (isHotelCandidateLine(normalizedLine)) {
      hotelLine = lines[i] || null;
      break;
    }
  }

  let hotelName = hotelLine ? cleanHotelName(hotelLine) : "";
  if (!hotelName) {
    const diarioMatch = section.match(
      /(?:\d+\s*)?DI[\u00c1A]RIAS?\s+(?:NO|NA|EM)\s+([^\n]+)/i
    );
    if (diarioMatch?.[1]) {
      hotelName = cleanHotelName(diarioMatch[1]);
    }
  }
  const hotelTipo = inferHotelTipo(normalizedLines, hotelName) || "Hotel";

  const hasFlight = normalizedLines.some((line) => isFlightLineNormalized(line));
  const hasTransfer = normalizedLines.some((line) =>
    line.includes("transfer") || line.includes("traslado") || line.includes("transporte")
  );
  const hasPasseio = normalizedLines.some((line) =>
    line.includes("passeio") || line.includes("tour") || line.includes("excursao")
  );
  if (hasFlight && !hotelName) {
    return { nome: firstServicoLine || "Transporte Aéreo", tipo: "Transporte Aéreo", detalhes };
  }
  if ((hasTransfer || hasPasseio) && !hotelName && !hasFlight) {
    const label = hasTransfer && hasPasseio ? "Traslado(s) + Passeio(s)" : hasTransfer ? "Traslado(s)" : "Passeio(s)";
    return { nome: firstServicoLine || label, tipo: "Serviços", detalhes };
  }
  if (hotelName && hasFlight) {
    return { nome: hotelName, tipo: "Hotel + A?reo", detalhes };
  }

  for (const line of lines) {
    const match = line.match(/DI[ÁA]RIAS?\s+(?:NO|NA|EM)\s+(.+)/i);
    if (match?.[1]) {
      const name = cleanHotelName(match[1]);
      if (name) return { nome: name, tipo: hotelTipo, detalhes };
    }
  }

  if (hotelName) {
    return { nome: hotelName, tipo: hotelTipo, detalhes };
  }

  const firstLine = lines.find((line) => {
    const norm = normalizeText(line);
    if (norm.startsWith("tipo acomod")) return false;
    if (norm.startsWith("pago por")) return false;
    if (norm.startsWith("nr")) return false;
    return true;
  });

  return { nome: firstServicoLine || firstLine || null, tipo: null, detalhes };
}

function cleanServiceProductLine(line: string) {
  if (!line) return "";
  let cleaned = line.replace(/\s+/g, " ").trim();
  const stopPatterns = [
    /-\s*benef/i,
    /-\s*tipo\s+acomod/i,
    /-\s*pago\s+por/i,
    /\[\s*res/i,
  ];
  for (const pattern of stopPatterns) {
    const match = cleaned.match(pattern);
    if (match && typeof match.index === "number") {
      cleaned = cleaned.slice(0, match.index).trim();
      break;
    }
  }
  return cleaned.replace(/[,\-]+$/g, "").trim();
}

function extractPagamentos(text: string): { pagamentos: PagamentoDraft[]; total_pago?: number | null; desconto_comercial?: number | null; total_bruto?: number | null; taxas?: number | null } {
  const cleaned = cleanText(text);
  const pagamentos: PagamentoDraft[] = [];
  const totalMatch = cleaned.match(/totalizam\s+o\s+valor\s+de\s+R\$\s*([0-9.,]+)/i);
  let totalBruto = totalMatch?.[1] ? parseCurrency(totalMatch[1]) : null;
  const taxasMatch = cleaned.match(/taxas\s+de\s+embarque[^\d]*([0-9.,]+)/i);
  const taxas = taxasMatch?.[1] ? parseCurrency(taxasMatch[1]) : null;
  const descontoComercialMatch = cleaned.match(/DESCONTOS\s*COMERCIAIS\s*(?:\(R\$\))?\s*([0-9.,]+)/i);
  const desconto_comercial = descontoComercialMatch?.[1] ? parseCurrency(descontoComercialMatch[1]) : null;
  const totalPagoMatch = cleaned.match(/Total\s+Pago\s*:?[^0-9]*([0-9.,]+)/i);
  let total_pago = totalPagoMatch?.[1] ? parseCurrency(totalPagoMatch[1]) : null;

  const paymentBlocks = cleaned.split(/Forma de Pagamento\s*:?\s*/i).slice(1);
  paymentBlocks.forEach((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const formaMatch = block.match(/^\s*([^\n]+?)(?:\s+Opera[cç][ãa]o|\s+Plano|\s+Valor|\n)/i);
    const forma = formaMatch?.[1] || lines[0] || "";
    const operacao = extractLineValue(block, "Opera[cç][ãa]o") || null;
    const plano = extractLineValue(block, "Plano") || null;
    const valorRaw = extractLineValue(block, "Valor") || "";
    const valor_bruto = extractCurrency(valorRaw);
    const desconto = extractCurrency(extractLineValue(block, "Desconto"));
    const totalRaw = extractCurrency(extractLineValue(block, "Total"));
    const total =
      totalRaw != null && valor_bruto != null && totalRaw > valor_bruto * 1.05
        ? null
        : totalRaw;

    const parcelas: PagamentoParcelaDraft[] = [];
    const parcelaRegex = /(Entrada|\b\d{1,2}\b)\s+([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})(?:\s+(\d{2}\/\d{2}\/\d{4}))?/gi;
    let pmatch;
    while ((pmatch = parcelaRegex.exec(block))) {
      const numero = pmatch[1];
      const valor = parseCurrency(pmatch[2]) || 0;
      const vencimento = pmatch[3] ? parseDateBr(pmatch[3]) : null;
      parcelas.push({ numero, valor, vencimento });
    }

    pagamentos.push({
      forma: forma.trim(),
      operacao: operacao?.trim() || null,
      plano: plano?.trim() || null,
      valor_bruto,
      desconto,
      total,
      parcelas: parcelas.length ? parcelas : undefined,
    });
  });

  if (totalBruto == null && pagamentos.length) {
    const fallback = pagamentos.reduce((sum, p) => sum + Number(p.valor_bruto || 0), 0);
    totalBruto = fallback > 0 ? fallback : null;
  }
  if (total_pago == null && pagamentos.length) {
    const fallback = pagamentos.reduce((sum, p) => {
      const bruto = Number(p.valor_bruto || 0);
      const desc = Number(p.desconto || 0);
      if (p.total != null) return sum + Number(p.total || 0);
      if (bruto > 0) return sum + Math.max(bruto - desc, 0);
      return sum;
    }, 0);
    total_pago = fallback > 0 ? fallback : null;
  }

  return { pagamentos, total_pago, desconto_comercial, total_bruto: totalBruto, taxas };
}

function extractContratoBlock(block: string, contratanteGlobal: ContratanteDraft | null, passageirosGlobal: PassageiroDraft[]) {
  const cleaned = cleanText(block);
  const contratanteSection = sliceSection(cleaned, CONTRATANTE_SECTION_RE);
  const servicosSection = sliceSection(cleaned, SERVICOS_SECTION_RE);
  const pagamentoSection = sliceSection(cleaned, PAGAMENTO_SECTION_RE);
  const contratoMatch = cleaned.match(
    /(?:N\s*(?:\u00BA|\u00B0|o|\.)?\s*(?:do\s+)?)?Contrato\s*:?\s*([0-9][0-9.\-\s/]*\d)(?=\s+Reserva\b|\n|$)/i
  );
  const reservaMatch = cleaned.match(/Reserva:\s*([0-9-]+)/i);
  const excursaoMatch = cleaned.match(/Excurs[aã]o:\s*([0-9.]+)/i);
  const destinoMatch = cleaned.match(/Destino:\s*-?\s*([^\n]+)/i);
  const destinoLinha = destinoMatch?.[1]?.trim() || "";
  const destinoPrimeiroTrecho = destinoLinha.split("*").find((seg) => seg && seg.trim())?.trim() || destinoLinha;
  const destinoNormalizado = normalizePlaceholderValue(destinoPrimeiroTrecho) || null;
  const isFretamentoContrato =
    /fretamento/i.test(cleaned) ||
    (excursaoMatch?.[1] && /^4\.0{3,}/.test(excursaoMatch[1])) ||
    /tipo\s+de\s+produto\s*:?[\s\n]*fretamento/i.test(cleaned);
  const produtoFretamentoContrato =
    isFretamentoContrato && destinoNormalizado ? `Fretamento - ${destinoNormalizado}` : null;
  const dataSaida =
    parseDateBr(extractLineValue(cleaned, "Data\\s+de\\s+Sa[ií]da")) ||
    parseDateBr(extractLineValue(cleaned, "Data\\s+Sa[ií]da")) ||
    parseDateBr(extractLineValue(cleaned, "DataSa[ií]da"));
  const dataRetorno =
    parseDateBr(extractLineValue(cleaned, "Data\\s+de\\s+Retorno")) ||
    parseDateBr(extractLineValue(cleaned, "Data\\s+Retorno")) ||
    parseDateBr(extractLineValue(cleaned, "DataRetorno"));
  const produtoInfo = extractProdutoPrincipal(servicosSection || cleaned);
  const pagamentosInfo = extractPagamentos(pagamentoSection || cleaned);
  const contratanteLocal =
    contratanteGlobal || extractContratante(contratanteSection || cleaned);
  const produtoPrincipalExtraido = normalizePlaceholderValue(produtoInfo.nome);
  const produtoTipoExtraido = normalizePlaceholderValue(produtoInfo.tipo);
  const produtoDetalhesExtraido = normalizePlaceholderValue(produtoInfo.detalhes);
  const produtoPrincipalFinal = produtoPrincipalExtraido || produtoFretamentoContrato || null;

  return {
    contrato_numero: normalizeContratoNumero(contratoMatch?.[1]),
    reserva_numero: normalizePlaceholderValue(reservaMatch?.[1]) || null,
    excursao_numero: normalizePlaceholderValue(excursaoMatch?.[1]) || null,
    destino: destinoNormalizado || normalizePlaceholderValue(destinoMatch?.[1]) || null,
    data_saida: dataSaida,
    data_retorno: dataRetorno,
    produto_principal: produtoPrincipalFinal,
    produto_tipo: produtoTipoExtraido || (produtoFretamentoContrato ? "Fretamento" : null),
    produto_detalhes: produtoDetalhesExtraido,
    contratante: contratanteLocal,
    passageiros: passageirosGlobal,
    pagamentos: pagamentosInfo.pagamentos,
    total_bruto: pagamentosInfo.total_bruto,
    total_pago: pagamentosInfo.total_pago,
    taxas_embarque: pagamentosInfo.taxas,
    desconto_comercial: pagamentosInfo.desconto_comercial,
    raw_text: cleaned,
  } as ContratoDraft;
}

function buildPassageiroNome(p: RoteiroReservaPassageiroDraft) {
  return [p.sobrenome, p.nome].filter(Boolean).join(" ").trim();
}

function buildPassageiroNomeNomePrimeiro(p: RoteiroReservaPassageiroDraft) {
  return [p.nome, p.sobrenome].filter(Boolean).join(" ").trim();
}

function findCpfByNome(nome: string, passageiros: RoteiroReservaPassageiroDraft[]) {
  const nomeNorm = normalizeText(nome, { trim: true, collapseWhitespace: true });
  if (!nomeNorm) {
    const firstCpf = (passageiros[0]?.documento_numero || "").replace(/\D/g, "");
    return firstCpf.length === 11 ? firstCpf : "";
  }
  const nomeTokens = nomeNorm.split(" ").filter(Boolean);
  const match = passageiros.find((p) => {
    const completo = buildPassageiroNome(p);
    const completoNorm = normalizeText(completo, { trim: true, collapseWhitespace: true });
    if (!completoNorm) return false;
    if (completoNorm === nomeNorm || completoNorm.includes(nomeNorm) || nomeNorm.includes(completoNorm)) return true;

    const completoTokens = completoNorm.split(" ").filter(Boolean);
    if (nomeTokens.length < 2 || completoTokens.length < 2) return false;
    const smaller = nomeTokens.length <= completoTokens.length ? nomeTokens : completoTokens;
    const larger = nomeTokens.length <= completoTokens.length ? completoTokens : nomeTokens;
    const largerSet = new Set(larger);
    return smaller.every((token) => largerSet.has(token));
  });
  const cpf = (match?.documento_numero || "").replace(/\D/g, "");
  if (cpf.length === 11) return cpf;
  const firstCpf = (passageiros[0]?.documento_numero || "").replace(/\D/g, "");
  return firstCpf.length === 11 ? firstCpf : "";
}

function findPassageiroByNomeHint(
  nome: string,
  passageiros: RoteiroReservaPassageiroDraft[]
): RoteiroReservaPassageiroDraft | null {
  const nomeNorm = normalizeText(nome, { trim: true, collapseWhitespace: true });
  if (!nomeNorm) return null;
  const nomeTokens = nomeNorm.split(" ").filter(Boolean);
  if (!nomeTokens.length) return null;

  let best: { passageiro: RoteiroReservaPassageiroDraft; score: number } | null = null;

  for (const passageiro of passageiros) {
    const completo = buildPassageiroNome(passageiro);
    const completoNorm = normalizeText(completo, { trim: true, collapseWhitespace: true });
    if (!completoNorm) continue;

    if (completoNorm === nomeNorm || completoNorm.includes(nomeNorm) || nomeNorm.includes(completoNorm)) {
      const score = completoNorm.length;
      if (!best || score > best.score) best = { passageiro, score };
      continue;
    }

    const completoTokens = completoNorm.split(" ").filter(Boolean);
    if (!completoTokens.length) continue;
    const completoSet = new Set(completoTokens);
    const matchedCount = nomeTokens.filter((token) => completoSet.has(token)).length;
    if (!matchedCount) continue;
    const required = nomeTokens.length >= 2 ? 2 : 1;
    if (matchedCount < required) continue;

    const score = matchedCount * 10 + completoTokens.length;
    if (!best || score > best.score) best = { passageiro, score };
  }

  return best?.passageiro || null;
}

function buildProdutoPrincipalFromFornecedores(fornecedores?: RoteiroReservaFornecedorDraft[]) {
  if (!fornecedores?.length) return null;

  const hotelFornecedor = fornecedores.find((fornecedor) => {
    const tipo = normalizeText(fornecedor.tipo_servico || "");
    return tipo.includes("hotel");
  });
  if (hotelFornecedor) {
    const hotelNome = normalizePlaceholderValue(hotelFornecedor.nome) || null;
    if (hotelNome && !normalizeMaybeNumero(hotelNome) && !isGenericServicoLabel(hotelNome)) {
      return hotelNome;
    }
  }

  const receptivoServicos = fornecedores
    .filter((fornecedor) => {
      const tipo = normalizeText(fornecedor.tipo_servico || "");
      const categoria = normalizeText(fornecedor.categoria || "");
      const nome = normalizeText(fornecedor.nome || "");
      return tipo.includes("receptivo") || categoria.includes("receptivo") || nome.includes("receptivo");
    })
    .map((fornecedor) => {
      const servico = normalizeServicoNome(fornecedor.servico) || null;
      const descricao = normalizeServicoNome(fornecedor.descricao) || null;
      if (descricao && servico && descricao.length > servico.length) return descricao;
      return servico || descricao || null;
    })
    .filter((item): item is string => Boolean(item))
    .filter((item) => !normalizeMaybeNumero(item) && !isGenericServicoLabel(item));
  if (receptivoServicos.length) {
    const unique = Array.from(new Set(receptivoServicos.map((s) => s.trim()))).filter(Boolean);
    if (unique.length) return unique.join(" | ");
  }

  const parts = fornecedores
    .map((fornecedor) => {
      let categoria = normalizePlaceholderValue(fornecedor.categoria) || null;
      if (normalizeMaybeNumero(categoria)) categoria = null;
      if (fornecedor.transporte_aereo) {
        const base = normalizePlaceholderValue(fornecedor.transporte_aereo) || null;
        if (base && categoria) return `${base} + ${categoria}`;
        return base || categoria || null;
      }
      let nome = normalizePlaceholderValue(fornecedor.nome) || null;
      const servico = normalizeServicoNome(fornecedor.servico) || null;
      if (nome && isGenericServicoLabel(nome) && servico) nome = servico;
      if (nome && categoria) return `${nome} + ${categoria}`;
      return nome || categoria || servico || null;
    })
    .filter((item): item is string => Boolean(item));
  if (!parts.length) return null;
  const unique = Array.from(new Set(parts.map((p) => p.trim()))).filter(Boolean);
  return unique.join(" | ");
}

function buildFretamentoProductName(
  hotelNome?: string | null,
  produtoBase?: string | null,
  transporteCompartilhadoLabel?: string | null,
  transporteAereoLabel?: string | null
) {
  const parts: string[] = [];
  const seen = new Set<string>();
  const tryAdd = (value?: string | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const normalized = normalizeText(trimmed, { trim: true, collapseWhitespace: true });
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    parts.push(trimmed);
  };
  tryAdd(hotelNome);
  tryAdd(produtoBase);
  tryAdd(transporteCompartilhadoLabel);
  tryAdd(transporteAereoLabel);
  return parts.length ? parts.join(" + ") : null;
}

function findHotelNameFromFornecedores(fornecedores?: RoteiroReservaFornecedorDraft[]) {
  if (!fornecedores?.length) return null;
  const hotelKeywords = ["hotel", "resort", "pousada", "hospedagem", "flat", "suíte", "suite", "diária", "diaria"];
  for (const fornecedor of fornecedores) {
    const combined = normalizeText(
      `${fornecedor.tipo_servico || ""} ${fornecedor.categoria || ""} ${fornecedor.nome || ""} ${
        fornecedor.servico || ""
      } ${fornecedor.descricao || ""}`,
      { trim: true, collapseWhitespace: true }
    );
    if (!combined) continue;
    if (!hotelKeywords.some((keyword) => combined.includes(keyword))) continue;
    const hotelOverride = normalizePlaceholderValue(fornecedor.hotel_nome);
    if (hotelOverride && !normalizeMaybeNumero(hotelOverride) && !isGenericServicoLabel(hotelOverride)) {
      return hotelOverride;
    }
    const candidate =
      normalizePlaceholderValue(fornecedor.nome) ||
      normalizeServicoNome(fornecedor.servico) ||
      normalizeServicoNome(fornecedor.descricao) ||
      null;
    if (candidate && !normalizeMaybeNumero(candidate) && !isGenericServicoLabel(candidate)) {
      return candidate;
    }
  }
  return null;
}

function hasAereoFornecedor(fornecedores?: RoteiroReservaFornecedorDraft[]) {
  if (!fornecedores?.length) return false;
  const airlineKeywords = ["aereo", "aéreo", "voo", "passagem", "airlines", "latam", "gol"];
  for (const fornecedor of fornecedores) {
    const combined = normalizeText(
      `${fornecedor.tipo_servico || ""} ${fornecedor.categoria || ""} ${fornecedor.servico || ""} ${
        fornecedor.descricao || ""
      } ${fornecedor.transporte_aereo || ""}`,
      { trim: true, collapseWhitespace: true }
    );
    if (!combined) continue;
    if (
      combined.includes("transporte aereo") ||
      combined.includes("passagem aerea") ||
      combined.includes("voo")
    ) {
      return true;
    }
    if (airlineKeywords.some((keyword) => combined.includes(keyword))) {
      return true;
    }
  }
  return false;
}

function findTransporteCompartilhadoLabel(fornecedores?: RoteiroReservaFornecedorDraft[]) {
  if (!fornecedores?.length) return null;
  const keywords = ["transporte", "translado", "traslado", "transfer", "transporte compartilhado"];
  for (const fornecedor of fornecedores) {
    const combined = normalizeText(
      `${fornecedor.tipo_servico || ""} ${fornecedor.categoria || ""} ${fornecedor.nome || ""} ${
        fornecedor.servico || ""
      } ${fornecedor.descricao || ""}`,
      { trim: true, collapseWhitespace: true }
    );
    if (!combined) continue;
    if (!keywords.some((keyword) => combined.includes(keyword))) continue;
    if (combined.includes("aereo") || combined.includes("aéreo")) continue;
    const candidate =
      normalizePlaceholderValue(fornecedor.nome) ||
      normalizeServicoNome(fornecedor.servico) ||
      normalizeServicoNome(fornecedor.descricao) ||
      null;
    if (candidate && !normalizeMaybeNumero(candidate) && !isGenericServicoLabel(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractHotelFromServicosSection(text: string) {
  if (!text) return null;
  const cleaned = text
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/(?:\d+\s*)?DI[ÁA]RIAS?\s+(?:NO|NA|EM)\s+([^\n\.]+)/i);
  if (!match?.[1]) return null;
  return cleanHotelName(match[1]);
}

function extractHotelFromDestinoText(text: string) {
  const match = text.match(/Destino:\s*([^\n]+)/i);
  if (!match?.[1]) return null;
  const parts = match[1].split(/[-*]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  return cleanHotelName(parts[0]);
}

function extractDestinoLinhaCompleta(text: string) {
  const match = text.match(/Destino:\s*([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

function sanitizeDestinoCidade(value?: string | null) {
  const base = normalizePlaceholderValue(value) || null;
  if (!base) return null;
  const withoutPrefix = base.replace(/^fretamento\s*-\s*/i, "").trim();
  const dashed = normalizeDashChars(withoutPrefix);
  const first = dashed.split(/\s*-\s*/).map((part) => part.trim()).filter(Boolean)[0] || "";
  return first || null;
}

function cleanNavioName(name?: string | null) {
  if (!name) return "";
  let cleaned = name.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\bcat\.?.*$/i, "").trim(); // remove "CAT." e complementos
  cleaned = cleaned.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned;
}

function extractNavioNomeFromFornecedoresSection(lines: string[]) {
  if (!lines.length) return null;
  const isNumericLike = (value: string) => /^\d[\d\s/.-]*$/.test(value);
  const hasNavioLabel = lines.some((line) => {
    const norm = normalizeText(line || "", { trim: true, collapseWhitespace: true });
    return Boolean(norm && norm.includes("navio"));
  });
  const pickModelToken = (startIndex: number, firstToken: string) => {
    for (let j = startIndex + 1; j < Math.min(lines.length, startIndex + 10); j += 1) {
      const next = (lines[j] || "").trim();
      if (!next) continue;
      const nextNorm = normalizeText(next, { trim: true, collapseWhitespace: true });
      if (!nextNorm) continue;
      if (nextNorm.startsWith("dados") || nextNorm.startsWith("passageiros")) break;
      if (isNumericLike(next)) continue;
      if (/\b\d{2}\/\d{2}\/\d{4}\b/.test(next) && !/[a-z]/i.test(next)) continue;
      const candidate = next.split(/\s+/).filter(Boolean)[0] || "";
      if (!candidate || !/[a-z]/i.test(candidate)) continue;
      const candidateNorm = normalizeText(candidate, { trim: true, collapseWhitespace: true });
      if (
        !candidateNorm ||
        candidateNorm === "acordo" ||
        candidateNorm === "numero" ||
        candidateNorm === "número" ||
        candidateNorm === "navio"
      ) {
        continue;
      }
      const firstNorm = normalizeText(firstToken, { trim: true, collapseWhitespace: true });
      if (candidateNorm === firstNorm) continue;
      return candidate;
    }
    return "";
  };

  const buildNome = (firstToken: string, baseIndex: number) => {
    const secondToken = pickModelToken(baseIndex, firstToken);
    const raw = [firstToken, secondToken].filter(Boolean).join(" ").trim() || firstToken;
    const cleaned = cleanNavioName(raw);
    return cleaned || raw;
  };

  // Estratégia 0: tabelas onde a 2ª coluna é o nome do navio (ex.: "57278853 | Msc Divina | CAT...")
  if (hasNavioLabel) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = (lines[i] || "").trim();
      if (!line) continue;
      const cols = splitTableLine(line).map((c) => c.trim()).filter(Boolean);
      if (cols.length < 2) continue;
      const acordoDigits = (cols[0] || "").replace(/\D/g, "");
      if (acordoDigits.length < 5) continue;
      const navioRaw = cols[1] || "";
      if (!/[a-z]/i.test(navioRaw)) continue;
      const navioNorm = normalizeText(navioRaw, { trim: true, collapseWhitespace: true });
      if (
        !navioNorm ||
        navioNorm === "navio" ||
        navioNorm === "numero" ||
        navioNorm === "número" ||
        navioNorm.includes("acordo")
      ) {
        continue;
      }
      const cleaned = cleanNavioName(navioRaw);
      if (cleaned) return cleaned;
      return navioRaw.trim();
    }
  }

  // Estratégia 1: linha com "Navio" contendo o nome (com/sem separador "|")
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] || "").trim();
    if (!line) continue;
    const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (!norm) continue;
    if (!norm.includes("navio")) continue;
    if (norm.includes("categoria") && norm.includes("servico")) continue; // cabeçalho

    let firstToken = "";
    let baseIndex = i;

    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      const afterPipe = parts.slice(1).join(" ").replace(/\s+/g, " ").trim();
      firstToken = afterPipe.split(/\s+/).filter(Boolean)[0] || "";
    } else if (norm === "navio") {
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j += 1) {
        const next = (lines[j] || "").trim();
        if (!next) continue;
        if (isNumericLike(next)) continue;
        const nextNorm = normalizeText(next, { trim: true, collapseWhitespace: true });
        if (!nextNorm) continue;
        if (nextNorm === "acordo" || nextNorm === "numero" || nextNorm === "número") continue;
        firstToken = next.split(/\s+/).filter(Boolean)[0] || "";
        baseIndex = j;
        break;
      }
    } else if (norm.startsWith("navio ")) {
      const tokens = line.split(/\s+/).filter(Boolean);
      firstToken = tokens[1] || "";
    }

    if (firstToken) return buildNome(firstToken, baseIndex);
  }

  // Estratégia 2: fallback por linha do fornecedor (ex.: "… - Cruzeiros Da Costa")
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] || "").trim();
    if (!line) continue;
    const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (!norm.includes("cruzeiros da costa")) continue;
    const firstToken = line.split(/\s+/).filter(Boolean)[0] || "";
    if (!firstToken) continue;
    return buildNome(firstToken, i);
  }

  return null;
}

function extractRoteiroReservaFromText(text: string): ContratoImportResult {
  const cleaned = cleanText(text);
  if (!cleaned) throw new Error("Texto obrigatório.");
  const normalizedCleaned = normalizeText(cleaned, { trim: true, collapseWhitespace: true });
  const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const filteredLines = lines.filter((l) => !isFooterLine(l));
  const sections = splitRoteiroSections(filteredLines);
  const servicosSectionMatch = cleaned.match(
    /SERVI[ÇC]OS INCLUSOS([\s\S]*?)(?:NOME DOS PASSAGEIROS|4\.|4\s+DO PRE[ÇC]O|5\.|VALOR E FORMA|$)/i
  );
  const servicosSectionText = servicosSectionMatch?.[1] || "";

  const contratanteInfo = parseRoteiroContratante(sections.contratante);
  const roteiroInfo = parseRoteiroRoteiro(sections.roteiro);
  const origemInfo = parseRoteiroLocalizacao(sections.origem);
  const destinoInfo = parseRoteiroLocalizacao(sections.destino);
  const dadosReservaInfoBase = parseRoteiroDadosReserva(sections.dados_reserva);
  const observacaoNormalized = normalizeText(dadosReservaInfoBase?.observacao || "", {
    trim: true,
    collapseWhitespace: true,
  });
  const tipoPacoteFieldNormalized = normalizeText(dadosReservaInfoBase?.tipo_pacote || "", {
    trim: true,
    collapseWhitespace: true,
  });
  const excursaoMatch = cleaned.match(/Excurs[aã]o:\s*([0-9.]+)/i);
  const excursaoNumero = excursaoMatch?.[1]?.trim() || "";
  const isExcursaoFretamento = /^4\.0{3,}/.test(excursaoNumero);
  const fretamentoKeywords = ["fretamento", "fretado"];
  let isFretamentoDetected =
    fretamentoKeywords.some(
      (keyword) =>
        normalizedCleaned.includes(keyword) || observacaoNormalized.includes(keyword)
    ) ||
    tipoPacoteFieldNormalized.includes("fretamento") ||
    tipoPacoteFieldNormalized.includes("fretado");
  if (isExcursaoFretamento) {
    isFretamentoDetected = true;
  }
  const fretamentoDescricaoLabel = isFretamentoDetected ? buildFretamentoLabel(roteiroInfo?.descricao) : null;
  const destinoLinhaCompleta = isFretamentoDetected ? extractDestinoLinhaCompleta(cleaned) : null;
  const fretamentoDestinoLabel = isFretamentoDetected
    ? buildFretamentoLabel(destinoLinhaCompleta || destinoInfo?.cidade)
    : null;
  let dadosReservaInfo =
    dadosReservaInfoBase
      ? {
          ...dadosReservaInfoBase,
          tipo_pacote: dadosReservaInfoBase.tipo_pacote || (isFretamentoDetected ? "Fretamento" : null),
        }
      : isFretamentoDetected
        ? ({ tipo_pacote: "Fretamento" } as any)
        : null;
  const tipoPacoteFromDados = dadosReservaInfo?.tipo_pacote || null;
  const tipoPacoteFromRoteiro = cleanTipoProdutoName(roteiroInfo?.tipo_produto);
  let tipoPacoteFinal = tipoPacoteFromDados || tipoPacoteFromRoteiro || null;
  const fornecedoresInfo = parseRoteiroFornecedores(sections.fornecedores, roteiroInfo?.descricao || null);
  const passageirosInfo = parseRoteiroPassageiros(sections.passageiros);
  const orcamentoInfo = parseRoteiroOrcamento(sections.orcamento);
  const pagamentoInfo = parseRoteiroPagamento(sections.pagamento);
  const navioNome = extractNavioNomeFromFornecedoresSection(sections.fornecedores);
  if (navioNome) {
    // Quando existe fornecedor "Navio", o tipo de pacote deve ser NAVIO (mesmo que o roteiro traga FRETAMENTO).
    tipoPacoteFinal = "Navio";
  }
  if (dadosReservaInfo && tipoPacoteFinal) {
    dadosReservaInfo = { ...dadosReservaInfo, tipo_pacote: tipoPacoteFinal };
  }

  // Fallbacks adicionais para recibo e nome do contratante em layouts verticais quebrados
  let contratanteAjustado = contratanteInfo || null;
  if (!contratanteAjustado) {
    contratanteAjustado = { nome: null, recibo: null, valor: null, taxa_embarque: null, taxa_du: null } as any;
  }
  if (!contratanteAjustado.recibo) {
    const reciboEncontrado =
      extractReciboNumero(sections.contratante.join(" ")) ||
      extractReciboNumero(cleaned) ||
      normalizeReciboNumero(sections.contratante.join(" ").match(RECIBO_NUMERO_RE)?.[0] || null) ||
      normalizeReciboNumero(cleaned.match(RECIBO_NUMERO_RE)?.[0] || null);
    contratanteAjustado.recibo = reciboEncontrado || contratanteAjustado.recibo || null;
  }
  const nomePareceRuim =
    !contratanteAjustado.nome ||
    /taxa|valor|remessa|embarque|du|passageiro/i.test(contratanteAjustado.nome || "") ||
    normalizeText(contratanteAjustado.nome || "", { trim: true, collapseWhitespace: true }).includes("r$");
  if (contratanteAjustado.nome && /http|systur|consulta de roteiro/i.test(normalizeText(contratanteAjustado.nome))) {
    contratanteAjustado.nome = null;
  }
  if (nomePareceRuim) {
    const firstPassageiro = passageirosInfo[0];
    const nomePassageiro = firstPassageiro ? buildPassageiroNomeNomePrimeiro(firstPassageiro) : "";
    if (nomePassageiro) {
      contratanteAjustado.nome = nomePassageiro;
    }
  }
  const contratanteInfoFinal = contratanteAjustado;
  const passageiroPrincipalNome = buildPassageiroNomeNomePrimeiro(passageirosInfo[0] || ({} as any));
  if (passageiroPrincipalNome) {
    const currentNorm = normalizeText(contratanteInfoFinal?.nome || "", { trim: true, collapseWhitespace: true });
    const passageiroNorm = normalizeText(passageiroPrincipalNome, { trim: true, collapseWhitespace: true });
    if (
      !currentNorm ||
      (passageiroNorm && passageiroNorm.includes(currentNorm) && currentNorm.length < passageiroNorm.length)
    ) {
      contratanteInfoFinal.nome = passageiroPrincipalNome;
    }
  }

  const produtoResumo = buildProdutoPrincipalFromFornecedores(fornecedoresInfo);
  const fornecedorDestino =
    fornecedoresInfo.find((f) => normalizePlaceholderValue(f.cidade))?.cidade || null;
  const destinoCidadeFinal = isInvalidDestinoValue(destinoInfo?.cidade)
    ? normalizePlaceholderValue(fornecedorDestino)
    : normalizePlaceholderValue(destinoInfo?.cidade);
  const roteiroDescricaoFallback = normalizePlaceholderValue(roteiroInfo?.descricao) || null;
  const destinoPreferencial = destinoCidadeFinal || roteiroDescricaoFallback || destinoLinhaCompleta || null;
  const hotelNomeFretamento =
    findHotelNameFromFornecedores(fornecedoresInfo) ||
    extractHotelFromServicosSection(servicosSectionText) ||
    extractHotelFromDestinoText(cleaned);
  const transporteCompartilhadoLabel = findTransporteCompartilhadoLabel(fornecedoresInfo);
  const temTransporteAereo = hasAereoFornecedor(fornecedoresInfo);
  const produtoFretamento = isFretamentoDetected
    ? fretamentoDestinoLabel ||
      fretamentoDescricaoLabel ||
      hotelNomeFretamento ||
      produtoResumo ||
      buildFretamentoProductName(
        hotelNomeFretamento,
        produtoResumo,
        transporteCompartilhadoLabel,
        temTransporteAereo ? "Transporte Aéreo" : null
      )
    : produtoResumo;

  let produtoPrincipalFinal = isFretamentoDetected
    ? fretamentoDestinoLabel ||
      fretamentoDescricaoLabel ||
      destinoLinhaCompleta ||
      produtoFretamento ||
      roteiroInfo?.descricao ||
      destinoInfo?.cidade ||
      null
    : produtoFretamento || roteiroInfo?.descricao || null;
  if (navioNome) {
    produtoPrincipalFinal = navioNome;
  }

  const contratoNumeroFallback =
    normalizeContratoNumero(contratanteInfoFinal?.recibo || "") ||
    normalizeContratoNumero(
      extractReciboNumero(sections.contratante.join(" ")) ||
        sections.contratante.join(" ").match(RECIBO_NUMERO_RE)?.[0] ||
        ""
    );
  const contratanteNomeBase = contratanteInfoFinal?.nome || "";
  const contratanteNomeClean =
    contratanteNomeBase && /http|systur|consulta de roteiro/i.test(normalizeText(contratanteNomeBase))
      ? ""
      : contratanteNomeBase;
  const contratanteNome =
    contratanteNomeClean &&
    !/taxa|valor|remessa|embarque|du|passageiro|https?:\/\//i.test(contratanteNomeClean) &&
    !/systur/i.test(contratanteNomeClean)
      ? contratanteNomeClean
      : buildPassageiroNomeNomePrimeiro(passageirosInfo[0] || ({} as any)) || contratanteNomeClean;
  function isInvalidContratanteName(value?: string | null) {
    if (!value) return true;
    const norm = normalizeText(value, { trim: true, collapseWhitespace: true });
    if (!norm) return true;
    if (norm.includes("http")) return true;
    if (norm.includes("systur")) return true;
    if (norm.includes("consulta de roteiro e reserva")) return true;
    if (norm.includes("r$")) return true;
    if (norm.includes("valor") || norm.includes("taxa") || norm.includes("passageiro")) return true;
    return false;
  }

  let contratanteNomeFinal = isInvalidContratanteName(contratanteNome)
    ? buildPassageiroNomeNomePrimeiro(passageirosInfo[0] || ({} as any)) || null
    : contratanteNome || null;
  if (isInvalidContratanteName(contratanteNomeFinal)) contratanteNomeFinal = null;
  if (!contratanteNomeFinal && passageirosInfo[0]) {
    contratanteNomeFinal = buildPassageiroNomeNomePrimeiro(passageirosInfo[0]) || null;
  }
  if (!contratanteNomeFinal) {
    const nomeLinha = sections.contratante.find((l) => {
      const norm = normalizeText(l, { trim: true, collapseWhitespace: true });
      if (!norm) return false;
      if (isFooterLine(l)) return false;
      if (/nome|recibo|valor|taxa|passageiro/i.test(norm)) return false;
      return /[a-z]/i.test(norm) && !/\d/.test(norm);
    });
    if (nomeLinha) contratanteNomeFinal = nomeLinha.trim();
  }

  const contratanteNomeFromResumo = (() => {
    const match = cleaned.match(
      new RegExp(`\\bPassageiros\\b\\s*:?\\s+(.+?)\\s+(?:${RECIBO_NUMERO_RE.source})`, "i")
    );
    if (!match?.[1]) return null;
    const candidate = match[1].replace(/\s+/g, " ").trim();
    if (!candidate || candidate.length < 4) return null;
    if (/\d/.test(candidate)) return null;
    const candidateNorm = normalizeText(candidate, { trim: true, collapseWhitespace: true });
    if (!candidateNorm) return null;
    if (/taxa|valor|recibo|passageiro/i.test(candidateNorm)) return null;
    if (isInvalidContratanteName(candidate)) return null;
    return candidate;
  })();
  if (contratanteNomeFromResumo) {
    contratanteNomeFinal = contratanteNomeFromResumo;
  }
  const cpfContratante = findCpfByNome(contratanteNomeFinal || "", passageirosInfo);

  // Quando o nome vem invertido/quebrado no PDF (pdfjs), usamos o passageiro que bate com o CPF do contratante
  // para montar o nome completo no formato "Nome Sobrenome".
  if (cpfContratante) {
    const cpfDigits = cpfContratante.replace(/\D/g, "");
    if (cpfDigits.length === 11) {
      const pax = passageirosInfo.find(
        (p) => (p.documento_numero || "").replace(/\D/g, "") === cpfDigits
      );
      const nomeCompleto = pax
        ? [pax.nome, pax.sobrenome].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
        : "";
      if (nomeCompleto) {
        const currentNorm = normalizeText(contratanteNomeFinal || "", { trim: true, collapseWhitespace: true });
        const novoNorm = normalizeText(nomeCompleto, { trim: true, collapseWhitespace: true });
        const currentTokens = currentNorm.split(" ").filter(Boolean);
        const novoTokens = novoNorm.split(" ").filter(Boolean);
        const shouldOverride =
          !currentNorm ||
          currentTokens.length < 2 ||
          (novoTokens.length > currentTokens.length && novoNorm.includes(currentNorm));
        if (shouldOverride) contratanteNomeFinal = nomeCompleto;
      }
    }
  }

  // Sem CPF, tentamos um match por nome (útil quando o bloco CONTRATANTE vem bagunçado).
  const cpfDigitsFinal = (cpfContratante || "").replace(/\D/g, "");
  const contratanteNorm = normalizeText(contratanteNomeFinal || "", { trim: true, collapseWhitespace: true });
  const passageiroPrincipalNorm = normalizeText(passageiroPrincipalNome || "", { trim: true, collapseWhitespace: true });
  if (cpfDigitsFinal.length !== 11 && passageiroPrincipalNorm && contratanteNorm === passageiroPrincipalNorm) {
    const hintLine = sections.contratante
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => {
        const norm = normalizeText(l, { trim: true, collapseWhitespace: true });
        if (!norm) return false;
        if (isFooterLine(l)) return false;
        if (norm.includes("r$")) return false;
        if (norm.includes("http") || norm.includes("systur") || norm.includes("consulta de roteiro")) return false;
        if (/nome|recibo|valor|taxa|passageiro/i.test(norm)) return false;
        if (/\d/.test(l)) return false;
        const tokens = norm.split(" ").filter(Boolean);
        if (tokens.length < 2) return false;
        return /[a-z]/i.test(norm);
      })
      .sort((a, b) => b.length - a.length)[0];

    if (hintLine) {
      const pax = findPassageiroByNomeHint(hintLine, passageirosInfo);
      const nomeCompleto = pax
        ? [pax.nome, pax.sobrenome].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
        : "";
      if (nomeCompleto && (!contratanteNomeFinal || nomeCompleto.length > contratanteNomeFinal.length)) {
        contratanteNomeFinal = nomeCompleto;
      }
    }
  }
  const passageirosContrato: PassageiroDraft[] = passageirosInfo
    .map((p) => {
      const nome = buildPassageiroNome(p);
      const cpf = (p.documento_numero || "").replace(/\D/g, "");
      return {
        nome: nome || "",
        cpf: cpf.length === 11 ? cpf : "",
        nascimento: p.nascimento || null,
      };
    })
    .filter((p) => p.nome);

  const pagamentos: PagamentoDraft[] = [];
  const formaPagamento = pagamentoInfo?.forma || orcamentoInfo?.forma_pagamento || "";
  const valorOrcamentoBase = orcamentoInfo?.valor_total ?? orcamentoInfo?.preco_orcamento ?? null;
  if (formaPagamento) {
    pagamentos.push({
      forma: formaPagamento,
      plano: pagamentoInfo?.plano || orcamentoInfo?.plano || null,
      valor_bruto: valorOrcamentoBase ?? null,
      total: valorOrcamentoBase ?? null,
      parcelas: pagamentoInfo?.parcelas,
    });
  }

  const contrato: ContratoDraft = {
    contrato_numero: contratoNumeroFallback,
    reserva_numero: normalizePlaceholderValue(dadosReservaInfo?.numero_reserva || null),
    destino: (isFretamentoDetected ? sanitizeDestinoCidade(destinoPreferencial) : null) || destinoPreferencial,
    data_saida: roteiroInfo?.data_saida || null,
    data_retorno: roteiroInfo?.data_retorno || null,
    produto_principal: normalizePlaceholderValue(produtoPrincipalFinal),
    produto_tipo: normalizePlaceholderValue(roteiroInfo?.tipo_produto || null),
    contratante: contratanteNomeFinal
      ? {
          nome: contratanteNomeFinal,
          cpf: cpfContratante,
        }
      : null,
    passageiros: passageirosContrato,
    pagamentos: pagamentos.length ? pagamentos : undefined,
    total_bruto: contratanteInfo?.valor ?? valorOrcamentoBase ?? null,
    total_pago: valorOrcamentoBase ?? null,
    taxas_embarque:
      contratanteInfo?.taxa_embarque ??
      contratanteInfo?.taxas ??
      orcamentoInfo?.valor_total_taxas ??
      null,
    taxa_du: contratanteInfo?.taxa_du ?? null,
    tipo_pacote: tipoPacoteFinal,
    roteiro_reserva: {
      contratante: {
        ...(contratanteInfoFinal || {}),
        nome: contratanteNomeFinal || contratanteInfoFinal?.nome || null,
      },
      roteiro: roteiroInfo,
      origem: origemInfo,
      destino: destinoInfo,
      fornecedores: fornecedoresInfo,
      dados_reserva: dadosReservaInfo,
      passageiros: passageirosInfo,
      orcamento: orcamentoInfo,
      pagamento: pagamentoInfo,
    },
    raw_text: cleaned,
  };

  const hasInfo =
    Boolean(contrato.contrato_numero) ||
    Boolean(contrato.reserva_numero) ||
    Boolean(contrato.destino) ||
    Boolean(contrato.contratante?.nome) ||
    Boolean(contrato.passageiros?.length);
  if (!hasInfo) {
    throw new Error("Nenhum contrato encontrado no texto.");
  }

  return { contratos: [contrato], raw_text: cleaned };
}

export type ContratoExtractOptions = {
  forceSingle?: boolean;
  forceRoteiro?: boolean;
  disableRoteiro?: boolean;
};

export async function extractContratosFromText(
  text: string,
  options: ContratoExtractOptions = {}
): Promise<ContratoImportResult> {
  const cleaned = cleanText(text);
  if (!cleaned) throw new Error("Texto obrigatório.");

  if (options.forceRoteiro || (!options.disableRoteiro && isConsultaRoteiroReservaText(cleaned))) {
    return extractRoteiroReservaFromText(cleaned);
  }

  const contratanteSection = sliceSection(cleaned, CONTRATANTE_SECTION_RE);
  const contratante = extractContratante(contratanteSection || cleaned);
  const passageiros = extractPassageiros(cleaned);

  const contratos: ContratoDraft[] = [];
  if (options.forceSingle) {
    const contrato = extractContratoBlock(cleaned, contratante, passageiros);
    const hasInfo =
      Boolean(contrato.contrato_numero) ||
      Boolean(contrato.reserva_numero) ||
      Boolean(contrato.destino) ||
      Boolean(contrato.contratante?.nome) ||
      Boolean(contrato.passageiros?.length);
    if (!hasInfo) {
      throw new Error("Nenhum contrato encontrado no texto.");
    }
    contratos.push(contrato);
  } else {
    const markers: { index: number }[] = [];
    CONTRATO_MARKERS.forEach((regex) => {
      for (const match of cleaned.matchAll(regex)) {
        if (typeof match.index === "number") {
          markers.push({ index: match.index });
        }
      }
    });
    markers.sort((a, b) => a.index - b.index);
    const uniqueMarkers = markers.filter(
      (item, idx) => item.index !== markers[idx - 1]?.index
    );

    if (uniqueMarkers.length === 0) {
      const contrato = extractContratoBlock(cleaned, contratante, passageiros);
      const hasInfo =
        Boolean(contrato.contrato_numero) ||
        Boolean(contrato.reserva_numero) ||
        Boolean(contrato.destino) ||
        Boolean(contrato.contratante?.nome) ||
        Boolean(contrato.passageiros?.length);
      if (!hasInfo) {
        throw new Error("Nenhum contrato encontrado no texto.");
      }
      contratos.push(contrato);
    } else {
      uniqueMarkers.forEach((match, idx) => {
      const start = match.index || 0;
      const end = uniqueMarkers[idx + 1]?.index ?? cleaned.length;
      const block = cleaned.slice(start, end);
      const contrato = extractContratoBlock(block, contratante, passageiros);
      const hasInfo =
        Boolean(contrato.contrato_numero) ||
        Boolean(contrato.reserva_numero) ||
        Boolean(contrato.destino) ||
        Boolean(contrato.contratante?.nome) ||
        Boolean(contrato.passageiros?.length);
      if (hasInfo) contratos.push(contrato);
      });
    }
  }

  let contratosFinal = contratos;
  if (contratosFinal.length > 1) {
    if (contratosFinal.some((c) => hasContractSpecificInfo(c))) {
      contratosFinal = contratosFinal.filter((c) => hasContractSpecificInfo(c));
    }
    contratosFinal = dedupeContratos(contratosFinal);
  }

  return { contratos: contratosFinal, raw_text: cleaned };
}

export async function extractPdfText(
  file: File,
  options: { maxPages?: number } = {}
): Promise<string> {
  if (!file) throw new Error("Arquivo obrigatório.");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
    if (workerModule?.default && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
    }
  } catch {
    // ignore
  }

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const maxPages = Math.max(1, options.maxPages ?? 4);
  const totalPages = Math.min(pdf.numPages, maxPages);
  let fullText = "";
  for (let p = 1; p <= totalPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items || []) as any[];
    const rows: { y: number; items: { x: number; text: string }[] }[] = [];
    const tolerance = 2;
    items.forEach((item) => {
      const textItem = item?.str ? String(item.str) : "";
      if (!textItem.trim()) return;
      const transform = item?.transform || [];
      const x = typeof transform[4] === "number" ? transform[4] : 0;
      const y = typeof transform[5] === "number" ? transform[5] : 0;
      let row = rows.find((r) => Math.abs(r.y - y) <= tolerance);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, text: textItem });
    });
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map((row) => {
      const sorted = row.items.sort((a, b) => a.x - b.x);
      if (sorted.length === 0) return "";
      if (sorted.length === 1) return sorted[0].text;
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i += 1) {
        gaps.push(sorted[i].x - sorted[i - 1].x);
      }
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
      const threshold = Math.max(80, medianGap * 2.5);

      let line = sorted[0].text;
      for (let i = 1; i < sorted.length; i += 1) {
        const gap = sorted[i].x - sorted[i - 1].x;
        const sep = gap > threshold ? " | " : " ";
        line += `${sep}${sorted[i].text}`;
      }
      return line;
    });
    const pageText = lines.length
      ? lines.join("\n")
      : items.map((item: any) => (item?.str ? String(item.str) : "")).join(" ");
    fullText += `\n${pageText}`;
  }
  return fullText;
}

export async function extractContratosFromPdf(
  file: File,
  options: ContratoExtractOptions & { maxPages?: number } = {}
): Promise<ContratoImportResult> {
  const fullText = await extractPdfText(file, { maxPages: options.maxPages ?? 4 });

  try {
    return await extractContratosFromText(fullText, {
      forceSingle: options.forceSingle ?? true,
      forceRoteiro: options.forceRoteiro,
      disableRoteiro: options.disableRoteiro,
    });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (!fullText.trim()) {
      throw new Error("Não foi possível extrair texto do PDF. Tente colar o texto do contrato.");
    }
    if (/Nenhum contrato encontrado/i.test(msg)) {
      throw new Error("Nenhum contrato encontrado no PDF.");
    }
    if (/Texto obrigat/i.test(msg)) {
      throw new Error("Não foi possível extrair texto do PDF. Tente colar o texto do contrato.");
    }
    throw err;
  }
}
