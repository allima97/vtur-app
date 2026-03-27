import { titleCaseWithExceptions } from "../titleCase";
import {
  parseImportedRoteiroAereo,
  type ImportedRoteiroAereo,
} from "../roteiroAereoImport";
import { loadAirportCodeCityLookup } from "../airportCodeCityLookup";
import {
  parseImportedRoteiroHotels,
  type ImportedRoteiroHotel,
} from "../roteiroHotelImport";
import {
  parseImportedRoteiroPasseios,
  type ImportedRoteiroPasseio,
} from "../roteiroPasseioImport";
import { getOcrWorker } from "./ocrWorker";
import type {
  ImportDebugImage,
  ImportLogDraft,
  ImportResult,
  QuoteDraft,
  QuoteItemDraft,
} from "./types";

// Fallback: identifica blocos de itens em textos colados, agrupando por palavras-chave
function extractLooseBlocks(text: string): string[][] {
  const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const norm = line.toLowerCase();
    // Início de item: palavras-chave
    if (/total \(\d+/.test(norm) || /hotel|pacote|voo|passeio|transfer|seguro/.test(norm)) {
      if (current.length) blocks.push(current);
      current = [];
    }
    // Ignora blocos de regras/pagamento
    if (/informacoes importantes|formas de pagamento|importante|precos em real|boleto|cartao|pix|nupay|livelo/.test(norm)) {
      if (current.length) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks.filter(b => b.some(l => /r\$|hotel|pacote|voo|passeio|transfer|seguro/.test(l.toLowerCase())));
}

type ExtractOptions = {
  debug?: boolean;
  onProgress?: (message: string) => void;
};

type CardBBox = {
  pageIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type TextItemBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
};

type OcrRegionResult = {
  text: string;
  confidence: number;
};

const OCR_CARD_REGIONS = {
  titleLeft: { x1: 0, y1: 0, x2: 0.7, y2: 0.35 },
  topRight: { x1: 0.7, y1: 0, x2: 1, y2: 0.45 },
  middle: { x1: 0, y1: 0.3, x2: 1, y2: 0.65 },
  product: { x1: 0, y1: 0.55, x2: 1, y2: 1 },
};

const OCR_TEXT_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÇÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜàáâãäçèéêëìíîïòóôõöùúûü0123456789$%()[]{}<>.,;:/-–—+°'\"#@&=!?* ";
const OCR_NUMBER_WHITELIST = "0123456789R$.,()AdultoPaxTotal";

const PAGE_SKIP_KEYWORDS = [
  "informacoes importantes",
  "informações importantes",
  "formas de pagamento",
  "pagamento com cartao",
  "pagamento com cartão",
  "outras formas de pagamento",
  "id do carrinho",
];

const TIPO_PRODUTO_WHITELIST = [
  "seguro viagem",
  "servicos",
  "serviços",
  "aereo",
  "aéreo",
  "hoteis",
  "hotéis",
  "hotel",
  "hospedagem",
  "carro",
  "carros",
  "aluguel de carro",
  "aluguel de carros",
  "traslado",
  "transfer",
  "pacote",
  "ingresso",
  "passeio",
  "circuito",
  "a+h",
];

const ITEM_KEYWORDS = [
  "seguro",
  "servic",
  "aereo",
  "hotel",
  "hosped",
  "carro",
  "carros",
  "aluguel",
  "traslad",
  "transfer",
  "pacote",
  "ingress",
  "passei",
  "circuit",
  "a+h",
];

const TEXT_STOP_KEYWORDS = [
  "resumo da viagem",
  "informacoes importantes",
  "informações importantes",
  "comprar produtos",
  "posso te ajudar",
  "telefone de contato",
  "id do carrinho",
  "taxas inclusas",
];

const MONTHS_PT: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  "março": 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeOcrText(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseCurrencyValue(value: string) {
  const cleaned = (value || "").replace(/[^0-9,.-]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function extractCurrencyFromLine(line: string) {
  const match = line.match(/R\$\s*([0-9.,-]+)/i);
  if (match?.[1]) return parseCurrencyValue(match[1]);
  const fallback = line.match(/([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/);
  if (fallback?.[1]) return parseCurrencyValue(fallback[1]);
  return null;
}

function isCurrencyLine(line: string) {
  const trimmed = (line || "").trim();
  if (!trimmed) return false;
  const normalized = normalizeOcrText(trimmed);
  if (normalized.includes("r$")) return true;
  if (/^\d{1,3}(?:\.[0-9]{3})*,\d{2}$/.test(trimmed)) return true;
  return false;
}

function cleanProductLine(line: string) {
  if (!line) return "";
  const withoutCurrency = line
    .replace(/De\s*R\$\s*[0-9.,-]+\s*por\s*/gi, "")
    .replace(/R\$\s*[0-9.,-]+/gi, "");
  const withoutMeta = withoutCurrency
    .replace(/\bTotal\s*\([^)]*\)/gi, "")
    .replace(/\bDetalhes\b/gi, "")
    .replace(/\bPreferencial\b/gi, "");
  return withoutMeta.replace(/\s{2,}/g, " ").replace(/^[\s-–—]+|[\s-–—]+$/g, "").trim();
}

function extractAllCurrencyValues(line: string) {
  const matches = line.match(/R\$\s*([0-9.,-]+)/gi) || [];
  const values = matches
    .map((m) => m.replace(/R\$/i, "").trim())
    .map(parseCurrencyValue)
    .filter((v) => Number.isFinite(v) && v > 0);
  return values;
}

function parsePtMonth(value: string) {
  const key = normalizeOcrText(value).trim();
  return MONTHS_PT[key] || 0;
}

function toIsoDate(day: number, month: number, year: number) {
  if (!day || !month || !year) return "";
  const d = String(day).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parsePeriodoIso(text: string, baseYear: number) {
  const normalized = normalizeOcrText(text || "");
  const rangeMatch = normalized.match(
    /(\d{1,2})\s*de\s*([a-zçãõáéíóú]+)\s*-\s*(\d{1,2})\s*de\s*([a-zçãõáéíóú]+)/i
  );
  if (rangeMatch) {
    const startDay = Number(rangeMatch[1]);
    const startMonth = parsePtMonth(rangeMatch[2]);
    const endDay = Number(rangeMatch[3]);
    const endMonth = parsePtMonth(rangeMatch[4]);
    if (startMonth && endMonth) {
      let endYear = baseYear;
      if (endMonth < startMonth) endYear += 1;
      return {
        start: toIsoDate(startDay, startMonth, baseYear),
        end: toIsoDate(endDay, endMonth, endYear),
      };
    }
  }

  const singleMatch = normalized.match(/(\d{1,2})\s*de\s*([a-zçãõáéíóú]+)/i);
  if (singleMatch) {
    const day = Number(singleMatch[1]);
    const month = parsePtMonth(singleMatch[2]);
    if (month) {
      const iso = toIsoDate(day, month, baseYear);
      return { start: iso, end: iso };
    }
  }

  return { start: "", end: "" };
}

function parseQuantidadePax(text: string) {
  const match =
    text.match(/total\s*\(\s*(\d+)\s*adulto/i) ||
    text.match(/total\s*\(\s*(\d+)\s*pax/i) ||
    text.match(/total\s*\(\s*(\d+)\s*passageiro/i) ||
    text.match(/total\s*\(\s*(\d+)/i);
  if (!match) return 1;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function extractCurrencyTextFromLine(line: string) {
  const match = line.match(/R\$\s*[0-9]{1,3}(?:\.[0-9]{3})*,\d{2}/i);
  if (match?.[0]) return match[0].trim();
  const fallback = line.match(/[0-9]{1,3}(?:\.[0-9]{3})*,\d{2}/);
  if (fallback?.[0]) return fallback[0].trim();
  return null;
}

function isTotalValueLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized.includes("total")) return false;
  if (/\(\s*\d+/.test(line)) return true;
  return normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro");
}

function parseValor(text: string) {
  const matches = text.match(/R\$\s*[0-9]{1,3}(?:\.[0-9]{3})*,\d{2}/gi) || [];
  const fallbackMatches = text.match(/[0-9]{1,3}(?:\.[0-9]{3})*,\d{2}/g) || [];
  const list = matches.length ? matches : fallbackMatches;
  if (list.length === 0) return { valor: 0, valor_formatado: "", moeda: "" };
  const last = list[list.length - 1];
  return {
    valor: parseCurrencyValue(last),
    valor_formatado: last.replace(/\s+/g, " ").trim(),
    moeda: /R\$/i.test(last) ? "BRL" : "BRL",
  };
}

function parseValorFromLines(lines: string[], tipo?: string) {
  const tipoNormalized = normalizeOcrText(tipo || "");
  if (!isSeguroLabel(tipoNormalized)) {
    const totalIndex = lines.findIndex((line) => isTotalValueLine(line));
    if (totalIndex >= 0) {
      const end = Math.min(lines.length, totalIndex + 7);
      let lastCurrency: string | null = null;
      for (let i = totalIndex; i < end; i += 1) {
        const currencyText = extractCurrencyTextFromLine(lines[i]);
        if (currencyText) {
          lastCurrency = currencyText;
        }
      }
      if (lastCurrency) {
        return {
          valor: parseCurrencyValue(lastCurrency),
          valor_formatado: lastCurrency,
          moeda: "BRL",
        };
      }
    }
  }
  return parseValor(lines.join("\n"));
}

function parseCidade(text: string) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!/ - /i.test(line)) continue;
    const first = line.split(" - ")[0].trim();
    if (first && /[A-Za-zÀ-ÿ]/.test(first)) return first;
  }
  return "";
}

function splitTextLines(text: string) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type RouteInfo = {
  origin: string;
  destination: string;
  raw: string;
};

type FlightLeg = {
  departure_time?: string;
  departure_code?: string;
  departure_city?: string;
  arrival_time?: string;
  arrival_code?: string;
  arrival_city?: string;
  duration?: string;
  flight_number?: string;
  flight_type?: string;
};

type FlightDirection = {
  label: string;
  route?: string;
  date?: string;
  legs: FlightLeg[];
  notices?: string[];
};

type FlightDetails = {
  route?: string;
  airline?: string;
  cabin?: string;
  fare_tags: string[];
  directions: FlightDirection[];
  baggage: string[];
  notices: string[];
  hotel_lines?: string[];
};

function isHotelLabel(text: string) {
  const normalized = normalizeOcrText(text);
  return (
    normalized.includes("hotel") ||
    normalized.includes("hoteis") ||
    normalized.includes("hospedagem") ||
    normalized.includes("pousada") ||
    normalized.includes("resort")
  );
}

function isServiceLabel(text: string) {
  const normalized = normalizeOcrText(text);
  return normalized.includes("servi") || normalized.includes("transfer") || normalized.includes("traslado");
}

function isCarLabel(text: string) {
  const normalized = normalizeOcrText(text);
  return (
    normalized.includes("carro") ||
    normalized.includes("carros") ||
    normalized.includes("locacao") ||
    normalized.includes("locação") ||
    normalized.includes("aluguel de carro")
  );
}

function isAirHotelLabel(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;
  if (/a\s*\+\s*h/.test(normalized)) return true;
  if (normalized.includes("aereo") && normalized.includes("hotel")) return true;
  return false;
}

function isFlightLabel(text: string) {
  const normalized = normalizeOcrText(text);
  return (
    isAirHotelLabel(normalized) ||
    normalized.includes("aereo") ||
    normalized.includes("passagem") ||
    normalized.includes("voo")
  );
}

function findRouteFromLines(lines: string[]): RouteInfo | null {
  for (const line of lines) {
    const normalized = normalizeOcrText(line);
    if (!line || line.length > 240) continue;
    if (normalized.includes("detalhes") || normalized.includes("preferencial")) continue;
    if (!isRouteLine(line)) continue;
    const trimmed = normalizeRouteCandidate(line);
    const match = trimmed.match(ROUTE_LINE_REGEX);
    if (!match) continue;
    const origin = match[1].trim();
    const destination = match[2].trim();
    if (!origin || !destination) continue;
    return { origin, destination, raw: `${origin} - ${destination}` };
  }
  return null;
}

const ROUTE_LINE_REGEX = /^([A-Za-zÀ-ÿ\s]+)-\s*([A-Za-zÀ-ÿ\s]+)/;
const ROUTE_BLACKLIST_KEYWORDS = [
  "passeio",
  "ingresso",
  "transporte",
  "transfer",
  "traslado",
  "hotel",
  "quarto",
  "suite",
  "room",
  "cafe",
  "categoria",
  "espetaculo",
  "show",
  "bicicleta",
  "onibus",
  "bus",
  "tour",
];

function normalizeRouteCandidate(line: string) {
  return cleanProductLine(line)
    .replace(/[–—]/g, "-")
    .replace(/-+\s*$/, "")
    .trim();
}

function isRouteLine(line: string) {
  const trimmed = normalizeRouteCandidate(line);
  if (!trimmed) return false;
  const normalized = normalizeOcrText(trimmed);
  if (trimmed.length > 60) return false;
  if (/\d/.test(trimmed)) return false;
  if (ROUTE_BLACKLIST_KEYWORDS.some((keyword) => normalized.includes(keyword))) return false;
  return ROUTE_LINE_REGEX.test(trimmed);
}

function isDateOnlyLine(line: string) {
  const normalized = normalizeOcrText(line).replace(/\(.*?\)/g, "").trim();
  if (!normalized) return false;
  return /^\d{1,2}\s*de\s*[a-zçãõáéíóú]+(\s*-\s*\d{1,2}\s*de\s*[a-zçãõáéíóú]+)?$/.test(normalized);
}

function isSeguroLabel(text: string) {
  const normalized = normalizeOcrText(text);
  return normalized.includes("seguro") && normalized.includes("viagem");
}

function canonicalizeTipoLabel(value: string) {
  const normalized = normalizeOcrText(value);
  if (!normalized) return "";
  if (normalized.includes("seguro") && normalized.includes("viagem")) return "Seguro viagem";
  if (isAirHotelLabel(normalized)) return "A+H";
  if (normalized.includes("aereo") || normalized.includes("voo") || normalized.includes("passagem")) {
    return "Passagem Aérea";
  }
  if (normalized.includes("carro") || normalized.includes("carros") || normalized.includes("aluguel")) {
    return "Aluguel de Carro";
  }
  if (
    normalized.includes("hote") ||
    normalized.includes("pousada") ||
    normalized.includes("resort") ||
    normalized.includes("hosped")
  ) {
    return "Hotel";
  }
  if (normalized.includes("servi")) return "Serviços";
  if (normalized.includes("circuito")) return "Circuito";
  return value ? titleCaseWithExceptions(value) : "";
}

function getDestinoCidadeFromRoute(route: RouteInfo | null, tipo: string) {
  if (!route) return { destino: "", cidade: "" };
  const tipoNormalized = normalizeOcrText(tipo);
  if (isSeguroLabel(tipoNormalized)) {
    return { destino: "", cidade: "" };
  }
  if (isCarLabel(tipoNormalized)) {
    return { destino: "", cidade: "" };
  }
  if (isFlightLabel(tipoNormalized) || tipoNormalized.includes("passagem")) {
    const origin = route.origin || route.destination;
    return { destino: origin, cidade: origin };
  }
  if (isHotelLabel(tipoNormalized) || isServiceLabel(tipoNormalized)) {
    return { destino: route.origin || route.destination, cidade: route.destination || route.origin };
  }
  return { destino: route.destination || route.origin, cidade: route.destination || route.origin };
}

function isAddressLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  if (/(avenida|av\.|rua|travessa|estrada|praca|praça|largo|alameda|rodovia)/i.test(normalized)) {
    return true;
  }
  if (/\d{4}-\d{3}/.test(line)) return true;
  if (/\b(portugal|lisboa|porto|oporto)\b/i.test(normalized) && /\d/.test(line)) return true;
  return false;
}

function isHotelDetailLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  if (/(sem cafe|sem café|city design)/i.test(normalized)) return true;
  if (/\b\d+\s*(double|single|suite|room|quarto)\b/i.test(normalized)) return true;
  if (/\b(room|quarto)\b/i.test(normalized)) return true;
  return false;
}

function extractHotelNameFromLines(lines: string[]) {
  const candidates = lines.filter((line) => {
    const normalized = normalizeOcrText(line);
    if (!/[A-Za-zÀ-ÿ]/.test(line)) return false;
    if (isAddressLine(line)) return false;
    if (isHotelDetailLine(line)) return false;
    if (normalized.includes("preferencial") || normalized.includes("detalhes")) return false;
    if (normalized.includes("total") || normalized.includes("adulto") || normalized.includes("diarias")) return false;
    return true;
  });

  const hotelLine = candidates.find((line) => normalizeOcrText(line).includes("hotel"));
  if (hotelLine) return hotelLine;

  let afterDate = false;
  for (const line of candidates) {
    const normalized = normalizeOcrText(line);
    if (/\d{1,2}\s*de\s*[a-zçãõáéíóú]+\s*-\s*\d{1,2}\s*de\s*[a-zçãõáéíóú]+/i.test(normalized)) {
      afterDate = true;
      continue;
    }
    if (afterDate) return line;
  }

  return candidates[0] || null;
}

function extractHotelProductName(lines: string[]) {
  for (const line of lines) {
    const normalized = normalizeOcrText(line);
    if (!normalized.includes("hotel")) continue;
    if (normalized === "hotel" || normalized === "hoteis") continue;
    if (normalized.includes("avenida") || normalized.includes("rua") || normalized.includes("logradouro")) continue;
    return line;
  }
  return null;
}

function extractSeguroProductName() {
  return "SEGURO VIAGEM";
}

function extractServiceDescription(lines: string[]) {
  const keywords = [
    "transporte",
    "transfer",
    "traslado",
    "servico",
    "serviços",
    "ingresso",
    "passeio",
    "tour",
  ];
  const hasKeyword = (normalized: string) => keywords.some((keyword) => normalized.includes(keyword));
  const isValidCandidate = (line: string, cleaned: string, normalized: string) => {
    if (!normalized) return false;
    if (isCurrencyLine(line)) return false;
    if (normalized.includes("total")) return false;
    if (normalized.includes("detalhes")) return false;
    if (normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro")) return false;
    if (/travel/.test(normalized)) return false;
    if (/reembols/.test(normalized)) return false;
    if (isRouteLine(line) && !hasKeyword(normalized)) return false;
    if (isAddressLine(line)) return false;
    if (isDateOnlyLine(line)) return false;
    if (!/[A-Za-zÀ-ÿ]/.test(cleaned)) return false;
    if (/^\d+$/.test(normalized)) return false;
    return true;
  };

  const findKeywordLine = (fromIndex: number) => {
    for (let idx = fromIndex; idx < lines.length; idx += 1) {
      const line = lines[idx];
      const cleaned = cleanProductLine(line);
      const normalized = normalizeOcrText(cleaned);
      if (!isValidCandidate(line, cleaned, normalized)) continue;
      if (hasKeyword(normalized)) return cleaned;
    }
    return "";
  };

  let startIndex = 0;
  const routeIndex = lines.findIndex((line) => {
    if (!isRouteLine(line)) return false;
    const normalized = normalizeOcrText(line);
    // Evita tratar o próprio descritivo do passeio (que pode ter hífen) como linha de rota.
    if (hasKeyword(normalized)) return false;
    return true;
  });
  if (routeIndex >= 0) startIndex = routeIndex + 1;

  const keywordCandidate = findKeywordLine(startIndex);
  if (keywordCandidate) return keywordCandidate;

  if (startIndex > 0) {
    const fallbackKeywordCandidate = findKeywordLine(0);
    if (fallbackKeywordCandidate) return fallbackKeywordCandidate;
  }

  const candidates: string[] = [];
  for (let idx = startIndex; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const cleaned = cleanProductLine(line);
    const normalized = normalizeOcrText(cleaned);
    if (!isValidCandidate(line, cleaned, normalized)) continue;
    candidates.push(cleaned);
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  }

  return null;
}

const SERVICE_DESCRIPTION_HINTS = [
  "transporte",
  "transfer",
  "traslado",
  "passeio",
  "tour",
  "city break",
  "city tour",
  "ingresso",
  "vinhedo",
  "ski",
  "glaciar",
  "chalten",
  "lago",
  "parque nacional",
  "in/out",
  "in e out",
];

function looksLikeServiceProviderLabel(value: string) {
  const normalized = normalizeOcrText(value);
  if (!normalized) return false;
  if (SERVICE_DESCRIPTION_HINTS.some((hint) => normalized.includes(hint))) return false;
  if (isRouteLine(value) || isDateOnlyLine(value)) return false;
  if (/\d/.test(value)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  return true;
}

function extractServiceDescriptionFallback(lines: string[]) {
  let best = "";

  for (const line of lines) {
    const cleaned = cleanProductLine(line);
    const normalized = normalizeOcrText(cleaned);
    if (!normalized) continue;
    if (!SERVICE_DESCRIPTION_HINTS.some((hint) => normalized.includes(hint))) continue;
    if (isCurrencyLine(line)) continue;
    if (normalized.includes("total")) continue;
    if (normalized.includes("detalhes")) continue;
    if (normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro")) continue;
    if (/reembols/.test(normalized)) continue;
    if (isAddressLine(line) || isDateOnlyLine(line)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(cleaned)) continue;
    if (/^\d+$/.test(normalized)) continue;
    if (cleaned.length > best.length) best = cleaned;
  }

  return best || null;
}

function extractServiceNarrativeLine(lines: string[]) {
  let best = "";
  for (const line of lines) {
    const cleaned = cleanProductLine(line);
    const normalized = normalizeOcrText(cleaned);
    if (!normalized) continue;
    if (isCurrencyLine(line)) continue;
    if (normalized.includes("total")) continue;
    if (normalized.includes("detalhes")) continue;
    if (normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro")) continue;
    if (/reembols/.test(normalized)) continue;
    if (isAddressLine(line) || isDateOnlyLine(line)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(cleaned)) continue;
    if (/^\d+$/.test(normalized)) continue;

    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount < 5) continue;
    if (cleaned.length > best.length) best = cleaned;
  }
  return best || null;
}

function extractServicePrimaryLine(lines: string[]) {
  for (const line of lines) {
    const cleaned = cleanProductLine(line);
    const normalized = normalizeOcrText(cleaned);
    if (!normalized) continue;
    if (!SERVICE_DESCRIPTION_HINTS.some((hint) => normalized.includes(hint))) continue;
    if (isCurrencyLine(line)) continue;
    if (normalized.includes("total")) continue;
    if (normalized.includes("detalhes")) continue;
    if (normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro")) continue;
    if (/reembols/.test(normalized)) continue;
    if (isAddressLine(line) || isDateOnlyLine(line)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(cleaned)) continue;
    if (/^\d+$/.test(normalized)) continue;
    if (cleaned.length < 12) continue;
    return cleaned;
  }
  return "";
}

function pushUniqueLine(target: string[], value?: string | null) {
  const normalized = (value || "").trim();
  if (!normalized) return;
  if (target.some((line) => normalizeOcrText(line) === normalizeOcrText(normalized))) return;
  target.push(normalized);
}

function formatCurrencyLine(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isOccupancyTotalLine(line: string) {
  return /^total\s*\(/i.test(normalizeOcrText(line));
}

function isLikelyRoomLine(line: string) {
  return /^\d+\s+\S+/i.test((line || "").trim());
}

function isLikelyServiceCodeLine(line: string) {
  return /^\d{5,}$/.test((line || "").trim());
}

function isRegimeLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  return (
    normalized.includes("cafe da manha") ||
    normalized.includes("meia pensao") ||
    normalized.includes("pensao completa") ||
    normalized.includes("all inclusive") ||
    normalized.includes("sem refeicao")
  );
}

function findLikelyHotelAddressLine(lines: string[]) {
  for (const line of lines) {
    const cleaned = cleanProductLine(line);
    const normalized = normalizeOcrText(cleaned);
    if (!normalized) continue;
    if (isCurrencyLine(line) || isDateOnlyLine(line) || isRouteLine(line)) continue;
    if ((isLikelyRoomLine(line) && !cleaned.includes(",")) || isOccupancyTotalLine(line) || isRegimeLine(line)) continue;
    if (normalized.includes("total") || normalized.includes("detalhes")) continue;
    if (normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro")) continue;
    if (/(hotel|resort|pousada|suite|suíte|quarto|room)/i.test(normalized)) continue;
    if (/reembols/.test(normalized)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(cleaned)) continue;
    if (cleaned.length < 12) continue;
    if (cleaned.includes(",") || /\d{2,}/.test(cleaned)) return cleaned;
  }
  return "";
}

function extractOriginalFinalValuesFromLines(lines: string[]) {
  let valorOriginal = 0;
  let valorFinal = 0;
  let sawDiscountLine = false;

  for (const line of lines) {
    const values = extractAllCurrencyValues(line);
    if (!values.length) continue;
    const normalized = normalizeOcrText(line);
    if (normalized.includes("de r$") && normalized.includes(" por")) {
      sawDiscountLine = true;
      valorOriginal = values[0] || valorOriginal;
      valorFinal = values[values.length - 1] || valorFinal;
      continue;
    }
    if (sawDiscountLine) {
      valorFinal = values[values.length - 1] || valorFinal;
      continue;
    }
    valorFinal = values[values.length - 1] || valorFinal;
  }

  if (!valorFinal && valorOriginal) valorFinal = valorOriginal;
  return { valorOriginal, valorFinal };
}

function findLikelyServiceProviderLine(lines: string[], serviceDescription: string) {
  const serviceDescriptionNormalized = normalizeOcrText(serviceDescription);
  for (const line of lines) {
    const cleaned = cleanProductLine(line);
    const normalized = normalizeOcrText(cleaned);
    if (!normalized) continue;
    if (normalized === serviceDescriptionNormalized) continue;
    if (isCurrencyLine(line)) continue;
    if (normalized.includes("total") || normalized.includes("detalhes")) continue;
    if (normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro")) continue;
    if (isDateOnlyLine(line) || isRouteLine(line)) continue;
    if (isAddressLine(line) || isLikelyServiceCodeLine(line) || isOccupancyTotalLine(line)) continue;
    if (/reembols/.test(normalized)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(cleaned)) continue;
    if (SERVICE_DESCRIPTION_HINTS.some((hint) => normalized.includes(hint))) continue;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 5) continue;
    return cleaned;
  }
  return "";
}

function parseAdultChildCounts(text: string) {
  const normalized = normalizeOcrText(text);
  const adultsMatch = normalized.match(/(\d+)\s*adult/);
  const childrenMatch = normalized.match(/(\d+)\s*crianc/);
  return {
    adults: adultsMatch?.[1] ? Number(adultsMatch[1]) : 0,
    children: childrenMatch?.[1] ? Number(childrenMatch[1]) : 0,
  };
}

function buildSyntheticHotelImportText(lines: string[]) {
  const route = findRouteFromLines(lines)?.raw || "";
  const periodLine = lines.find((line) => {
    const normalized = normalizeOcrText(line);
    return /\d{1,2}\s*de\s*[a-zçãõáéíóú]+\s*-\s*\d{1,2}\s*de\s*[a-zçãõáéíóú]+/.test(normalized);
  }) || "";
  const hotelName = extractHotelNameFromLines(lines) || extractHotelProductName(lines) || "";
  const address = lines.find((line) => isAddressLine(line)) || findLikelyHotelAddressLine(lines) || "";
  const roomLine = lines.find((line) => isLikelyRoomLine(line)) || "";
  const regimeLine = lines.find((line) => isRegimeLine(line)) || "";
  const refundLine = lines.find((line) => normalizeOcrText(line).includes("reembols")) || "";
  const occupancyLine = lines.find((line) => isOccupancyTotalLine(line)) || "";
  const { valorOriginal, valorFinal } = extractOriginalFinalValuesFromLines(lines);

  const out: string[] = [];
  pushUniqueLine(out, periodLine);
  pushUniqueLine(out, route);
  pushUniqueLine(out, hotelName);
  pushUniqueLine(out, address);
  pushUniqueLine(out, roomLine);
  pushUniqueLine(out, regimeLine);
  pushUniqueLine(out, refundLine);
  pushUniqueLine(out, occupancyLine);
  if (valorOriginal > 0 && valorFinal > 0 && Math.abs(valorOriginal - valorFinal) > 0.009) {
    pushUniqueLine(out, `De ${formatCurrencyLine(valorOriginal)} por`);
  }
  if (valorFinal > 0) {
    pushUniqueLine(out, formatCurrencyLine(valorFinal));
  }
  return out.join("\n");
}

function buildSyntheticServiceImportText(lines: string[], fallbackDescription: string) {
  const dateLine = lines.find((line) => isDateOnlyLine(line)) || "";
  const route = findRouteFromLines(lines)?.raw || "";
  const serviceDescription =
    extractServicePrimaryLine(lines) ||
    extractServiceDescriptionFallback(lines) ||
    extractServiceNarrativeLine(lines) ||
    fallbackDescription ||
    "";
  const providerLine = findLikelyServiceProviderLine(lines, serviceDescription);
  const serviceCode = lines.find((line) => isLikelyServiceCodeLine(line)) || "";
  const refundLine = lines.find((line) => normalizeOcrText(line).includes("reembols")) || "";
  const occupancyLine = lines.find((line) => isOccupancyTotalLine(line)) || "";
  const { valorOriginal, valorFinal } = extractOriginalFinalValuesFromLines(lines);

  const out: string[] = [];
  pushUniqueLine(out, dateLine);
  pushUniqueLine(out, route);
  pushUniqueLine(out, serviceDescription);
  pushUniqueLine(out, providerLine);
  pushUniqueLine(out, serviceCode);
  pushUniqueLine(out, refundLine);
  pushUniqueLine(out, occupancyLine);
  if (valorOriginal > 0 && valorFinal > 0 && Math.abs(valorOriginal - valorFinal) > 0.009) {
    pushUniqueLine(out, `De ${formatCurrencyLine(valorOriginal)} por`);
  }
  if (valorFinal > 0) {
    pushUniqueLine(out, formatCurrencyLine(valorFinal));
  }
  return out.join("\n");
}

function parseStructuredHotelFromLines(lines: string[], baseYear: number): ImportedRoteiroHotel | null {
  const syntheticText = buildSyntheticHotelImportText(lines);
  if (!syntheticText.trim()) return null;
  const parsed = parseImportedRoteiroHotels(syntheticText, new Date(baseYear, 0, 1));
  return parsed[0] || null;
}

function parseStructuredPasseioFromLines(
  lines: string[],
  baseYear: number,
  fallbackDescription: string
): ImportedRoteiroPasseio | null {
  const syntheticText = buildSyntheticServiceImportText(lines, fallbackDescription);
  if (!syntheticText.trim()) return null;
  const parsed = parseImportedRoteiroPasseios(syntheticText, new Date(baseYear, 0, 1));
  return parsed[0] || null;
}

function pickFlightDateIsoFromDirectionDate(dateLine?: string | null, baseYear?: number) {
  const normalized = normalizeOcrText(dateLine || "");
  const match = normalized.match(/(\d{1,2})\s*de\s*([a-zçãõáéíóú]+)/i);
  if (!match) return "";
  const day = Number(match[1]);
  const month = parsePtMonth(match[2]);
  if (!day || !month) return "";
  return toIsoDate(day, month, baseYear || new Date().getFullYear());
}

function buildAereoImportSnapshotFromFlightDetails(
  details: FlightDetails | null,
  itemType: string,
  fallbackRoute: string,
  totalAmount: number,
  taxesAmount: number,
  startDate: string,
  endDate: string,
  quantity: number,
  adultos: number,
  criancas: number,
  baseYear: number
) {
  if (!details) return null;
  const fareTags = (details.fare_tags || []).filter(Boolean);
  const tarifaNome = fareTags.find((tag) => normalizeOcrText(tag).includes("tarifa")) || "";
  const reembolsoTipo =
    fareTags.find((tag) => normalizeOcrText(tag).includes("reembols")) ||
    (fareTags.length > 0 ? fareTags[fareTags.length - 1] : "");
  const segments = (details.directions || []).flatMap((direction) => {
    const dateIso = pickFlightDateIsoFromDirectionDate(direction.date, baseYear) || startDate || endDate || "";
    return (direction.legs || []).map((leg, idx) => ({
      ordem: idx,
      data_voo: dateIso,
      hora_saida: leg.departure_time || "",
      aeroporto_saida: leg.departure_code || "",
      cidade_saida: leg.departure_city || "",
      hora_chegada: leg.arrival_time || "",
      aeroporto_chegada: leg.arrival_code || "",
      cidade_chegada: leg.arrival_city || "",
      duracao_voo: leg.duration || "",
      tipo_voo: leg.flight_type || "",
      numero_voo: leg.flight_number || "",
    }));
  });

  return {
    tipo: itemType || "Passagem Aérea",
    trecho: details.route || fallbackRoute,
    cia_aerea: details.airline || "",
    classe_reserva: details.cabin || "",
    tarifa_nome: tarifaNome,
    reembolso_tipo: reembolsoTipo,
    qtd_adultos: adultos,
    qtd_criancas: criancas,
    quantidade: quantity,
    data_inicio: startDate || "",
    data_fim: endDate || startDate || "",
    valor_total: totalAmount,
    taxas: taxesAmount,
    segmentos: segments,
  };
}

function mapImportedAereoToQuoteItems(imported: ImportedRoteiroAereo[]): QuoteItemDraft[] {
  const ordered = (imported || []).slice().sort((a, b) => {
    const dateCompare = String(a.data_inicio || a.data_voo || "").localeCompare(
      String(b.data_inicio || b.data_voo || "")
    );
    if (dateCompare !== 0) return dateCompare;
    return String(a.hora_saida || "").localeCompare(String(b.hora_saida || ""));
  });

  return ordered.map((flight, index) => {
    const trecho = String(flight.trecho || "").trim();
    const cityName = trecho
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean)[0] || "";
    const quantidade = Math.max(1, Number(flight.qtd_adultos || 0) + Number(flight.qtd_criancas || 0) || 1);
    const total = Number(flight.valor_total || 0);
    const taxes = Number(flight.taxas || 0);
    const itemStart = String(flight.data_inicio || flight.data_voo || "").trim();
    const itemEnd = String(flight.data_fim || itemStart || "").trim();

    const details: FlightDetails = {
      route: trecho || undefined,
      airline: String(flight.cia_aerea || "").trim() || undefined,
      cabin: String(flight.classe_reserva || "").trim() || undefined,
      fare_tags: [flight.tarifa_nome, flight.reembolso_tipo]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
      directions: [
        {
          label: "Trecho",
          date: "",
          legs: [
            {
              departure_time: String(flight.hora_saida || "").trim() || undefined,
              departure_code: String(flight.aeroporto_saida || "").trim() || undefined,
              arrival_time: String(flight.hora_chegada || "").trim() || undefined,
              arrival_code: String(flight.aeroporto_chegada || "").trim() || undefined,
              duration: String(flight.duracao_voo || "").trim() || undefined,
              flight_type: String(flight.tipo_voo || "").trim() || undefined,
            },
          ],
        },
      ],
      baggage: [],
      notices: [],
    };

    return {
      temp_id: buildTempId(),
      item_type: "Passagem Aérea",
      title: trecho || "Passagem Aérea",
      product_name: trecho || "Passagem Aérea",
      city_name: cityName,
      quantity: quantidade,
      unit_price: quantidade > 0 ? total / quantidade : total,
      total_amount: total,
      taxes_amount: taxes,
      start_date: itemStart,
      end_date: itemEnd || itemStart,
      currency: "BRL",
      confidence: 0.82,
      order_index: index,
      segments: [],
      raw: {
        source: "text",
        format: "roteiro_aereo_import",
        aereo_import: flight,
        flight_details: details,
      },
    };
  });
}

function extractFlightRouteLine(lines: string[]) {
  const route = findRouteFromLines(lines);
  return route?.raw || null;
}

function extractRouteFromLine(line: string) {
  const cleaned = (line || "")
    .replace(/^(Ida|Volta)\s+/i, "")
    .replace(/\bVoo\b.*$/i, "")
    .trim();
  const trimmed = normalizeRouteCandidate(cleaned);
  const match = trimmed.match(ROUTE_LINE_REGEX);
  if (!match) return "";
  const origin = (match[1] || "").trim();
  const destination = (match[2] || "").trim();
  if (!origin || !destination) return "";
  return `${origin} - ${destination}`;
}

function isFlightDateLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  if (normalized.includes("feira")) return true;
  return /\d{1,2}\s*de\s*[a-zçãõáéíóú]+/.test(normalized);
}

function extractDurationFromLine(line: string) {
  const match = line.match(/(\d{1,2}\s*h\s*\d{1,2}\s*min)/i) || line.match(/(\d{1,2}h\s*\d{1,2}min)/i);
  if (!match?.[1]) return "";
  return match[1].replace(/\s+/g, " ").trim();
}

function extractTimeCodeFromLine(line: string) {
  const timeMatch = line.match(/\b(\d{2}:\d{2})\b/);
  const codeMatch = line.match(/\b([A-Z]{3})\b/);
  if (!timeMatch || !codeMatch) return null;
  return { time: timeMatch[1], code: codeMatch[1] };
}

function extractFlightNumberFromLine(line: string) {
  const match = line.match(/\b([A-Z]{1,3}\s?\d{3,5})\b/);
  if (!match?.[1]) return "";
  return match[1].replace(/\s+/g, " ").trim();
}

function isBaggageLine(line: string) {
  const normalized = normalizeOcrText(line);
  return normalized.includes("bagagem") || normalized.includes("bolsa") || normalized.includes("mochila");
}

function isNoticeLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  return normalized.startsWith("atencao") || normalized.includes("parada");
}

function isFareTagLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  return (
    normalized.includes("tarifa") ||
    normalized.includes("reembols") ||
    normalized.includes("nao reembols") ||
    normalized.includes("facil") ||
    normalized.includes("preferencial")
  );
}

function isCabinLine(line: string) {
  const normalized = normalizeOcrText(line);
  return normalized.includes("classe");
}

function isFlightTypeLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (normalized.includes("voo direto")) return "Voo direto";
  if (normalized.includes("voo com paradas")) return "Voo com paradas";
  return "";
}

function isPotentialAirlineLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  if (normalized.includes("detalhes") || normalized.includes("total")) return false;
  if (normalized.startsWith("ida") || normalized.startsWith("volta")) return false;
  if (normalized.includes("classe") || normalized.includes("tarifa") || normalized.includes("reembols")) return false;
  if (normalized.includes("voo")) return false;
  if (isRouteLine(line) || isDateOnlyLine(line)) return false;
  if (isBaggageLine(line) || isNoticeLine(line)) return false;
  if (extractTimeCodeFromLine(line)) return false;
  if (/\d/.test(line)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(line)) return false;
  return true;
}

function isCityLine(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return false;
  if (normalized.includes("voo") || normalized.includes("classe") || normalized.includes("bagagem")) return false;
  if (normalized.includes("tarifa") || normalized.includes("reembols")) return false;
  if (normalized.includes("total") || normalized.includes("detalhes")) return false;
  if (normalized.includes("inclui")) return false;
  if (normalized.includes("atencao") || normalized.includes("atenção") || normalized.includes("parada")) return false;
  if (/\d/.test(line)) return false;
  return /[A-Za-zÀ-ÿ]/.test(line);
}

function parseFlightDetailsFromLines(lines: string[], itemType?: string): FlightDetails | null {
  const baseLines = (lines || []).map((line) => (line || "").trim()).filter(Boolean);
  if (!baseLines.length) return null;
  const joined = baseLines.join(" ");
  if (!isFlightLabel(itemType || joined)) return null;

  const isAirHotel = isAirHotelLabel(itemType || joined);
  let hotelLines: string[] = [];
  let parseLines = baseLines;

  if (isAirHotel) {
    const hotelName =
      extractHotelNameFromLines(baseLines) || extractHotelProductName(baseLines) || "";
    if (hotelName) {
      const hotelIndex = baseLines.findIndex(
        (line) => normalizeOcrText(line) === normalizeOcrText(hotelName)
      );
      if (hotelIndex > 0) {
        hotelLines = baseLines.slice(hotelIndex);
        parseLines = baseLines.slice(0, hotelIndex);
      }
    }
  }

  const details: FlightDetails = {
    fare_tags: [],
    directions: [],
    baggage: [],
    notices: [],
  };
  const route = findRouteFromLines(parseLines);
  if (route?.raw) details.route = route.raw;

  let currentDirection: FlightDirection | null = null;
  let currentLeg: FlightLeg | null = null;
  let pendingCity: "departure" | "arrival" | null = null;
  let pendingTime: string | null = null;
  let pendingFlightType: string | null = null;
  let pendingFlightNumber: string | null = null;
  let pendingDuration: string | null = null;
  let attentionNext = false;
  let baggageSection = false;

  function applyPendingMeta(leg: FlightLeg) {
    if (pendingFlightType && !leg.flight_type) {
      leg.flight_type = pendingFlightType;
      pendingFlightType = null;
    }
    if (pendingFlightNumber && !leg.flight_number) {
      leg.flight_number = pendingFlightNumber;
      pendingFlightNumber = null;
    }
    if (pendingDuration && !leg.duration) {
      leg.duration = pendingDuration;
      pendingDuration = null;
    }
  }

  function applyTimeCode(time: string, code: string) {
    if (!currentDirection) {
      currentDirection = { label: "Trecho", legs: [] };
      details.directions.push(currentDirection);
    }
    if (!currentLeg || currentLeg.arrival_time) {
      currentLeg = {};
      currentDirection.legs.push(currentLeg);
    }
    if (!currentLeg.departure_time) {
      currentLeg.departure_time = time;
      currentLeg.departure_code = code;
      pendingCity = "departure";
    } else if (!currentLeg.arrival_time) {
      currentLeg.arrival_time = time;
      currentLeg.arrival_code = code;
      pendingCity = "arrival";
    }
    applyPendingMeta(currentLeg);
  }

  for (const line of parseLines) {
    const normalized = normalizeOcrText(line);
    if (!normalized) continue;
    if (normalized === "detalhes") continue;
    if (normalized.includes("total")) continue;

    if (normalized === "atencao") {
      attentionNext = true;
      continue;
    }

    const directionMatch = line.match(/^(Ida|Volta)\b/i);
    if (directionMatch) {
      const label = directionMatch[1];
      currentDirection = { label, route: extractRouteFromLine(line) || undefined, legs: [] };
      details.directions.push(currentDirection);
      currentLeg = null;
      pendingCity = null;
      pendingTime = null;
      continue;
    }

    if (currentDirection && !currentDirection.route && isRouteLine(line)) {
      currentDirection.route = extractRouteFromLine(line) || undefined;
      if (!details.route && currentDirection.route) details.route = currentDirection.route;
      continue;
    }

    if (isFlightDateLine(line)) {
      if (currentDirection) {
        currentDirection.date = line;
      }
      continue;
    }

    if (isFareTagLine(line)) {
      details.fare_tags.push(line);
      continue;
    }

    if (isCabinLine(line)) {
      const match = line.match(/^(.*?)(classe.*)$/i);
      if (match) {
        const airlineCandidate = (match[1] || "").trim();
        const cabinCandidate = (match[2] || "").trim();
        if (!details.airline && airlineCandidate && !isRouteLine(airlineCandidate)) {
          details.airline = airlineCandidate;
        }
        details.cabin = cabinCandidate || line;
      } else {
        details.cabin = line;
      }
      continue;
    }

    if (!details.airline && isPotentialAirlineLine(line)) {
      details.airline = line;
      continue;
    }

    if (attentionNext) {
      details.notices.push(line);
      attentionNext = false;
      continue;
    }

    if (isNoticeLine(line)) {
      if (currentDirection) {
        if (!currentDirection.notices) currentDirection.notices = [];
        currentDirection.notices.push(line);
      } else {
        details.notices.push(line);
      }
      continue;
    }

    if (normalized.includes("inclui") && (normalized.includes("bolsa") || normalized.includes("bagagem"))) {
      baggageSection = true;
      continue;
    }

    if (isBaggageLine(line)) {
      if (baggageSection || normalized.includes("bagagem") || normalized.includes("bolsa")) {
        details.baggage.push(line);
        continue;
      }
    }

    const timeCode = extractTimeCodeFromLine(line);
    if (timeCode) {
      pendingTime = null;
      applyTimeCode(timeCode.time, timeCode.code);
      continue;
    }

    if (isLikelyTimeLine(line)) {
      pendingTime = line.trim();
      continue;
    }

    if (pendingTime && isLikelyAirportCode(line)) {
      applyTimeCode(pendingTime, line.trim());
      pendingTime = null;
      continue;
    }

    if (pendingCity && isCityLine(line) && currentLeg) {
      if (pendingCity === "departure" && !currentLeg.departure_city) {
        currentLeg.departure_city = line;
      } else if (pendingCity === "arrival" && !currentLeg.arrival_city) {
        currentLeg.arrival_city = line;
      }
      pendingCity = null;
      continue;
    }

    const duration = extractDurationFromLine(line);
    if (duration && currentLeg) {
      currentLeg.duration = duration;
      continue;
    }

    const flightType = isFlightTypeLine(line);
    if (flightType) {
      if (currentLeg && !currentLeg.flight_type) {
        currentLeg.flight_type = flightType;
      } else {
        pendingFlightType = flightType;
      }
      continue;
    }

    const flightNumber = extractFlightNumberFromLine(line);
    if (flightNumber) {
      if (currentLeg && !currentLeg.flight_number) {
        currentLeg.flight_number = flightNumber;
      } else {
        pendingFlightNumber = flightNumber;
      }
      continue;
    }

    if (duration) {
      pendingDuration = duration;
      continue;
    }
  }

  details.fare_tags = Array.from(new Set(details.fare_tags.map((tag) => tag.trim()).filter(Boolean)));
  details.baggage = Array.from(new Set(details.baggage.map((tag) => tag.trim()).filter(Boolean)));
  details.notices = Array.from(new Set(details.notices.map((tag) => tag.trim()).filter(Boolean)));

  details.directions = details.directions.filter((dir) => {
    const hasLegs = dir.legs && dir.legs.length > 0;
    const hasMeta = Boolean(dir.route || dir.date || (dir.notices || []).length);
    return hasLegs || hasMeta;
  });

  if (hotelLines.length) {
    details.hotel_lines = hotelLines;
  }

  const hasDetails =
    Boolean(details.route) ||
    Boolean(details.airline) ||
    Boolean(details.cabin) ||
    details.fare_tags.length > 0 ||
    details.directions.length > 0 ||
    details.baggage.length > 0 ||
    details.notices.length > 0 ||
    Boolean(details.hotel_lines?.length);
  return hasDetails ? details : null;
}

function extractProductByType(lines: string[], tipo: string) {
  const tipoNormalized = normalizeOcrText(tipo);
  if (isSeguroLabel(tipoNormalized)) return extractSeguroProductName();
  if (isCarLabel(tipoNormalized)) return "Aluguel de Carro";
  if (isHotelLabel(tipoNormalized)) {
    return extractHotelNameFromLines(lines) || extractHotelProductName(lines) || null;
  }
  if (isServiceLabel(tipoNormalized)) {
    return extractServiceDescription(lines);
  }
  if (isFlightLabel(tipoNormalized) || tipoNormalized.includes("passagem")) {
    return extractFlightRouteLine(lines);
  }
  return null;
}

function parseProduto(text: string, tipo?: string) {
  const rawLines = splitTextLines(text);
  const cleaned = rawLines
    .map((line) => cleanProductLine(line))
    .filter((line) => {
      const normalized = normalizeOcrText(line);
      if (!/[A-Za-zÀ-ÿ]/.test(line)) return false;
      if (normalized.includes("r$")) return false;
      if (normalized.includes("total")) return false;
      if (normalized.includes("periodo")) return false;
      if (normalized.includes("diarias")) return false;
      if (normalized.includes("reembols")) return false;
      if (normalized.includes("nao reembols")) return false;
      if (normalized.includes("informacoes")) return false;
      if (normalized.includes("detalhes")) return false;
      if (normalized.includes("preferencial")) return false;
      if (normalized.includes("tarifa")) return false;
      if (normalized.includes("adulto")) return false;
      if (normalized.includes("pax")) return false;
      if (normalized.includes("taxas")) return false;
      if (normalized.includes("assist")) return false;
      if (normalized.includes("travel")) return false;
      if (normalized.includes("dmc")) return false;
      if (normalized.includes("fornecedor")) return false;
      if (isRouteLine(line)) return false;
      if (isDateOnlyLine(line)) return false;
      if (isAddressLine(line)) return false;
      if (/^[0-9\s]+$/.test(line)) return false;
      return true;
    });
  const tipoNormalized = normalizeOcrText(tipo || "");
  if (isSeguroLabel(tipoNormalized)) {
    return extractSeguroProductName();
  }
  if (isCarLabel(tipoNormalized)) {
    return "Aluguel de Carro";
  }
  if (isServiceLabel(tipoNormalized)) {
    const serviceText = extractServiceDescription(rawLines);
    if (serviceText) return serviceText;
  }
  if (isHotelLabel(tipoNormalized)) {
    const hotelName = extractHotelNameFromLines(rawLines) || extractHotelProductName(rawLines);
    if (hotelName) return hotelName;
  }
  if (isFlightLabel(tipoNormalized)) {
    const route = extractFlightRouteLine(rawLines);
    if (route) return route;
  }

  if (cleaned.length === 0) return "";

  const combined = cleaned.join(" ").replace(/\s+/g, " ").trim();
  if (combined) return combined;
  return cleaned[0] || "";
}

function parseTipoProduto(text: string) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const candidate = lines.find((line) => /[A-Za-zÀ-ÿ]/.test(line)) || "";
  return candidate ? canonicalizeTipoLabel(candidate) : "";
}

function detectCardTypeLabel(lines: string[]) {
  for (const line of lines) {
    const normalized = normalizeOcrText(line);
    if (normalized.includes("seguro") && normalized.includes("viagem")) return "Seguro viagem";
    if (normalized.includes("servi")) return "Serviços";
    if (normalized.includes("carro")) return "Aluguel de Carro";
    if (isAirHotelLabel(normalized)) return "A+H";
    if (normalized.includes("aereo")) return "Passagem Aérea";
    if (normalized.includes("hote")) return "Hotel";
  }
  return "";
}

function inferTipoLabelFromText(text: string, fallbackLabel: string) {
  const normalized = normalizeOcrText(text);
  if (normalized.includes("ingresso")) return "Serviços";
  if (normalized.includes("seguro")) return "Seguro viagem";
  if (normalized.includes("carro") || normalized.includes("locacao") || normalized.includes("aluguel")) {
    return "Aluguel de Carro";
  }
  if (isAirHotelLabel(normalized)) return "A+H";
  if (normalized.includes("pacote")) return "Pacote";
  if (normalized.includes("aereo") || normalized.includes("voo") || normalized.includes("passagem")) return "Passagem Aérea";
  if (normalized.includes("hotel") || normalized.includes("pousada") || normalized.includes("resort") || normalized.includes("flat")) return "Hotel";
  if (normalized.includes("passeio")) return "Serviços";
  if (normalized.includes("transporte") || normalized.includes("transfer") || normalized.includes("traslado")) return "Serviços";
  return fallbackLabel ? canonicalizeTipoLabel(fallbackLabel) : "";
}

function isTipoProdutoValido(text: string) {
  const normalized = normalizeOcrText(text || "");
  if (!normalized) return false;
  const compact = normalized.replace(/\s+/g, "");
  if (TIPO_PRODUTO_WHITELIST.some((tipo) => normalized.includes(normalizeOcrText(tipo)))) {
    return true;
  }
  if (
    TIPO_PRODUTO_WHITELIST.some((tipo) =>
      compact.includes(normalizeOcrText(tipo).replace(/\s+/g, ""))
    )
  ) {
    return true;
  }
  return ITEM_KEYWORDS.some((keyword) => normalized.includes(keyword) || compact.includes(keyword));
}

function pageHasSkipKeywords(text: string) {
  const normalized = normalizeOcrText(text || "");
  return PAGE_SKIP_KEYWORDS.some((keyword) => normalized.includes(normalizeOcrText(keyword)));
}

function pageHasItemKeywords(text: string) {
  const normalized = normalizeOcrText(text || "");
  return ITEM_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function extractYearFromText(text: string) {
  const match = text.match(/20\d{2}/);
  if (!match) return null;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : null;
}

function cropCanvas(source: HTMLCanvasElement, region: { x1: number; y1: number; x2: number; y2: number }) {
  const width = Math.max(1, Math.round(region.x2 - region.x1));
  const height = Math.max(1, Math.round(region.y2 - region.y1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(
      source,
      region.x1,
      region.y1,
      width,
      height,
      0,
      0,
      width,
      height
    );
  }
  return canvas;
}

function preprocessOcrCanvas(input: HTMLCanvasElement, mode: "text" | "numbers") {
  const scale = mode === "numbers" ? 2 : 1.6;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(input.width * scale));
  canvas.height = Math.max(1, Math.round(input.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return input;
  ctx.drawImage(input, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    sum += gray;
  }
  const avg = sum / (data.length / 4);
  const threshold = avg + (mode === "numbers" ? 10 : 0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = mode === "numbers" ? (gray > threshold ? 255 : 0) : gray;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function ocrCanvasRegion(worker: any, canvas: HTMLCanvasElement, mode: "text" | "numbers") {
  if (typeof worker.setParameters === "function") {
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      tessedit_char_whitelist: mode === "numbers" ? OCR_NUMBER_WHITELIST : OCR_TEXT_WHITELIST,
      preserve_interword_spaces: "1",
    });
  }
  const processed = preprocessOcrCanvas(canvas, mode);
  const { data } = await worker.recognize(processed);
  return {
    text: data?.text || "",
    confidence: typeof data?.confidence === "number" ? data.confidence / 100 : 0,
  };
}

async function ocrCanvasLines(worker: any, canvas: HTMLCanvasElement): Promise<TextItemBox[]> {
  if (typeof worker.setParameters === "function") {
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      tessedit_char_whitelist: OCR_TEXT_WHITELIST,
      preserve_interword_spaces: "1",
    });
  }
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  const blocks = (data?.blocks || []) as Array<{
    paragraphs?: Array<{
      lines?: Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
    }>;
  }>;
  const extracted: TextItemBox[] = [];
  blocks.forEach((block) => {
    (block.paragraphs || []).forEach((paragraph) => {
      (paragraph.lines || []).forEach((line) => {
        const text = (line.text || "").trim();
        if (!text) return;
        const bbox = line.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
        extracted.push({
          x1: bbox.x0,
          y1: bbox.y0,
          x2: bbox.x1,
          y2: bbox.y1,
          text,
        });
      });
    });
  });
  if (extracted.length > 0) {
    return extracted.filter((line) => line.x2 > line.x1 && line.y2 > line.y1);
  }
  const fallbackText = (data?.text || "").trim();
  if (!fallbackText) return [];
  return fallbackText
    .split(/\r?\n/)
    .map((line, idx) => ({
      x1: 0,
      y1: idx * 12,
      x2: canvas.width,
      y2: idx * 12 + 10,
      text: line.trim(),
    }))
    .filter((line) => line.text);
}

function extractTextItemsFromPdfPage(page: any, viewport: any, pdfjsLib: any): Promise<TextItemBox[]> {
  return page.getTextContent().then((content: any) => {
    const items = (content.items || []) as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>;
    const boxes: TextItemBox[] = [];
    items.forEach((item) => {
      const text = (item.str || "").trim();
      if (!text) return;
      const transform = pdfjsLib.Util.transform(viewport.transform, item.transform || [1, 0, 0, 1, 0, 0]);
      const x = transform[4];
      const y = transform[5];
      const height = Math.hypot(transform[2], transform[3]) || 0;
      const width = (item.width || 0) * viewport.scale;
      const yTop = y - height;
      if (width <= 0 || height <= 0) return;
      boxes.push({
        x1: x,
        y1: yTop,
        x2: x + width,
        y2: yTop + height,
        text,
      });
    });
    return boxes;
  });
}

function groupTextLines(boxes: TextItemBox[], pageHeight: number) {
  if (!boxes.length) return [];
  const lineGap = Math.max(6, pageHeight * 0.0035);
  const sorted = [...boxes].sort((a, b) => a.y1 - b.y1);
  const lines: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    centerY: number;
    texts: Array<{ x: number; text: string }>;
    count: number;
  }> = [];
  sorted.forEach((item) => {
    const centerY = (item.y1 + item.y2) / 2;
    const line = lines.find((l) => Math.abs(l.centerY - centerY) <= lineGap);
    if (!line) {
      lines.push({
        x1: item.x1,
        y1: item.y1,
        x2: item.x2,
        y2: item.y2,
        centerY,
        texts: [{ x: item.x1, text: item.text }],
        count: 1,
      });
    } else {
      line.x1 = Math.min(line.x1, item.x1);
      line.y1 = Math.min(line.y1, item.y1);
      line.x2 = Math.max(line.x2, item.x2);
      line.y2 = Math.max(line.y2, item.y2);
      line.centerY = (line.centerY * line.count + centerY) / (line.count + 1);
      line.texts.push({ x: item.x1, text: item.text });
      line.count += 1;
    }
  });
  return lines
    .sort((a, b) => a.y1 - b.y1)
    .map((line) => ({
      x1: line.x1,
      y1: line.y1,
      x2: line.x2,
      y2: line.y2,
      text: line.texts.sort((a, b) => a.x - b.x).map((t) => t.text).join(" ").trim(),
    }));
}

function detectCardsFromTypeLabels(
  boxes: TextItemBox[],
  pageWidth: number,
  pageHeight: number,
  pageIndex = 0
) {
  const lines = groupTextLines(boxes, pageHeight);
  if (lines.length === 0) return [];
  const anchors = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => isTipoProdutoValido(line.text) || inferTipoLabelFromText(line.text, "") !== "");
  if (anchors.length === 0) return [];
  const cards: CardBBox[] = [];
  const padding = Math.max(12, pageHeight * 0.012);
  const minHeight = Math.max(90, pageHeight * 0.09);
  const gapLimit = Math.max(24, pageHeight * 0.02);

  anchors.forEach(({ line: anchorLine, idx }, anchorIdx) => {
    const nextAnchor = anchors[anchorIdx + 1];
    let endIndex = lines.length - 1;
    for (let i = idx + 1; i < lines.length; i += 1) {
      if (nextAnchor && i >= nextAnchor.idx) {
        endIndex = nextAnchor.idx - 1;
        break;
      }
      const prev = lines[i - 1];
      if (lines[i].y1 - prev.y2 > gapLimit) {
        endIndex = i - 1;
        break;
      }
    }
    const slice = lines.slice(idx, endIndex + 1);
    if (!slice.length) return;
    const y1 = Math.max(0, anchorLine.y1 - padding);
    const y2 = Math.min(pageHeight, slice[slice.length - 1].y2 + padding);
    if (y2 - y1 < minHeight) return;
    cards.push({
      pageIndex,
      x1: 0,
      y1,
      x2: pageWidth,
      y2,
    });
  });
  return cards;
}

function detectCardsFromImageData(
  imageData: ImageData,
  pageWidth: number,
  pageHeight: number,
  pageIndex = 0
): CardBBox[] {
  const data = imageData.data;
  const step = 2;
  const rowContent: boolean[] = new Array(pageHeight).fill(false);
  const rowThreshold = 0.015;
  for (let y = 0; y < pageHeight; y += step) {
    let darkCount = 0;
    let samples = 0;
    for (let x = 0; x < pageWidth; x += step) {
      const idx = (y * pageWidth + x) * 4;
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      if (gray < 220) darkCount += 1;
      samples += 1;
    }
    if (samples > 0 && darkCount / samples > rowThreshold) rowContent[y] = true;
  }

  const blocks: Array<{ y1: number; y2: number }> = [];
  let inBlock = false;
  let start = 0;
  let gap = 0;
  const gapMax = Math.max(6, Math.round(pageHeight * 0.01));
  for (let y = 0; y < pageHeight; y += step) {
    if (rowContent[y]) {
      if (!inBlock) {
        inBlock = true;
        start = y;
      }
      gap = 0;
      continue;
    }
    if (!inBlock) continue;
    gap += step;
    if (gap <= gapMax) continue;
    const end = y - gap;
    if (end > start) blocks.push({ y1: start, y2: end });
    inBlock = false;
    gap = 0;
    start = 0;
  }
  if (inBlock && start > 0) {
    blocks.push({ y1: start, y2: pageHeight });
  }

  const minHeight = Math.max(70, pageHeight * 0.07);
  const cards: CardBBox[] = [];
  blocks.forEach((block) => {
    if (block.y2 - block.y1 < minHeight) return;
    let minX = pageWidth;
    let maxX = 0;
    for (let x = 0; x < pageWidth; x += step) {
      let darkCount = 0;
      let samples = 0;
      for (let y = block.y1; y <= block.y2; y += step) {
        const idx2 = (y * pageWidth + x) * 4;
        const gray = data[idx2] * 0.299 + data[idx2 + 1] * 0.587 + data[idx2 + 2] * 0.114;
        if (gray < 220) darkCount += 1;
        samples += 1;
      }
      if (samples > 0 && darkCount / samples > 0.02) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    if (maxX - minX < pageWidth * 0.25) return;
    cards.push({
      pageIndex,
      x1: 0,
      y1: clamp(block.y1 - 10, 0, pageHeight),
      x2: pageWidth,
      y2: clamp(block.y2 + 10, 0, pageHeight),
    });
  });
  return cards;
}

function detectCardsFromTextItems(
  boxes: TextItemBox[],
  pageWidth: number,
  pageHeight: number,
  pageIndex = 0
): CardBBox[] {
  const lines = groupTextLines(boxes, pageHeight);
  if (!lines.length) return [];
  const sortedLines = [...lines].sort((a, b) => a.y1 - b.y1);
  const cards: Array<{ x1: number; y1: number; x2: number; y2: number; lines: number }> = [];
  const cardGap = Math.max(14, pageHeight * 0.015);
  let current: { x1: number; y1: number; x2: number; y2: number; lines: number } | null = null;

  sortedLines.forEach((line) => {
    if (!current) {
      current = { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2, lines: 1 };
      return;
    }
    if (line.y1 - current.y2 > cardGap) {
      cards.push(current);
      current = { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2, lines: 1 };
      return;
    }
    current.x1 = Math.min(current.x1, line.x1);
    current.y1 = Math.min(current.y1, line.y1);
    current.x2 = Math.max(current.x2, line.x2);
    current.y2 = Math.max(current.y2, line.y2);
    current.lines += 1;
  });
  if (current) cards.push(current);

  const minHeight = Math.max(70, pageHeight * 0.07);
  const minWidth = Math.max(200, pageWidth * 0.25);
  return cards
    .filter((card) => card.lines >= 2)
    .filter((card) => card.y2 - card.y1 >= minHeight && card.x2 - card.x1 >= minWidth)
    .map((card) => ({
      pageIndex,
      x1: 0,
      y1: clamp(card.y1 - 10, 0, pageHeight),
      x2: pageWidth,
      y2: clamp(card.y2 + 10, 0, pageHeight),
    }));
}

function filterCardsByZone(cards: CardBBox[], zone?: { x1: number; y1: number; x2: number; y2: number }) {
  if (!zone) return cards;
  return cards.filter((card) => card.y1 >= zone.y2 || card.y2 <= zone.y1);
}

function buildCardRegions(card: CardBBox) {
  const width = card.x2 - card.x1;
  const height = card.y2 - card.y1;
  return {
    titleLeft: {
      x1: card.x1 + OCR_CARD_REGIONS.titleLeft.x1 * width,
      y1: card.y1 + OCR_CARD_REGIONS.titleLeft.y1 * height,
      x2: card.x1 + OCR_CARD_REGIONS.titleLeft.x2 * width,
      y2: card.y1 + OCR_CARD_REGIONS.titleLeft.y2 * height,
    },
    topRight: {
      x1: card.x1 + OCR_CARD_REGIONS.topRight.x1 * width,
      y1: card.y1 + OCR_CARD_REGIONS.topRight.y1 * height,
      x2: card.x1 + OCR_CARD_REGIONS.topRight.x2 * width,
      y2: card.y1 + OCR_CARD_REGIONS.topRight.y2 * height,
    },
    middle: {
      x1: card.x1 + OCR_CARD_REGIONS.middle.x1 * width,
      y1: card.y1 + OCR_CARD_REGIONS.middle.y1 * height,
      x2: card.x1 + OCR_CARD_REGIONS.middle.x2 * width,
      y2: card.y1 + OCR_CARD_REGIONS.middle.y2 * height,
    },
    product: {
      x1: card.x1 + OCR_CARD_REGIONS.product.x1 * width,
      y1: card.y1 + OCR_CARD_REGIONS.product.y1 * height,
      x2: card.x1 + OCR_CARD_REGIONS.product.x2 * width,
      y2: card.y1 + OCR_CARD_REGIONS.product.y2 * height,
    },
  };
}

function buildTempId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

async function shouldSkipPage(page: any, viewport: any, canvas: HTMLCanvasElement, pdfjsLib: any, worker: any) {
  try {
    const textBoxes = await extractTextItemsFromPdfPage(page, viewport, pdfjsLib);
    const topLimit = canvas.height * 0.45;
    const topText = textBoxes
      .filter((b) => b.y2 <= topLimit)
      .map((b) => b.text)
      .join(" ");
    const allText = textBoxes.map((b) => b.text).join(" ");
    if (pageHasSkipKeywords(topText) && !pageHasItemKeywords(allText)) return true;
  } catch (e) {
    // ignore and fallback to OCR
  }

  const topRegion = cropCanvas(canvas, {
    x1: 0,
    y1: 0,
    x2: canvas.width,
    y2: canvas.height * 0.45,
  });
  const topOcr = await ocrCanvasRegion(worker, topRegion, "text");
  return pageHasSkipKeywords(topOcr.text) && !pageHasItemKeywords(topOcr.text);
}

async function extractItemsFromCards(
  canvas: HTMLCanvasElement,
  cards: CardBBox[],
  worker: any,
  baseYear: number,
  pageNumber: number,
  debug: boolean,
  debugImages: ImportDebugImage[]
): Promise<QuoteItemDraft[]> {
  const result: QuoteItemDraft[] = [];
  const sortedCards = [...cards].sort((a, b) => a.y1 - b.y1);
  for (let idx = 0; idx < sortedCards.length; idx += 1) {
    const card = sortedCards[idx];
    const regions = buildCardRegions(card);
    const titleCanvas = cropCanvas(canvas, regions.titleLeft);
    const topRightCanvas = cropCanvas(canvas, regions.topRight);
    const middleCanvas = cropCanvas(canvas, regions.middle);
    const productCanvas = cropCanvas(canvas, regions.product);

    const titleOcr = await ocrCanvasRegion(worker, titleCanvas, "text");
    const topRightOcr = await ocrCanvasRegion(worker, topRightCanvas, "numbers");
    const middleOcr = await ocrCanvasRegion(worker, middleCanvas, "text");
    const productOcr = await ocrCanvasRegion(worker, productCanvas, "text");

    let tipoProduto = canonicalizeTipoLabel(parseTipoProduto(titleOcr.text));
    let tipoValido = isTipoProdutoValido(tipoProduto) || isTipoProdutoValido(titleOcr.text);
    if (!tipoValido) {
      tipoProduto = canonicalizeTipoLabel(parseTipoProduto(middleOcr.text));
      tipoValido = isTipoProdutoValido(tipoProduto) || isTipoProdutoValido(middleOcr.text);
    }

    const combinedText = `${titleOcr.text}\n${middleOcr.text}\n${productOcr.text}\n${topRightOcr.text}`;
    const inferredTipo = inferTipoLabelFromText(combinedText, tipoProduto);
    if (!tipoValido && inferredTipo) {
      tipoProduto = canonicalizeTipoLabel(inferredTipo);
      tipoValido = true;
    }

    const qtePax = parseQuantidadePax(topRightOcr.text);
    const valorLines = splitTextLines(`${topRightOcr.text}\n${middleOcr.text}\n${productOcr.text}\n${titleOcr.text}`);
    let valorInfo = parseValorFromLines(valorLines, tipoProduto);
    if (valorInfo.valor <= 0) {
      const width = card.x2 - card.x1;
      const height = card.y2 - card.y1;
      const fallbackRegion = cropCanvas(canvas, {
        x1: card.x1 + width * 0.55,
        y1: card.y1,
        x2: card.x2,
        y2: card.y1 + height * 0.6,
      });
      const fallbackOcr = await ocrCanvasRegion(worker, fallbackRegion, "numbers");
      valorInfo = parseValorFromLines(splitTextLines(fallbackOcr.text), tipoProduto);
    }
    if (valorInfo.valor <= 0) {
      const fullCard = cropCanvas(canvas, {
        x1: card.x1,
        y1: card.y1,
        x2: card.x2,
        y2: card.y2,
      });
      const cardOcr = await ocrCanvasRegion(worker, fullCard, "numbers");
      valorInfo = parseValorFromLines(splitTextLines(cardOcr.text), tipoProduto);
    }

    const combinedLines = splitTextLines(combinedText);
    const routeInfo = findRouteFromLines(combinedLines);
    const destinoCidade = getDestinoCidadeFromRoute(routeInfo, tipoProduto);
    let periodoInfo = parsePeriodoIso(middleOcr.text, baseYear);
    if (!periodoInfo.start) {
      periodoInfo = parsePeriodoIso(productOcr.text, baseYear);
    }
    const cityFromRoute = destinoCidade.destino;
    const allowCidadeFallback = !isSeguroLabel(tipoProduto) && !isCarLabel(tipoProduto);
    const cidade = cityFromRoute || (allowCidadeFallback ? parseCidade(middleOcr.text) || parseCidade(productOcr.text) : "");
    const productSources = [
      combinedText,
      `${titleOcr.text}\n${middleOcr.text}\n${productOcr.text}`,
      `${middleOcr.text}\n${productOcr.text}`,
      middleOcr.text,
      productOcr.text,
    ];
    let produto = "";
    for (const source of productSources) {
      if (!source) continue;
      const sourceLines = splitTextLines(source);
      produto = extractProductByType(sourceLines, tipoProduto) || parseProduto(source, tipoProduto);
      if (produto) break;
    }
    if (!produto && routeInfo?.raw) {
      produto = routeInfo.raw;
    }

    const missingFields =
      (tipoProduto ? 0 : 1) +
      (valorInfo.valor > 0 ? 0 : 1) +
      (periodoInfo.start ? 0 : 1) +
      (produto ? 0 : 1);
    const avgConfidence =
      (titleOcr.confidence + topRightOcr.confidence + middleOcr.confidence + productOcr.confidence) / 4;
    const confidence = clamp(avgConfidence - missingFields * 0.12, 0, 1);

    if (!tipoValido && (produto || valorInfo.valor > 0)) {
      tipoProduto = inferredTipo || "Serviços";
      tipoValido = true;
    }
    if (!tipoValido) continue;

    const totalAmount = valorInfo.valor;
    if (totalAmount <= 0 && !produto) {
      continue;
    }

    if (debug) {
      const baseLabel = `p${pageNumber}-c${idx + 1}`;
      debugImages.push({
        label: `${baseLabel}-title`,
        data_url: titleCanvas.toDataURL("image/png"),
        page: pageNumber,
        card_index: idx + 1,
      });
      debugImages.push({
        label: `${baseLabel}-topright`,
        data_url: topRightCanvas.toDataURL("image/png"),
        page: pageNumber,
        card_index: idx + 1,
      });
      debugImages.push({
        label: `${baseLabel}-middle`,
        data_url: middleCanvas.toDataURL("image/png"),
        page: pageNumber,
        card_index: idx + 1,
      });
      debugImages.push({
        label: `${baseLabel}-product`,
        data_url: productCanvas.toDataURL("image/png"),
        page: pageNumber,
        card_index: idx + 1,
      });
    }

    let flightDetails: FlightDetails | null = null;
    if (isFlightLabel(tipoProduto)) {
      const fullCard = cropCanvas(canvas, {
        x1: card.x1,
        y1: card.y1,
        x2: card.x2,
        y2: card.y2,
      });
      const flightOcr = await ocrCanvasRegion(worker, fullCard, "text");
      flightDetails =
        parseFlightDetailsFromLines(splitTextLines(flightOcr.text), tipoProduto) ||
        parseFlightDetailsFromLines(combinedLines, tipoProduto);
    }

    result.push({
      temp_id: buildTempId(),
      item_type: tipoProduto || "Serviços",
      title: produto || tipoProduto || "Item",
      product_name: produto || "",
      city_name: cidade || "",
      quantity: qtePax || 1,
      unit_price: qtePax > 0 ? totalAmount / qtePax : totalAmount,
      total_amount: totalAmount,
      taxes_amount: 0,
      start_date: periodoInfo.start || "",
      end_date: periodoInfo.end || periodoInfo.start || "",
      currency: valorInfo.moeda || "BRL",
      confidence,
      segments: [],
      raw: {
        page: pageNumber,
        card_bbox: [card.x1, card.y1, card.x2, card.y2],
        missing_fields: missingFields,
        city_label: destinoCidade.cidade || "",
        regions: {
          title: titleOcr,
          top_right: topRightOcr,
          middle: middleOcr,
          product: productOcr,
        },
        ...(flightDetails ? { flight_details: flightDetails } : {}),
      },
    });
  }
  return result;
}

function buildItemKey(item: QuoteItemDraft) {
  const keyParts = [
    normalizeOcrText(item.item_type),
    normalizeOcrText(item.product_name),
    normalizeOcrText(item.city_name),
    item.start_date || "",
    item.total_amount.toFixed(2),
  ];
  return keyParts.join("|");
}

function dedupeItems(items: QuoteItemDraft[]) {
  const map = new Map<string, QuoteItemDraft>();
  items.forEach((item) => {
    const key = buildItemKey(item);
    if (!map.has(key)) map.set(key, item);
  });
  return Array.from(map.values());
}

function parseIsoDateSafe(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTimeToMinutes(value?: string | null) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.MAX_SAFE_INTEGER;
  return hour * 60 + minute;
}

function extractItemStartMinutes(item: QuoteItemDraft) {
  const raw = (item.raw || {}) as {
    aereo_import?: { segmentos?: Array<{ hora_saida?: string }>; hora_saida?: string };
    flight_details?: { directions?: Array<{ legs?: Array<{ departure_time?: string }> }> };
  };

  const importedSegmentTime = raw.aereo_import?.segmentos?.find((segment) => String(segment?.hora_saida || "").trim())?.hora_saida;
  if (importedSegmentTime) return parseTimeToMinutes(importedSegmentTime);

  if (raw.aereo_import?.hora_saida) return parseTimeToMinutes(raw.aereo_import.hora_saida);

  const detailTime = raw.flight_details?.directions
    ?.flatMap((direction) => direction.legs || [])
    ?.find((leg) => String(leg?.departure_time || "").trim())?.departure_time;
  if (detailTime) return parseTimeToMinutes(detailTime);

  return Number.MAX_SAFE_INTEGER;
}

function sortItemsByDate(items: QuoteItemDraft[]) {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((left, right) => {
      const leftStart = parseIsoDateSafe(left.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightStart = parseIsoDateSafe(right.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftStart !== rightStart) return leftStart - rightStart;

      const leftTime = extractItemStartMinutes(left.item);
      const rightTime = extractItemStartMinutes(right.item);
      if (leftTime !== rightTime) return leftTime - rightTime;

      const leftEnd = parseIsoDateSafe(left.item.end_date || left.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightEnd = parseIsoDateSafe(right.item.end_date || right.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftEnd !== rightEnd) return leftEnd - rightEnd;

      const typeCompare = normalizeOcrText(left.item.item_type).localeCompare(
        normalizeOcrText(right.item.item_type)
      );
      if (typeCompare !== 0) return typeCompare;

      const titleCompare = normalizeOcrText(left.item.title).localeCompare(
        normalizeOcrText(right.item.title)
      );
      if (titleCompare !== 0) return titleCompare;

      return left.idx - right.idx;
    })
    .map(({ item }, index) => ({
      ...item,
      order_index: index,
    }));
}

function parseItemsFromFullText(text: string, baseYear: number, pageNumber: number): QuoteItemDraft[] {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const blocks: string[][] = [];
  let current: string[] = [];

  lines.forEach((line) => {
    const normalized = normalizeOcrText(line);
    const hasType = inferTipoLabelFromText(line, "") !== "";
    const hasMoney =
      /R\$/i.test(line) ||
      /[0-9]{1,3}(?:\.[0-9]{3})*,\d{2}/.test(line);
    const isTotalLine = normalized.includes("total") && hasMoney;
    if ((hasType || isTotalLine) && current.length > 0) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  });
  if (current.length) blocks.push(current);

  const items: QuoteItemDraft[] = [];
  blocks.forEach((block) => {
    const blockText = block.join("\n");
    const tipoRaw = inferTipoLabelFromText(blockText, "") || detectCardTypeLabel(block) || "Serviços";
    const tipo = canonicalizeTipoLabel(tipoRaw);
    const valorInfo = parseValorFromLines(block, tipo);
    const allowZeroValor = isFlightLabel(tipo);
    if (valorInfo.valor <= 0 && !allowZeroValor) return;
    const periodo = parsePeriodoIso(blockText, baseYear);
    const circuitoDetectado = normalizeOcrText(tipo) === "circuito" || hasCircuitDays(block);
    const circuitoMeta = circuitoDetectado ? parseCircuitMetaFromLines(block) : null;
    const circuitoDias = circuitoDetectado ? parseCircuitDaysFromLines(block) : [];
    const routeInfo = findRouteFromLines(block);
    const destinoCidade = getDestinoCidadeFromRoute(routeInfo, tipo);
    const flightDetails = parseFlightDetailsFromLines(block, tipo);
    const allowCidadeFallback = !isSeguroLabel(tipo) && !isCarLabel(tipo);
    const cidade = circuitoDetectado && circuitoMeta?.itinerario?.length
      ? circuitoMeta.itinerario.join(" - ")
      : destinoCidade.destino || (allowCidadeFallback ? parseCidade(blockText) : "");
    let produto = circuitoDetectado
      ? pickCircuitTitleFromLines(block) || extractProductByType(block, tipo) || parseProduto(blockText, tipo)
      : extractProductByType(block, tipo) || parseProduto(blockText, tipo);
    if (!produto && routeInfo?.raw) {
      produto = routeInfo.raw;
    }
    if (isServiceLabel(tipo)) {
      const servicePrimary = extractServicePrimaryLine(block);
      if (servicePrimary) {
        produto = servicePrimary;
      }
      const serviceFallback = extractServiceDescriptionFallback(block);
      if (serviceFallback && (!produto || looksLikeServiceProviderLabel(produto))) {
        produto = serviceFallback;
      }
      if (looksLikeServiceProviderLabel(produto || "")) {
        const narrativeFallback = extractServiceNarrativeLine(block);
        if (narrativeFallback) produto = narrativeFallback;
      }
    }
    const importedHotel = isHotelLabel(tipo) ? parseStructuredHotelFromLines(block, baseYear) : null;
    if (importedHotel) {
      if (importedHotel.hotel && (!produto || normalizeOcrText(produto) !== normalizeOcrText(importedHotel.hotel))) {
        produto = importedHotel.hotel;
      }
    }
    const importedPasseio =
      isServiceLabel(tipo) || isSeguroLabel(tipo)
        ? parseStructuredPasseioFromLines(block, baseYear, produto || "")
        : null;
    if (importedPasseio && importedPasseio.passeio && (!produto || looksLikeServiceProviderLabel(produto))) {
      produto = importedPasseio.passeio;
    }
    const quantity = parseQuantidadePax(blockText);
    const totalAmount = valorInfo.valor;
    const isCar = isCarLabel(tipo);
    const isFlight = isFlightLabel(tipo);
    const ignoreTaxes = isCar || isFlight;
    const summary = extractSummaryValues(block);
    const baseValue = ignoreTaxes ? totalAmount : Math.max(summary.base ?? totalAmount, 0);
    const taxesValue = ignoreTaxes ? 0 : summary.taxes;
    const discountValue = ignoreTaxes ? 0 : summary.discount;
    const netBase = Math.max(baseValue - discountValue, 0);
    const totalWithTaxes = ignoreTaxes ? totalAmount : netBase + taxesValue;
    const adultosCriancas = parseAdultChildCounts(blockText);
    const aereoSnapshot = isFlight
      ? buildAereoImportSnapshotFromFlightDetails(
          flightDetails,
          tipo,
          routeInfo?.raw || produto || "",
          totalWithTaxes,
          taxesValue,
          periodo.start || "",
          periodo.end || periodo.start || "",
          quantity || 1,
          adultosCriancas.adults,
          adultosCriancas.children,
          baseYear
        )
      : null;
    items.push({
      temp_id: buildTempId(),
      item_type: tipo,
      title: produto || tipo || "Item",
      product_name: produto || "",
      city_name: cidade || "",
      quantity: quantity || 1,
      unit_price: quantity > 0 ? totalWithTaxes / quantity : totalWithTaxes,
      total_amount: totalWithTaxes,
      taxes_amount: taxesValue,
      start_date: periodo.start || "",
      end_date: periodo.end || periodo.start || "",
      currency: valorInfo.moeda || "BRL",
      confidence: 0.4,
      segments: circuitoDias,
      raw: {
        page: pageNumber,
        block_text: blockText,
        city_label: destinoCidade.cidade || "",
        ...(importedHotel ? { hotel_import: importedHotel } : {}),
        ...(importedPasseio ? { passeio_import: importedPasseio } : {}),
        ...(aereoSnapshot ? { aereo_import: aereoSnapshot } : {}),
        ...(circuitoMeta ? { circuito_meta: circuitoMeta } : {}),
        ...(flightDetails ? { flight_details: flightDetails } : {}),
      },
    });
  });

  return items;
}

type TextBlock = {
  typeHint: string;
  lines: string[];
};

function isTextStopLine(line: string) {
  const normalized = normalizeOcrText(line);
  return TEXT_STOP_KEYWORDS.some((keyword) => normalized.includes(normalizeOcrText(keyword)));
}

function detectSectionLabel(line: string) {
  const normalized = normalizeOcrText(line);
  if (!normalized) return "";
  if (normalized === "servicos") return "Serviços";
  if (normalized === "aereo") return "Aéreo";
  if (isAirHotelLabel(normalized)) return "A+H";
  if (normalized === "carros" || normalized === "carro") return "Aluguel de Carro";
  if (normalized === "hoteis" || normalized === "hotel" || normalized === "hospedagem") return "Hotel";
  if (normalized === "circuito") return "Circuito";
  if (normalized.includes("seguro") && normalized.includes("viagem")) return "Seguro viagem";
  return "";
}

const CIRCUITO_STOP_KEYWORDS = [
  "servicos inclusos",
  "informacoes importantes",
  "formas de pagamento",
];

const CIRCUITO_DIA_REGEX = /^Dia\s+(\d+)\s*:\s*(.*)$/i;

function hasCircuitDays(lines: string[] | string | undefined) {
  if (!lines) return false;
  const list = Array.isArray(lines) ? lines : [lines];
  return list.some((line) => CIRCUITO_DIA_REGEX.test((line || "").trim()));
}

function parseCircuitMetaFromLines(lines: string[]) {
  const meta: {
    codigo?: string;
    serie?: string;
    itinerario?: string[];
    tags?: string[];
  } = {};
  const itinerary: string[] = [];
  const tags: string[] = [];
  let passouDias = false;

  for (const line of lines) {
    const trimmed = (line || "").trim();
    if (!trimmed) continue;
    if (CIRCUITO_DIA_REGEX.test(trimmed)) {
      passouDias = true;
      break;
    }
    const normalized = normalizeOcrText(trimmed);
    if (CIRCUITO_STOP_KEYWORDS.some((k) => normalized.includes(normalizeOcrText(k)))) break;
    if (normalized.startsWith("codigo")) {
      meta.codigo = trimmed.replace(/.*codigo\s*:/i, "").trim();
      continue;
    }
    if (normalized.includes("serie")) {
      meta.serie = trimmed
        .replace(/.*serie/i, "")
        .replace(/^[:\s|-]+/, "")
        .trim();
      continue;
    }
    if (normalized === "circuito") continue;
    if (normalized === "detalhes") continue;
    if (normalized.includes("total")) continue;
    if (normalized.includes("adulto") || normalized.includes("adultos")) continue;
    if (normalized.includes("diaria") || normalized.includes("diarias")) continue;
    if (normalized === "|") continue;
    if (/double|triple|single|conq-pass|conq|pass/i.test(normalized)) {
      tags.push(trimmed);
      continue;
    }
    if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) continue;
    itinerary.push(trimmed);
  }

  if (!passouDias && itinerary.length === 0 && tags.length === 0 && !meta.codigo && !meta.serie) {
    return null;
  }

  const uniqueItinerary = Array.from(
    new Set(itinerary.map((value) => value.trim()).filter(Boolean))
  );
  const uniqueTags = Array.from(new Set(tags.map((value) => value.trim()).filter(Boolean)));

  if (uniqueItinerary.length) meta.itinerario = uniqueItinerary;
  if (uniqueTags.length) meta.tags = uniqueTags;
  if (!meta.codigo) delete meta.codigo;
  if (!meta.serie) delete meta.serie;
  if (!meta.codigo && !meta.serie && !meta.itinerario && !meta.tags) {
    return null;
  }

  return meta;
}

function parseCircuitDaysFromLines(lines: string[]) {
  const segments: QuoteItemDraft["segments"] = [];
  let atual: { dia: number; titulo: string; descricao: string[] } | null = null;

  function finalizarAtual() {
    if (!atual) return;
    const titulo = (atual.titulo || "").trim();
    const descricao = atual.descricao.join(" ").replace(/\s+/g, " ").trim();
    if (titulo || descricao) {
      segments.push({
        segment_type: "circuit_day",
        order_index: segments.length,
        data: {
          dia: atual.dia,
          titulo,
          descricao,
        },
      });
    }
    atual = null;
  }

  for (const line of lines) {
    const trimmed = (line || "").trim();
    if (!trimmed) continue;
    const normalized = normalizeOcrText(trimmed);
    if (CIRCUITO_STOP_KEYWORDS.some((k) => normalized.includes(normalizeOcrText(k)))) {
      finalizarAtual();
      break;
    }

    const matchDia = trimmed.match(CIRCUITO_DIA_REGEX);
    if (matchDia) {
      finalizarAtual();
      const diaNumero = Number(matchDia[1]);
      if (!diaNumero || Number.isNaN(diaNumero)) continue;
      const tituloInicial = (matchDia[2] || "").trim();
      atual = { dia: diaNumero, titulo: tituloInicial, descricao: [] };
      continue;
    }

    if (!atual) continue;
    if (!atual.titulo) {
      atual.titulo = trimmed;
      continue;
    }
    atual.descricao.push(trimmed);
  }

  finalizarAtual();
  return segments;
}

function splitTextBlocks(text: string): TextBlock[] {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: TextBlock[] = [];
  let currentType = "";
  let current: string[] = [];
  let started = false;

  for (const line of lines) {
    const normalized = normalizeOcrText(line);
    if (!normalized) continue;
    if (isTextStopLine(line)) break;

    const sectionType = detectSectionLabel(line);
    if (sectionType) {
      if (current.length) {
        blocks.push({ typeHint: currentType, lines: current });
        current = [];
      }
      currentType = sectionType;
      started = true;
      continue;
    }

    if (normalized === "selecionado") {
      if (current.length) {
        blocks.push({ typeHint: currentType, lines: current });
        current = [];
      }
      started = true;
      continue;
    }

    if (!started) continue;
    if (normalized === "detalhes") continue;

    current.push(line);
  }

  if (current.length) {
    blocks.push({ typeHint: currentType, lines: current });
  }

  return blocks.filter(
    (block) =>
      Array.isArray(block.lines) && block.lines.some((line) => /[A-Za-zÀ-ÿ]/.test(line))
  );
}

function extractSummaryValues(lines: string[]) {
  let base: number | null = null;
  let taxes: number | null = null;
  let discount = 0;
  for (const line of lines) {
    const normalized = normalizeOcrText(line);
    if (!base && /^valor\s*\(/i.test(normalized)) {
      base = parseCurrencyValue(line);
    }
    if (normalized.includes("taxas") && normalized.includes("impostos")) {
      taxes = parseCurrencyValue(line);
    }
    if (normalized.includes("desconto")) {
      const value = parseCurrencyValue(line);
      discount = value;
    }
  }
  return { base, taxes: taxes ?? 0, discount };
}

function isLikelyAirportCode(line: string) {
  return /^[A-Z]{3,4}$/.test(line.trim());
}

function isLikelyTimeLine(line: string) {
  return /^\d{1,2}:\d{2}$/.test(line.trim());
}

function isLikelyDateLine(normalized: string) {
  return /\d{1,2}\s*de\s*[a-zçãõáéíóú]{3,}/i.test(normalized);
}

function pickProductLineFromBlock(lines: string[], itemType: string) {
  const candidates = lines
    .map((line) => cleanProductLine(line))
    .filter((line) => {
      const normalized = normalizeOcrText(line);
      if (!/[A-Za-zÀ-ÿ]/.test(line)) return false;
      if (normalized === "selecionado" || normalized === "detalhes") return false;
      if (isCurrencyLine(line)) return false;
      if (normalized.includes("total")) return false;
      if (normalized.includes("reembols")) return false;
      if (normalized.includes("nao reembols")) return false;
      if (normalized.includes("travel") || normalized.includes("dmc")) return false;
      if (normalized.includes("facil")) return false;
      if (normalized.includes("classe")) return false;
      if (normalized.includes("adulto") || normalized.includes("pax") || normalized.includes("passageiro")) return false;
      if (normalized.includes("dias") && normalized.includes("noites")) return false;
      if (normalized.includes("total (")) return false;
      if (isDateOnlyLine(line)) return false;
      if (isLikelyTimeLine(line)) return false;
      if (isLikelyAirportCode(line)) return false;
      if (normalized.startsWith("gol") && (normalized.includes("ida") || normalized.includes("volta"))) return false;
      if (isRouteLine(line)) return false;
      if (/^\d+$/.test(normalized)) return false;
      return true;
    });

  if (candidates.length === 0) return "";

  const tipoNorm = normalizeOcrText(itemType);
  const scored = candidates.map((line) => {
    const normalized = normalizeOcrText(line);
    let score = line.length;
    if (tipoNorm === "aereo" && normalized.includes(" - ")) score += 30;
    if (tipoNorm === "servicos" && /(transporte|transfer|traslado|passeio|ingresso)/.test(normalized)) {
      score += 20;
    }
    if (tipoNorm === "hotel" && /(hotel|resort|pousada|all inclusive)/.test(normalized)) {
      score += 20;
    }
    if (normalized.startsWith("(")) score += 10;
    return { line, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.line || "";
}

function pickCircuitTitleFromLines(lines: string[]) {
  let encontrouPeriodo = false;
  for (const line of lines) {
    const trimmed = (line || "").trim();
    if (!trimmed) continue;
    const normalized = normalizeOcrText(trimmed);
    if (CIRCUITO_DIA_REGEX.test(trimmed)) break;
    if (!encontrouPeriodo && isLikelyDateLine(normalized) && normalized.includes("-")) {
      encontrouPeriodo = true;
      continue;
    }
    if (!encontrouPeriodo) continue;
    if (normalized.includes("codigo") || normalized.includes("serie")) continue;
    if (normalized === "detalhes") continue;
    if (normalized.includes("total") || normalized.includes("adulto")) continue;
    if (normalized.includes("diaria") || normalized.includes("diarias")) continue;
    if (normalized === "|") continue;
    if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) continue;
    return trimmed;
  }
  return "";
}

function parseItemsFromCvcText(text: string, baseYear: number): QuoteItemDraft[] {
  const blocks = splitTextBlocks(text);
  if (!blocks.length) return [];

  const items: QuoteItemDraft[] = [];

  blocks.forEach((block) => {
    const blockText = block.lines.join("\n");
    const tipoRaw =
      block.typeHint ||
      inferTipoLabelFromText(blockText, "") ||
      detectCardTypeLabel(block.lines) ||
      "Serviços";
    const tipo = canonicalizeTipoLabel(tipoRaw);
    const valorInfo = parseValorFromLines(block.lines, tipo);
    const allowZeroValor = isFlightLabel(tipo);
    if (valorInfo.valor <= 0 && !allowZeroValor) return;
    const periodo = parsePeriodoIso(blockText, baseYear);
    const quantidade = parseQuantidadePax(blockText);
    const circuitoDetectado = normalizeOcrText(tipo) === "circuito" || hasCircuitDays(block.lines);
    const circuitoMeta = circuitoDetectado ? parseCircuitMetaFromLines(block.lines) : null;
    const circuitoDias = circuitoDetectado ? parseCircuitDaysFromLines(block.lines) : [];
    const routeInfo = findRouteFromLines(block.lines);
    const destinoCidade = getDestinoCidadeFromRoute(routeInfo, tipo);
    const flightDetails = parseFlightDetailsFromLines(block.lines, tipo);
    const allowCidadeFallback = !isSeguroLabel(tipo) && !isCarLabel(tipo);
    const cidade = circuitoDetectado && circuitoMeta?.itinerario?.length
      ? circuitoMeta.itinerario.join(" - ")
      : destinoCidade.destino || (allowCidadeFallback ? parseCidade(blockText) : "");
    let produto = circuitoDetectado
      ? pickCircuitTitleFromLines(block.lines) || extractProductByType(block.lines, tipo) || pickProductLineFromBlock(block.lines, tipo) || parseProduto(blockText, tipo)
      : extractProductByType(block.lines, tipo) || pickProductLineFromBlock(block.lines, tipo) || parseProduto(blockText, tipo);
    if (!produto && routeInfo?.raw) {
      produto = routeInfo.raw;
    }
    if (isServiceLabel(tipo)) {
      const servicePrimary = extractServicePrimaryLine(block.lines);
      if (servicePrimary) {
        produto = servicePrimary;
      }
      const serviceFallback = extractServiceDescriptionFallback(block.lines);
      if (serviceFallback && (!produto || looksLikeServiceProviderLabel(produto))) {
        produto = serviceFallback;
      }
      if (looksLikeServiceProviderLabel(produto || "")) {
        const narrativeFallback = extractServiceNarrativeLine(block.lines);
        if (narrativeFallback) produto = narrativeFallback;
      }
    }
    const importedHotel = isHotelLabel(tipo) ? parseStructuredHotelFromLines(block.lines, baseYear) : null;
    if (importedHotel) {
      if (importedHotel.hotel && (!produto || normalizeOcrText(produto) !== normalizeOcrText(importedHotel.hotel))) {
        produto = importedHotel.hotel;
      }
    }
    const importedPasseio =
      isServiceLabel(tipo) || isSeguroLabel(tipo)
        ? parseStructuredPasseioFromLines(block.lines, baseYear, produto || "")
        : null;
    if (importedPasseio && importedPasseio.passeio && (!produto || looksLikeServiceProviderLabel(produto))) {
      produto = importedPasseio.passeio;
    }
    const totalAmount = valorInfo.valor;
    const quantity = quantidade || 1;
    const title = produto || tipo || "Item";

    const isCar = isCarLabel(tipo);
    const isFlight = isFlightLabel(tipo);
    const ignoreTaxes = isCar || isFlight;
    const summary = extractSummaryValues(block.lines);
    const baseValue = ignoreTaxes ? totalAmount : Math.max(summary.base ?? totalAmount, 0);
    const taxesValue = ignoreTaxes ? 0 : summary.taxes;
    const discountValue = ignoreTaxes ? 0 : summary.discount;
    const netBase = Math.max(baseValue - discountValue, 0);
    const totalWithTaxes = ignoreTaxes ? totalAmount : netBase + taxesValue;
    const adultosCriancas = parseAdultChildCounts(blockText);
    const aereoSnapshot = isFlight
      ? buildAereoImportSnapshotFromFlightDetails(
          flightDetails,
          tipo,
          routeInfo?.raw || produto || "",
          totalWithTaxes,
          taxesValue,
          periodo.start || "",
          periodo.end || periodo.start || "",
          quantity || 1,
          adultosCriancas.adults,
          adultosCriancas.children,
          baseYear
        )
      : null;

    items.push({
      temp_id: buildTempId(),
      item_type: tipo,
      title,
      product_name: produto || title,
      city_name: cidade || "",
      quantity,
      unit_price: quantity > 0 ? totalWithTaxes / quantity : totalWithTaxes,
      total_amount: totalWithTaxes,
      taxes_amount: taxesValue,
      start_date: periodo.start || "",
      end_date: periodo.end || periodo.start || "",
      currency: valorInfo.moeda || "BRL",
      confidence: 0.6,
      segments: circuitoDias,
      raw: {
        source: "text",
        type_hint: block.typeHint,
        block_text: blockText,
        city_label: destinoCidade.cidade || "",
        ...(importedHotel ? { hotel_import: importedHotel } : {}),
        ...(importedPasseio ? { passeio_import: importedPasseio } : {}),
        ...(aereoSnapshot ? { aereo_import: aereoSnapshot } : {}),
        ...(circuitoMeta ? { circuito_meta: circuitoMeta } : {}),
        ...(flightDetails ? { flight_details: flightDetails } : {}),
      },
    });
  });

  return items;
}

function validateForConfirm(items: QuoteItemDraft[]) {
  return items.every((item) => {
    return (
      item.item_type &&
      item.quantity > 0 &&
      item.start_date &&
      item.title &&
      item.total_amount > 0
    );
  });
}

async function loadImageFromFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Falha ao carregar imagem."));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Parses the new CVC website/app format: "Valor (N produto)" summary + product blocks + "Detalhes" section
function parseItemsFromSummaryFormat(text: string, baseYear: number): QuoteItemDraft[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Only handle if text contains "Valor (N produto" (new CVC summary format)
  if (!lines.some((l) => /^Valor\s*\(\d+\s*produto/i.test(l))) return [];

  // Find base value and taxes from summary section
  let summaryBase = 0;
  let summaryTaxes = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isTextStopLine(line)) break;
    if (/^Valor\s*\(\d+\s*produto/i.test(line) && summaryBase === 0) {
      if (isCurrencyLine(lines[i + 1] || "")) {
        summaryBase = parseCurrencyValue(lines[i + 1] || "") || 0;
      }
    }
    if (/taxas.*impostos/i.test(normalizeOcrText(line))) {
      if (isCurrencyLine(lines[i + 1] || "")) {
        const val = parseCurrencyValue(lines[i + 1] || "");
        if (val) summaryTaxes = val;
      }
    }
    if (/^detalhes$/i.test(normalizeOcrText(line))) break;
  }

  // Locate "Detalhes" section boundary
  const detalhesIdx = lines.findIndex((l) => /^detalhes$/i.test(normalizeOcrText(l)));
  const preDetailLines = detalhesIdx >= 0 ? lines.slice(0, detalhesIdx) : lines;

  // Prepare the "Detalhes" section lines (stops at informações importantes etc.)
  let detalhesLines: string[] = [];
  if (detalhesIdx >= 0) {
    detalhesLines = lines.slice(detalhesIdx + 1);
    const stopIdx = detalhesLines.findIndex((l) => isTextStopLine(l));
    if (stopIdx >= 0) detalhesLines = detalhesLines.slice(0, stopIdx);
  }

  const detalhesText = detalhesLines.join("\n");
  const periodo = parsePeriodoIso(detalhesText, baseYear);
  const routeInfo = findRouteFromLines(detalhesLines);

  const items: QuoteItemDraft[] = [];

  for (let i = 0; i < preDetailLines.length; i++) {
    const line = preDetailLines[i];
    if (!isTipoProdutoValido(line)) continue;

    // Look ahead up to 6 lines for pax count only
    let pax = 0;
    for (let j = i + 1; j < Math.min(i + 7, preDetailLines.length); j++) {
      const jLine = preDetailLines[j];
      if (!pax) {
        const paxMatch = jLine.match(/Total\s*\(\s*(\d+)/i);
        if (paxMatch) { pax = parseInt(paxMatch[1], 10); break; }
      }
    }

    // Use summaryBase from the "Valor (N produto)" section as total_amount (base without taxes)
    // Fall back to looking ahead for a currency line if summaryBase not found
    let total = summaryBase;
    if (total <= 0) {
      for (let j = i + 1; j < Math.min(i + 7, preDetailLines.length); j++) {
        const jLine = preDetailLines[j];
        if (isCurrencyLine(jLine)) {
          const val = parseCurrencyValue(jLine);
          if (val > 0) { total = val; break; }
        }
      }
    }

    if (total <= 0) continue;

    const tipo = canonicalizeTipoLabel(inferTipoLabelFromText(line, "Serviços") || "Serviços");
    const cidade = getDestinoCidadeFromRoute(routeInfo, tipo).cidade || parseCidade(detalhesText) || "";
    const quantity = pax || 1;

    items.push({
      temp_id: buildTempId(),
      item_type: tipo,
      title: line,
      product_name: line,
      city_name: cidade,
      quantity,
      unit_price: total / quantity,
      total_amount: total,
      taxes_amount: summaryTaxes,
      start_date: periodo.start || "",
      end_date: periodo.end || periodo.start || "",
      currency: "BRL",
      confidence: 0.65,
      segments: [],
      raw: { source: "text", format: "cvc_summary", block_text: line },
    });

    // Skip past the product block lines
    i += 2;
  }

  return items;
}

export async function extractCvcQuoteFromText(text: string, options: ExtractOptions = {}): Promise<ImportResult> {
  if (!text || !text.trim()) {
    throw new Error("Texto obrigatorio.");
  }

  const logs: ImportLogDraft[] = [];
  const debugImages: ImportDebugImage[] = [];
  const onProgress = options.onProgress || (() => {});
  onProgress("Processando texto...");
  const baseYear = extractYearFromText(text) || new Date().getFullYear();
  let extractedItems = parseItemsFromCvcText(text, baseYear);
  let deduped = dedupeItems(extractedItems);

  // Fallback 1: tenta extrair blocos soltos se não encontrar itens
  if (!deduped.length) {
    const looseBlocks = extractLooseBlocks(text);
    for (const block of looseBlocks) {
      const blockText = block.join("\n");
      const items = parseItemsFromCvcText(blockText, baseYear);
      if (items.length) deduped = deduped.concat(dedupeItems(items));
    }
    // Remove duplicados
    deduped = dedupeItems(deduped);
  }

  // Fallback 2: formato novo CVC (site/app) com "Valor (N produto)" + bloco de produto + "Detalhes"
  if (!deduped.length) {
    const summaryItems = parseItemsFromSummaryFormat(text, baseYear);
    if (summaryItems.length) deduped = dedupeItems(summaryItems);
  }

  // Fallback 3: aplica parser de passagem aérea do módulo de roteiros
  // (cobre o padrão alternativo "Sua Escolha / Cia / Voo / Saída ...").
  const hasFlightItems = deduped.some((item) => isFlightLabel(item.item_type));
  if (!hasFlightItems) {
    try {
      const airportCodeCityLookup = await loadAirportCodeCityLookup();
      const importedAereo = parseImportedRoteiroAereo(text, new Date(baseYear, 0, 1), {
        airportCodeCityLookup,
      });
      if (importedAereo.length > 0) {
        const mappedFlights = mapImportedAereoToQuoteItems(importedAereo);
        if (mappedFlights.length > 0) {
          deduped = dedupeItems([...deduped, ...mappedFlights]);
          logs.push({
            level: "INFO",
            message:
              mappedFlights.length === 1
                ? "1 trecho aéreo reconhecido pelo parser alternativo."
                : `${mappedFlights.length} trechos aéreos reconhecidos pelo parser alternativo.`,
          });
        }
      }
    } catch {
      // mantém fluxo principal sem interromper a importação.
    }
  }

  if (!deduped.length) {
    throw new Error("Nenhum item identificado no texto.");
  }

  const orderedItems = sortItemsByDate(deduped);
  const total = orderedItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const averageConfidence =
    orderedItems.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / orderedItems.length;
  const extractedAt = new Date().toISOString();

  const rawJson = {
    source: "CVC_TEXT",
    extracted_at: extractedAt,
    text_length: text.length,
    raw_text: text,
    items: orderedItems.map((item) => ({
      item_type: item.item_type,
      title: item.title,
      product_name: item.product_name,
      city_name: item.city_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_amount: item.total_amount,
      taxes_amount: item.taxes_amount,
      start_date: item.start_date,
      end_date: item.end_date,
      confidence: item.confidence,
      segments: item.segments,
      raw: item.raw,
    })),
  };

  const draft: QuoteDraft = {
    source: "CVC_TEXT",
    status: "IMPORTED",
    currency: "BRL",
    total,
    average_confidence: averageConfidence,
    items: orderedItems,
    meta: {
      file_name: "texto-colado",
      page_count: 1,
      extracted_at: extractedAt,
    },
    raw_json: rawJson,
  };

  logs.push({ level: "INFO", message: `Texto importado com ${orderedItems.length} itens.` });

  return {
    draft,
    logs,
    debug_images: debugImages,
  };
}

export async function extractCvcQuoteFromImage(file: File, options: ExtractOptions = {}): Promise<ImportResult> {
  if (!file) {
    throw new Error("Arquivo de imagem obrigatorio.");
  }

  const debug = Boolean(options.debug);
  const logs: ImportLogDraft[] = [];
  const debugImages: ImportDebugImage[] = [];
  const onProgress = options.onProgress || (() => {});
  const worker = await getOcrWorker({ debug });

  onProgress("Carregando imagem...");
  const image = await loadImageFromFile(file);
  const scale = image.width < 1800 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Nao foi possivel renderizar a imagem.");
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  onProgress("OCR da imagem...");
  const fullOcr = await ocrCanvasRegion(worker, canvas, "text");
  const baseYear = extractYearFromText(fullOcr.text) || new Date().getFullYear();

  let cards: CardBBox[] = [];
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  cards = detectCardsFromImageData(imageData, canvas.width, canvas.height, 1);

  if (cards.length === 0) {
    const ocrLines = await ocrCanvasLines(worker, canvas);
    if (ocrLines.length) {
      cards = detectCardsFromTypeLabels(ocrLines, canvas.width, canvas.height, 1);
    }
  }

  const ignoreZone = {
    x1: 0,
    y1: 0,
    x2: canvas.width,
    y2: canvas.height * 0.4,
  };
  if (cards.length > 0) {
    const filtered = filterCardsByZone(cards, ignoreZone);
    if (filtered.length) cards = filtered;
  }

  let extractedItems: QuoteItemDraft[] = [];
  if (cards.length > 0) {
    onProgress("OCR dos cards...");
    extractedItems = await extractItemsFromCards(canvas, cards, worker, baseYear, 1, debug, debugImages);
  }

  if (extractedItems.length === 0) {
    const fallbackItems = parseItemsFromFullText(fullOcr.text, baseYear, 1);
    if (fallbackItems.length) {
      extractedItems = fallbackItems;
      logs.push({ level: "INFO", message: "Imagem importada via fallback de texto." });
    }
  }

  const deduped = dedupeItems(extractedItems);
  if (!deduped.length) {
    throw new Error("Nenhum item identificado no PDF/imagem.");
  }

  const orderedItems = sortItemsByDate(deduped);
  const total = orderedItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const averageConfidence = orderedItems.length
    ? orderedItems.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / orderedItems.length
    : 0;
  const extractedAt = new Date().toISOString();

  const rawJson = {
    source: "CVC_IMAGE",
    file_name: file.name,
    page_count: 1,
    extracted_at: extractedAt,
    ocr_text: fullOcr.text,
    items: orderedItems.map((item) => ({
      item_type: item.item_type,
      title: item.title,
      product_name: item.product_name,
      city_name: item.city_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_amount: item.total_amount,
      taxes_amount: item.taxes_amount,
      start_date: item.start_date,
      end_date: item.end_date,
      confidence: item.confidence,
      segments: item.segments,
      raw: item.raw,
    })),
  };

  const draft: QuoteDraft = {
    source: "CVC_IMAGE",
    status: validateForConfirm(deduped) ? "IMPORTED" : "IMPORTED",
    currency: "BRL",
    total,
    average_confidence: averageConfidence,
    items: orderedItems,
    meta: {
      file_name: file.name,
      page_count: 1,
      extracted_at: extractedAt,
    },
    raw_json: rawJson,
  };

  return {
    draft,
    logs,
    debug_images: debugImages,
  };
}

export async function extractCvcQuoteFromPdf(file: File, options: ExtractOptions = {}): Promise<ImportResult> {
  if (!file) {
    throw new Error("Arquivo PDF obrigatorio.");
  }
  const debug = Boolean(options.debug);
  const logs: ImportLogDraft[] = [];
  const debugImages: ImportDebugImage[] = [];
  const onProgress = options.onProgress || (() => {});
  const worker = await getOcrWorker({ debug });

  onProgress("Lendo PDF...");
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
  try {
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker?url");
    if (workerModule?.default && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
    }
  } catch (err) {
    logs.push({ level: "WARN", message: "PDF worker nao carregou, fallback sem worker.", payload: {} });
  }

  const data = await file.arrayBuffer();
  let pdf: any;
  try {
    pdf = await pdfjsLib.getDocument({ data }).promise;
  } catch (err) {
    pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
  }

  const baseYear = new Date().getFullYear();
  const extractedItems: QuoteItemDraft[] = [];

  for (let p = 1; p <= pdf.numPages; p += 1) {
    onProgress(`Renderizando pagina ${p}/${pdf.numPages}...`);
    const page = await pdf.getPage(p);
    const scale = 350 / 72;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvasContext: context, viewport }).promise;

    const skip = await shouldSkipPage(page, viewport, canvas, pdfjsLib, worker);
    if (skip) {
      logs.push({ level: "INFO", message: `Pagina ${p} ignorada (informacoes gerais).` });
      continue;
    }

    let pageYear = baseYear;
    let textBoxes: TextItemBox[] = [];
    try {
      textBoxes = await extractTextItemsFromPdfPage(page, viewport, pdfjsLib);
    } catch (err) {
      textBoxes = [];
    }

    if (textBoxes.length > 0) {
      const allText = textBoxes.map((b) => b.text).join(" ");
      const yearFromText = extractYearFromText(allText);
      if (yearFromText) pageYear = yearFromText;
    }

    const ignoreZone = p === 1
      ? {
          x1: 0,
          y1: 0,
          x2: canvas.width,
          y2: canvas.height * 0.4,
        }
      : undefined;

    let cards: CardBBox[] = [];
    let ocrLines: TextItemBox[] = [];

    if (textBoxes.length > 0) {
      cards = detectCardsFromTextItems(textBoxes, canvas.width, canvas.height, p);
      const labelCards = detectCardsFromTypeLabels(textBoxes, canvas.width, canvas.height, p);
      if (labelCards.length > cards.length) {
        cards = labelCards;
      }
    }

    if (cards.length === 0) {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      cards = detectCardsFromImageData(imageData, canvas.width, canvas.height, p);
    }

    if (cards.length === 0) {
      ocrLines = await ocrCanvasLines(worker, canvas);
      if (ocrLines.length) {
        cards = detectCardsFromTypeLabels(ocrLines, canvas.width, canvas.height, p);
      }
    }

    if (ignoreZone) {
      const cardsBase = cards;
      cards = filterCardsByZone(cards, ignoreZone);
      if (cards.length === 0) cards = cardsBase;
    }

    if (cards.length === 0) {
      logs.push({ level: "WARN", message: `Pagina ${p} sem cards detectados.` });
      continue;
    }

    onProgress(`OCR dos cards da pagina ${p}...`);
    const itemsPage = await extractItemsFromCards(
      canvas,
      cards,
      worker,
      pageYear,
      p,
      debug,
      debugImages
    );
    if (itemsPage.length === 0) {
      const fullOcr = await ocrCanvasRegion(worker, canvas, "text");
      const fallbackItems = parseItemsFromFullText(fullOcr.text, pageYear, p);
      if (fallbackItems.length > 0) {
        extractedItems.push(...fallbackItems);
        logs.push({ level: "INFO", message: `Pagina ${p} importada via fallback de texto.` });
      } else {
        logs.push({ level: "WARN", message: `Pagina ${p} sem itens reconhecidos.` });
      }
    } else {
      extractedItems.push(...itemsPage);
    }
  }

  const deduped = dedupeItems(extractedItems);
  const orderedItems = sortItemsByDate(deduped);
  const total = orderedItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const averageConfidence = orderedItems.length
    ? orderedItems.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / orderedItems.length
    : 0;

  if (!deduped.length) {
    throw new Error("Nenhum item identificado no PDF/imagem.");
  }

  const rawJson = {
    source: "CVC_PDF",
    file_name: file.name,
    page_count: pdf.numPages,
    extracted_at: new Date().toISOString(),
    items: orderedItems.map((item) => ({
      item_type: item.item_type,
      title: item.title,
      product_name: item.product_name,
      city_name: item.city_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_amount: item.total_amount,
      taxes_amount: item.taxes_amount,
      start_date: item.start_date,
      end_date: item.end_date,
      confidence: item.confidence,
      segments: item.segments,
      raw: item.raw,
    })),
  };

  const draft: QuoteDraft = {
    source: "CVC_PDF",
    status: validateForConfirm(deduped) ? "IMPORTED" : "IMPORTED",
    currency: "BRL",
    total,
    average_confidence: averageConfidence,
    items: orderedItems,
    meta: {
      file_name: file.name,
      page_count: pdf.numPages,
      extracted_at: new Date().toISOString(),
    },
    raw_json: rawJson,
  };

  return {
    draft,
    logs,
    debug_images: debugImages,
  };
}
