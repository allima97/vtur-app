import { construirLinkWhatsApp } from "../whatsapp";
import { resolveAirlineIata, resolveAirlineNameByIata } from "../airlineIata";
import { loadAirportCodeCityLookup, type AirportCodeCityLookup } from "../airportCodeCityLookup";
import nunitoSansBoldUrl from "../../assets/cards/fonts/NunitoSans-Bold.ttf?url";
import nunitoSansRegularUrl from "../../assets/cards/fonts/NunitoSans-Regular.ttf?url";
import nunitoSansSemiBoldUrl from "../../assets/cards/fonts/NunitoSans-SemiBold.ttf?url";
import type { QuotePdfData, QuotePdfItem, QuotePdfSettings } from "./quotePdf";
import { exportQuoteToPdf as exportQuoteToPdfLegacy } from "./quotePdf";

type ExportOptions = {
  showItemValues: boolean;
  showSummary: boolean;
  discount?: number;
  action?: "download" | "preview" | "blob-url";
};

type PdfMakeLike = {
  vfs?: Record<string, string>;
  fonts?: Record<string, any>;
  createPdf: (docDefinition: any) => {
    // pdfmake 0.3.x: download is async; 2.x was void
    download: (fileName?: string) => Promise<void> | void;
    getBlob?: ((cb: (blob: Blob) => void) => void) | (() => Promise<Blob>);
  };
};

type HtmlToPdfmakeLike = (html: string, options?: { window?: Window }) => any;

const DEFAULT_FOOTER = [
  "Precos em real (R$) convertido ao cambio do dia sujeito a alteracao e disponibilidade da tarifa.",
  "Valor da crianca valido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.",
  "Este orcamento e apenas uma tomada de preco.",
  "Os servicos citados nao estao reservados; a compra somente podera ser confirmada apos a confirmacao dos fornecedores.",
  "Este orcamento foi feito com base na menor tarifa para os servicos solicitados, podendo sofrer alteracao devido a disponibilidade de lugares no ato da compra.",
  "As regras de cancelamento de cada produto podem ser consultadas por meio do link do QR Code.",
];

type CircuitMeta = {
  codigo?: string;
  serie?: string;
  itinerario?: string[];
  tags?: string[];
};

type CircuitDay = {
  dia: number;
  titulo: string;
  descricao: string;
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
  fare_tags?: string[];
  directions?: FlightDirection[];
  baggage?: string[];
  notices?: string[];
  hotel_lines?: string[];
};

type QuoteModernParams = {
  quote: QuotePdfData;
  items: QuotePdfItem[];
  settings: QuotePdfSettings;
  options: ExportOptions;
};

type QuotePreviewParams = {
  quote: QuotePdfData;
  items: QuotePdfItem[];
  settings: QuotePdfSettings;
  options?: Partial<ExportOptions>;
};

const NUNITO_REGULAR_FILE = "NunitoSans-Regular.ttf";
const NUNITO_SEMIBOLD_FILE = "NunitoSans-SemiBold.ttf";
const NUNITO_BOLD_FILE = "NunitoSans-Bold.ttf";

let pdfmakeDepsPromise: Promise<{ pdfMake: PdfMakeLike; htmlToPdfmake: HtmlToPdfmakeLike; defaultFont: string }> | null =
  null;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchAssetBase64(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytesToBase64(bytes);
  } catch {
    return null;
  }
}

function resolveImageFormat(mime: string) {
  if (mime.includes("png")) return "PNG";
  if (mime.includes("jpg") || mime.includes("jpeg")) return "JPEG";
  return "PNG";
}

function inferImageMimeFromUrl(url: string) {
  const clean = String(url || "").split("#")[0].split("?")[0].toLowerCase();
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "";
}

function normalizeImageMimeType(mime: string, url: string) {
  const raw = String(mime || "").trim().toLowerCase();
  if (
    raw &&
    ![
      "application/octet-stream",
      "binary/octet-stream",
      "application/binary",
      "application/x-download",
    ].includes(raw)
  ) {
    return raw;
  }
  return inferImageMimeFromUrl(url) || raw || "image/png";
}

function decodeDataUrl(dataUrl: string) {
  const parts = dataUrl.split(",");
  if (parts.length < 2) return "";
  const meta = parts[0] || "";
  const data = parts.slice(1).join(",");
  if (meta.includes("base64")) {
    try {
      return atob(data);
    } catch {
      return "";
    }
  }
  try {
    return decodeURIComponent(data);
  } catch {
    return "";
  }
}

function parseSvgNumber(value?: string | null) {
  if (!value) return null;
  const match = value.match(/[\d.]+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSvgSize(svgText: string) {
  if (!svgText) return {};
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  const width = parseSvgNumber(svg.getAttribute("width"));
  const height = parseSvgNumber(svg.getAttribute("height"));
  if (width && height) return { width, height };
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) return {};
  const parts = viewBox.split(/[\s,]+/).map((part) => Number(part));
  if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
    return { width: parts[2], height: parts[3] };
  }
  return {};
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem."));
    img.src = src;
  });
}

async function svgToPngDataUrl(svgDataUrl: string) {
  const img = await loadImage(svgDataUrl);
  const svgText = decodeDataUrl(svgDataUrl);
  const svgSize = parseSvgSize(svgText);
  const width = svgSize.width || img.naturalWidth || 320;
  const height = svgSize.height || img.naturalHeight || 120;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Falha ao converter SVG.");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

async function fetchImageData(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar imagem.");
  const blob = await res.blob();
  const normalizedType = normalizeImageMimeType(blob.type || "", url);
  const blobForReader =
    normalizedType && normalizedType !== blob.type
      ? new Blob([await blob.arrayBuffer()], { type: normalizedType })
      : blob;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(blobForReader);
  });
  const type = normalizedType;
  if (type.includes("svg")) {
    return svgToPngDataUrl(dataUrl);
  }
  if (!type.includes("png") && !type.includes("jpg") && !type.includes("jpeg")) {
    return svgToPngDataUrl(dataUrl);
  }
  return dataUrl;
}

function textValue(value?: string | null) {
  return String(value || "").trim();
}

function normalizeType(value?: string | null) {
  return textValue(value).toLowerCase();
}

function escapeHtml(value?: string | null) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const raw = textValue(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

function formatDateLong(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateRange(start?: string | null, end?: string | null) {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (!startLabel && !endLabel) return "";
  if (!endLabel || startLabel === endLabel) return startLabel || endLabel;
  if (!startLabel) return endLabel;
  return `${startLabel} - ${endLabel}`;
}

function toLines(text?: string | null) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getCircuitMeta(item: QuotePdfItem): CircuitMeta {
  const raw = (item.raw || {}) as { circuito_meta?: CircuitMeta };
  return raw.circuito_meta || {};
}

function getCircuitDays(item: QuotePdfItem): CircuitDay[] {
  const segments = (item.segments || [])
    .filter((segment) => segment.segment_type === "circuit_day")
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  return segments.map((segment, index) => {
    const data = (segment.data || {}) as { dia?: number; titulo?: string; descricao?: string };
    return {
      dia: Number(data.dia || index + 1),
      titulo: data.titulo || "",
      descricao: data.descricao || "",
    };
  });
}

function isFlightItem(item: QuotePdfItem) {
  const normalized = normalizeType(item.item_type);
  return (
    normalized.includes("aereo") ||
    normalized.includes("passagem") ||
    normalized.includes("voo") ||
    normalized.includes("a+h")
  );
}

function getFlightDetails(item: QuotePdfItem): FlightDetails | null {
  const raw = (item.raw || {}) as { flight_details?: FlightDetails };
  return raw.flight_details || null;
}

type ItemRawImport = {
  hotel_import?: {
    cidade?: string;
    hotel?: string;
    data_inicio?: string;
    data_fim?: string;
    noites?: number;
    apto?: string;
    regime?: string;
  };
  passeio_import?: {
    cidade?: string;
    passeio?: string;
    data_inicio?: string;
    data_fim?: string;
    ingressos?: string;
  };
  aereo_import?: {
    trecho?: string;
    cia_aerea?: string;
    data_inicio?: string;
    data_fim?: string;
    data_voo?: string;
    hora_saida?: string;
    hora_chegada?: string;
    aeroporto_saida?: string;
    aeroporto_chegada?: string;
    cidade_saida?: string;
    cidade_chegada?: string;
    segmentos?: Array<{
      ordem?: number;
      data_voo?: string;
      hora_saida?: string;
      hora_chegada?: string;
      aeroporto_saida?: string;
      aeroporto_chegada?: string;
      cidade_saida?: string;
      cidade_chegada?: string;
      numero_voo?: string;
    }>;
  };
};

type StructuredHotelRow = {
  sourceOrder: number;
  cidade: string;
  hotel: string;
  dataInicio: string;
  dataFim: string;
  noites: number;
  acomodacao: string;
  regime: string;
};

type StructuredPasseioRow = {
  sourceOrder: number;
  cidade: string;
  dataInicio: string;
  dataFim: string;
  descricao: string;
  ingressos: string;
  isSeguro: boolean;
};

type StructuredFlightRow = {
  sourceOrder: number;
  rowOrder: number;
  cia: string;
  origem: string;
  dataSaida: string;
  destino: string;
  dataChegada: string;
  saidaChegada: string;
};

function normalizeLookup(value?: string | null) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function formatBudgetItemText(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return "";
  const lowerWords = new Set([
    "a",
    "à",
    "ao",
    "aos",
    "as",
    "às",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "ou",
    "para",
    "por",
    "sem",
    "um",
    "uma",
    "uns",
    "umas",
  ]);
  let seenWord = false;
  return raw
    .split(/(\s+|\/|-|\(|\)|,|\+)/)
    .map((part) => {
      if (!part || /^(\s+|\/|-|\(|\)|,|\+)$/.test(part)) return part;
      if (/^[A-Z0-9]{2,4}$/.test(part)) return part;
      if (/^\d+$/.test(part)) return part;
      const lower = part.toLowerCase();
      const shouldLower = seenWord && lowerWords.has(lower);
      seenWord = true;
      if (shouldLower) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function parseIsoDateSafe(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeToMinutes(value?: string | null) {
  const match = textValue(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.MAX_SAFE_INTEGER;
  return hour * 60 + minute;
}

function isHotelItem(item: QuotePdfItem) {
  const normalized = normalizeType(item.item_type);
  return normalized.includes("hotel") || normalized.includes("hosped");
}

function isSeguroItem(item: QuotePdfItem) {
  const normalized = normalizeType(item.item_type);
  return normalized.includes("seguro") && normalized.includes("viagem");
}

function isPasseioServicoItem(item: QuotePdfItem) {
  const normalized = normalizeType(item.item_type);
  return (
    normalized.includes("servic") ||
    normalized.includes("passeio") ||
    normalized.includes("transfer") ||
    isSeguroItem(item)
  );
}

function diffNights(start?: string | null, end?: string | null) {
  const startDate = parseIsoDateSafe(start);
  const endDate = parseIsoDateSafe(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

function getItemRawImports(item: QuotePdfItem): ItemRawImport {
  return (item.raw || {}) as ItemRawImport;
}

function formatAeroLocation(
  city?: string | null,
  airportCode?: string | null,
  airportCodeCityLookup: AirportCodeCityLookup = {}
) {
  const code = textValue(airportCode).toUpperCase();
  const lookupCity = /^[A-Z]{3}$/.test(code) ? formatBudgetItemText(airportCodeCityLookup[code]) : "";
  const cityLabel = lookupCity || formatBudgetItemText(city);
  if (!cityLabel && !code) return "-";
  if (!/^[A-Z]{3}$/.test(code)) return cityLabel || code || "-";
  if (!cityLabel) return code;
  if (new RegExp(`\\(${code}\\)\\s*$`, "i").test(cityLabel)) return cityLabel;
  const normalizedCity = cityLabel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (normalizedCity === code) {
    if (lookupCity) return `${lookupCity} (${code})`;
    return code;
  }
  return `${cityLabel} (${code})`;
}

function parseDirectionDateToIso(dateText?: string | null) {
  const normalized = textValue(dateText).toLowerCase();
  if (!normalized) return "";
  const monthMap: Record<string, number> = {
    jan: 0,
    janeiro: 0,
    fev: 1,
    fevereiro: 1,
    mar: 2,
    marco: 2,
    "março": 2,
    abr: 3,
    abril: 3,
    mai: 4,
    maio: 4,
    jun: 5,
    junho: 5,
    jul: 6,
    julho: 6,
    ago: 7,
    agosto: 7,
    set: 8,
    setembro: 8,
    out: 9,
    outubro: 9,
    nov: 10,
    novembro: 10,
    dez: 11,
    dezembro: 11,
  };
  const match = normalized.match(/(\d{1,2})\s*de\s*([a-zçãõáéíóú]+)/i);
  if (!match) return "";
  const day = Number(match[1]);
  const month = monthMap[match[2]];
  if (!day || month === undefined) return "";
  const year = new Date().getFullYear();
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function sortByStartDate<T extends { dataInicio?: string; dataFim?: string; sourceOrder: number }>(rows: T[]) {
  return rows
    .slice()
    .sort((left, right) => {
      const leftStart = parseIsoDateSafe(left.dataInicio)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightStart = parseIsoDateSafe(right.dataInicio)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftStart !== rightStart) return leftStart - rightStart;
      const leftEnd = parseIsoDateSafe(left.dataFim || left.dataInicio)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightEnd = parseIsoDateSafe(right.dataFim || right.dataInicio)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftEnd !== rightEnd) return leftEnd - rightEnd;
      return left.sourceOrder - right.sourceOrder;
    });
}

function buildHotelRows(items: QuotePdfItem[]) {
  const rows: StructuredHotelRow[] = [];
  items.forEach((item, sourceOrder) => {
    const raw = getItemRawImports(item);
    if (!raw.hotel_import && !isHotelItem(item)) return;
    const dataInicio = textValue(raw.hotel_import?.data_inicio || item.start_date);
    const dataFim = textValue(raw.hotel_import?.data_fim || item.end_date || dataInicio);
    rows.push({
      sourceOrder,
      cidade: formatBudgetItemText(raw.hotel_import?.cidade || item.city_name || "Hospedagem"),
      hotel: formatBudgetItemText(raw.hotel_import?.hotel || item.title || item.product_name || "Hotel"),
      dataInicio,
      dataFim,
      noites: Number(raw.hotel_import?.noites || 0) || diffNights(dataInicio, dataFim),
      acomodacao: formatBudgetItemText(raw.hotel_import?.apto || ""),
      regime: formatBudgetItemText(raw.hotel_import?.regime || ""),
    });
  });
  return sortByStartDate(rows);
}

function buildPasseioRows(items: QuotePdfItem[]) {
  const rows: StructuredPasseioRow[] = [];
  items.forEach((item, sourceOrder) => {
    const raw = getItemRawImports(item);
    if (!raw.passeio_import && !isPasseioServicoItem(item)) return;
    const isSeguro = isSeguroItem(item);
    const dataInicio = textValue(raw.passeio_import?.data_inicio || item.start_date);
    const dataFim = textValue(raw.passeio_import?.data_fim || item.end_date || dataInicio);
    rows.push({
      sourceOrder,
      cidade: formatBudgetItemText(raw.passeio_import?.cidade || item.city_name || "Serviços"),
      dataInicio,
      dataFim,
      descricao: formatBudgetItemText(
        raw.passeio_import?.passeio || item.title || item.product_name || item.item_type || "Serviço"
      ),
      ingressos: formatBudgetItemText(raw.passeio_import?.ingressos || ""),
      isSeguro,
    });
  });
  return sortByStartDate(rows);
}

function buildFlightRows(items: QuotePdfItem[], airportCodeCityLookup: AirportCodeCityLookup = {}) {
  const rows: StructuredFlightRow[] = [];
  const legend = new Map<string, string>();
  items.forEach((item, sourceOrder) => {
    if (!isFlightItem(item)) return;
    const raw = getItemRawImports(item);
    const importedAereo = raw.aereo_import;
    const details = getFlightDetails(item);
    const rowBase = rows.length;
    const airlineRaw = textValue(importedAereo?.cia_aerea || details?.airline || "");
    const iata = resolveAirlineIata(airlineRaw);
    const airlineName = iata ? resolveAirlineNameByIata(iata) : "";
    const ciaLabel = iata || formatBudgetItemText(airlineRaw || "Cia");
    if (iata && airlineName) {
      legend.set(iata, airlineName);
    }

    const routeParts = textValue(importedAereo?.trecho || details?.route || item.title || item.product_name)
      .split("-")
      .map((part) => formatBudgetItemText(part))
      .map((part) => textValue(part))
      .filter(Boolean);
    const routeOrigem = routeParts[0] || "";
    const routeDestino = routeParts[routeParts.length - 1] || routeOrigem;

    const importedSegments = Array.isArray(importedAereo?.segmentos) ? importedAereo?.segmentos : [];
    if (importedSegments.length > 0) {
      importedSegments.forEach((segment, segIdx) => {
        const dataSaida = textValue(segment?.data_voo || importedAereo?.data_inicio || importedAereo?.data_voo || item.start_date);
        const dataChegada = textValue(importedAereo?.data_fim || dataSaida || item.end_date || item.start_date);
        const origemCidade = segment?.cidade_saida || (segIdx === 0 ? routeOrigem : "");
        const destinoCidade = segment?.cidade_chegada || (segIdx === importedSegments.length - 1 ? routeDestino : "");
        const horarios = [textValue(segment?.hora_saida), textValue(segment?.hora_chegada)]
          .filter(Boolean)
          .join(" / ");
        rows.push({
          sourceOrder,
          rowOrder: rowBase + segIdx,
          cia: ciaLabel,
          origem: formatAeroLocation(origemCidade, segment?.aeroporto_saida, airportCodeCityLookup),
          dataSaida,
          destino: formatAeroLocation(destinoCidade, segment?.aeroporto_chegada, airportCodeCityLookup),
          dataChegada,
          saidaChegada: horarios || "-",
        });
      });
      return;
    }

    if ((details?.directions || []).length > 0) {
      let runningOrder = rowBase;
      (details?.directions || []).forEach((direction) => {
        const directionDateIso = parseDirectionDateToIso(direction.date) || textValue(item.start_date);
        (direction.legs || []).forEach((leg) => {
          const horarios = [textValue(leg.departure_time), textValue(leg.arrival_time)]
            .filter(Boolean)
            .join(" / ");
          rows.push({
            sourceOrder,
            rowOrder: runningOrder,
            cia: ciaLabel,
            origem: formatAeroLocation(
              leg.departure_city || routeOrigem,
              leg.departure_code,
              airportCodeCityLookup
            ),
            dataSaida: directionDateIso,
            destino: formatAeroLocation(
              leg.arrival_city || routeDestino,
              leg.arrival_code,
              airportCodeCityLookup
            ),
            dataChegada: directionDateIso,
            saidaChegada: horarios || "-",
          });
          runningOrder += 1;
        });
      });
      return;
    }

    const dataSaida = textValue(importedAereo?.data_inicio || importedAereo?.data_voo || item.start_date);
    const dataChegada = textValue(importedAereo?.data_fim || item.end_date || dataSaida);
    const horarios = [textValue(importedAereo?.hora_saida), textValue(importedAereo?.hora_chegada)]
      .filter(Boolean)
      .join(" / ");
    rows.push({
      sourceOrder,
      rowOrder: rowBase,
      cia: ciaLabel,
      origem: formatAeroLocation(
        importedAereo?.cidade_saida || routeOrigem,
        importedAereo?.aeroporto_saida,
        airportCodeCityLookup
      ),
      dataSaida,
      destino: formatAeroLocation(
        importedAereo?.cidade_chegada || routeDestino,
        importedAereo?.aeroporto_chegada,
        airportCodeCityLookup
      ),
      dataChegada,
      saidaChegada: horarios || "-",
    });
  });

  const orderedRows = rows
    .slice()
    .sort((left, right) => {
      const leftDate = parseIsoDateSafe(left.dataSaida)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDate = parseIsoDateSafe(right.dataSaida)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftDate !== rightDate) return leftDate - rightDate;
      const leftTime = parseTimeToMinutes(left.saidaChegada.split("/")[0] || "");
      const rightTime = parseTimeToMinutes(right.saidaChegada.split("/")[0] || "");
      if (leftTime !== rightTime) return leftTime - rightTime;
      if (left.sourceOrder !== right.sourceOrder) return left.sourceOrder - right.sourceOrder;
      return left.rowOrder - right.rowOrder;
    });

  return {
    rows: orderedRows,
    legend: Array.from(legend.entries()),
  };
}

function groupByCity<T extends { cidade: string }>(rows: T[]) {
  const groups = new Map<string, { cidade: string; rows: T[] }>();
  rows.forEach((row) => {
    const cidade = textValue(row.cidade) || "Serviços";
    const key = normalizeLookup(cidade);
    if (!groups.has(key)) groups.set(key, { cidade, rows: [] });
    groups.get(key)!.rows.push(row);
  });
  return Array.from(groups.values());
}

function collectPrimaryCities(hotelRows: StructuredHotelRow[], passeioRows: StructuredPasseioRow[], flightRows: StructuredFlightRow[]) {
  const cities: string[] = [];
  const pushUnique = (value?: string | null) => {
    const city = formatBudgetItemText(value);
    const key = normalizeLookup(city);
    if (!city || !key) return;
    if (key === "servicos" || key === "serviços") return;
    if (!cities.some((existing) => normalizeLookup(existing) === key)) cities.push(city);
  };
  hotelRows.forEach((row) => pushUnique(row.cidade));
  passeioRows.forEach((row) => {
    if (row.isSeguro && (!row.cidade || normalizeLookup(row.cidade) === "servicos")) return;
    pushUnique(row.cidade);
  });
  if (!cities.length) {
    flightRows.forEach((row) => {
      const origem = textValue(row.origem).replace(/\s*\([A-Z0-9]{3}\)\s*$/, "");
      const destino = textValue(row.destino).replace(/\s*\([A-Z0-9]{3}\)\s*$/, "");
      pushUnique(origem);
      pushUnique(destino);
    });
  }
  return cities.join(" - ");
}

function tableHeaderLabel(text: string, align: "left" | "center" = "left") {
  return `<span style="display:inline-block; padding:0 0 3px 0; border-bottom:1px solid #d8e0eb; text-align:${align}; font-size:11px;">${escapeHtml(
    text
  )}</span>`;
}

function sectionTitleCard(title: string) {
  return `<table width="100%" data-pdfmake='{"unbreakable":true,"widths":["*"],"layout":"noBorders"}' style="width:100%; margin:0 0 10px 0; border:1px solid #d1d5db; border-radius:11px; border-collapse:separate;">
    <tbody>
      <tr>
        <td style="border:none; padding:12px 16px;">
          <div style="font-size:17px; color:#1534c2; font-weight:700;">${escapeHtml(title)}</div>
        </td>
      </tr>
    </tbody>
  </table>`;
}

function sectionCityTitle(cidade: string) {
  return `<div style="font-size:13px; color:#334155; font-weight:700; margin:0 0 8px 0;">${escapeHtml(cidade)}</div>`;
}

function dayDiffBetweenIso(start?: string | null, end?: string | null) {
  const s = parseIsoDateSafe(start);
  const e = parseIsoDateSafe(end);
  if (!s || !e) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

function addDaysToIsoDate(value?: string | null, days = 0) {
  const base = parseIsoDateSafe(value);
  if (!base) return textValue(value);
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function buildFlightSchedule(saida?: string | null, chegada?: string | null, dayOffset = 0) {
  const dep = textValue(saida);
  const arr = textValue(chegada);
  if (dep && arr) {
    return `${dep} / ${arr}${dayOffset > 0 ? ` (+${dayOffset})` : ""}`;
  }
  return dep || arr || "-";
}

function buildFallbackItemsHtml(items: QuotePdfItem[], showItemValues: boolean) {
  return items
    .map((item) => {
      const title = formatBudgetItemText(item.title || item.product_name || "Item");
      const meta = [formatDateRange(item.start_date, item.end_date), formatBudgetItemText(item.city_name)]
        .filter(Boolean)
        .join(" | ");
      const value = formatCurrency(Number(item.total_amount || 0));
      return `<div data-pdfmake='{"unbreakable":true}' style="border:1px solid #d1d5db; border-radius:10px; padding:10px; margin:0 0 10px 0;">
        <div style="font-size:10px; color:#1d4ed8; margin:0 0 3px 0;"><b>${escapeHtml(formatBudgetItemText(item.item_type || "Serviço"))}</b></div>
        <div style="font-size:11px; color:#536783; margin:0 0 3px 0;"><b>${escapeHtml(title)}</b></div>
        ${meta ? `<div style="font-size:9px; color:#64748b; margin:0 0 3px 0;">${escapeHtml(meta)}</div>` : ""}
        ${
          showItemValues
            ? `<div style="font-size:10px; color:#536783;">Valor: <b>${escapeHtml(value)}</b></div>`
            : ""
        }
      </div>`;
    })
    .join("");
}

function buildItemsHtml(
  items: QuotePdfItem[],
  showItemValues: boolean,
  airportCodeCityLookup: AirportCodeCityLookup = {}
) {
  const hotelRows = buildHotelRows(items);
  const passeioRows = buildPasseioRows(items);
  const flightBase = buildFlightRows(items, airportCodeCityLookup);
  const flightRows = flightBase.rows.map((row) => {
    const match = row.saidaChegada.match(/^(\d{1,2}:\d{2})\s*\/\s*(\d{1,2}:\d{2})(?:\s*\(\+(\d+)\))?$/);
    if (!match) return row;
    const dep = match?.[1] || "";
    const arr = match?.[2] || "";
    const explicitOffset = match?.[3] ? Number(match[3]) : 0;
    let offsetDays = explicitOffset;
    if (!offsetDays) {
      offsetDays = dayDiffBetweenIso(row.dataSaida, row.dataChegada);
      if (offsetDays === 0 && dep && arr && parseTimeToMinutes(arr) < parseTimeToMinutes(dep)) {
        offsetDays = 1;
      }
    }
    const nextDataChegada =
      offsetDays > 0 && dayDiffBetweenIso(row.dataSaida, row.dataChegada) === 0
        ? addDaysToIsoDate(row.dataChegada || row.dataSaida, offsetDays)
        : row.dataChegada;
    return {
      ...row,
      dataChegada: nextDataChegada,
      saidaChegada: buildFlightSchedule(dep, arr, offsetDays),
    };
  });
  const flight = { ...flightBase, rows: flightRows };
  const handledSourceOrders = new Set<number>([
    ...hotelRows.map((row) => row.sourceOrder),
    ...passeioRows.map((row) => row.sourceOrder),
    ...flight.rows.map((row) => row.sourceOrder),
  ]);
  const fallbackItems = items.filter((_, index) => !handledSourceOrders.has(index));
  const groupedHotels = groupByCity(hotelRows);
  const groupedPasseios = groupByCity(passeioRows);
  const seguroCityLabel = collectPrimaryCities(hotelRows, passeioRows, flight.rows) || "Serviços";

  const hotelsHtml =
    groupedHotels.length > 0
      ? `${sectionTitleCard("Hotéis sugeridos")}
         ${groupedHotels
           .map((group) => {
             const rows = group.rows
               .map(
                 (row) => `<tr>
                   <td style="text-align:left; color:#536783; padding:2px 0; border:none;">${escapeHtml(row.hotel || "-")}</td>
                   <td style="text-align:center; white-space:nowrap; color:#536783; padding:2px 0; border:none;">${escapeHtml(
                     formatDate(row.dataInicio) || "-"
                   )}</td>
                   <td style="text-align:center; white-space:nowrap; color:#536783; padding:2px 0; border:none;">${escapeHtml(
                     formatDate(row.dataFim) || "-"
                   )}</td>
                   <td style="text-align:center; color:#536783; padding:2px 0; border:none;">${
                     Number(row.noites || 0) > 0 ? Number(row.noites || 0) : "-"
                   }</td>
                   <td style="text-align:center; color:#536783; padding:2px 0; border:none;">${escapeHtml(
                     row.acomodacao || "-"
                   )}</td>
                   <td style="text-align:center; color:#536783; padding:2px 0; border:none;">${escapeHtml(
                     row.regime || "-"
                   )}</td>
                 </tr>`
               )
               .join("");
             return `<table width="100%" data-pdfmake='{"unbreakable":true,"widths":["*"],"layout":"noBorders"}' style="width:100%; margin:0 0 12px 0; border:1px solid #d1d5db; border-radius:11px; border-collapse:separate;">
               <tbody>
                 <tr>
                   <td style="border:none; padding:12px 16px;">
                     ${sectionCityTitle(group.cidade)}
                     <table data-pdfmake='{"layout":"noBorders"}' style="width:100%; font-size:10px; color:#536783; border:none; border-collapse:separate; border-spacing:0;">
                       <thead>
                         <tr>
                           <th style="text-align:left; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Nome Hotel",
                             "left"
                           )}</th>
                           <th style="text-align:center; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Período de",
                             "center"
                           )}</th>
                           <th style="text-align:center; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Período até",
                             "center"
                           )}</th>
                           <th style="text-align:center; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Noites",
                             "center"
                           )}</th>
                           <th style="text-align:center; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Acomodação",
                             "center"
                           )}</th>
                           <th style="text-align:center; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Regime",
                             "center"
                           )}</th>
                         </tr>
                       </thead>
                       <tbody>${rows}</tbody>
                     </table>
                   </td>
                 </tr>
               </tbody>
             </table>`;
           })
           .join("")}`
      : "";

  const passeiosHtml =
    groupedPasseios.length > 0
      ? `${sectionTitleCard("Passeios e serviços")}
         ${groupedPasseios
           .map((group) => {
             const onlySeguro = group.rows.every((row) => row.isSeguro);
             const groupKey = normalizeLookup(group.cidade);
             const displayCity =
               onlySeguro && (!groupKey || groupKey === "servicos" || groupKey === "serviços")
                 ? seguroCityLabel
                 : group.cidade || "Serviços";
             const rows = group.rows
               .map((row) => {
                 const inicio = formatDate(row.dataInicio);
                 const fim = formatDate(row.dataFim);
                 const dateLabel = inicio && fim && inicio !== fim ? `${inicio} a ${fim}` : inicio || fim || "-";
                 return `<tr>
                   <td style="text-align:left; white-space:nowrap; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                     dateLabel
                   )}</td>
                   <td style="text-align:left; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                     row.descricao || "-"
                   )}</td>
                   <td style="text-align:left; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                     row.ingressos || "Inclui Ingressos"
                   )}</td>
                 </tr>`;
               })
               .join("");
             return `<table width="100%" data-pdfmake='{"unbreakable":true,"widths":["*"],"layout":"noBorders"}' style="width:100%; margin:0 0 12px 0; border:1px solid #d1d5db; border-radius:11px; border-collapse:separate;">
               <tbody>
                 <tr>
                   <td style="border:none; padding:12px 16px;">
                     ${sectionCityTitle(displayCity)}
                     <table data-pdfmake='{"layout":"noBorders"}' style="width:100%; font-size:10px; color:#536783; border:none; border-collapse:separate; border-spacing:0;">
                       <thead>
                         <tr>
                           <th style="text-align:left; width:18%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Data",
                             "left"
                           )}</th>
                           <th style="text-align:left; width:62%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Descrição",
                             "left"
                           )}</th>
                           <th style="text-align:left; width:20%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                             "Ingressos",
                             "left"
                           )}</th>
                         </tr>
                       </thead>
                       <tbody>${rows}</tbody>
                     </table>
                   </td>
                 </tr>
               </tbody>
             </table>`;
           })
           .join("")}`
      : "";

  const flightsHtml =
    flight.rows.length > 0
      ? `${sectionTitleCard("Passagem aérea")}
         <table width="100%" data-pdfmake='{"unbreakable":true,"widths":["*"],"layout":"noBorders"}' style="width:100%; margin:0 0 12px 0; border:1px solid #d1d5db; border-radius:11px; border-collapse:separate;">
           <tbody>
             <tr>
               <td style="border:none; padding:12px 16px;">
                 <table data-pdfmake='{"layout":"noBorders"}' style="width:100%; font-size:10px; color:#536783; border:none; border-collapse:separate; border-spacing:0;">
                   <thead>
                     <tr>
                 <th style="text-align:left; width:8%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                   "Cia",
                   "left"
                 )}</th>
                 <th style="text-align:left; width:21%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                   "Origem",
                   "left"
                 )}</th>
                 <th style="text-align:left; width:13%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                   "Saída",
                   "left"
                 )}</th>
                 <th style="text-align:left; width:21%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                   "Destino",
                   "left"
                 )}</th>
                 <th style="text-align:left; width:13%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                   "Chegada",
                   "left"
                 )}</th>
                 <th style="text-align:left; width:24%; color:#5c6f8c; padding:0 0 4px 0; border:none;">${tableHeaderLabel(
                   "Saída / Chegada",
                   "left"
                 )}</th>
                     </tr>
                   </thead>
                   <tbody>
                     ${flight.rows
                       .map(
                         (row) => `<tr>
                     <td style="text-align:left; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                       row.cia || "-"
                     )}</td>
                     <td style="text-align:left; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                       row.origem || "-"
                     )}</td>
                     <td style="text-align:left; white-space:nowrap; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                       formatDate(row.dataSaida) || "-"
                     )}</td>
                     <td style="text-align:left; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                       row.destino || "-"
                     )}</td>
                     <td style="text-align:left; white-space:nowrap; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                       formatDate(row.dataChegada) || "-"
                     )}</td>
                     <td style="text-align:left; white-space:nowrap; color:#536783; padding:2px 0; vertical-align:top; border:none;">${escapeHtml(
                       row.saidaChegada || "-"
                     )}</td>
                   </tr>`
                       )
                       .join("")}
                   </tbody>
                 </table>
                 ${
                   flight.legend.length > 0
                     ? `<div style="height:1px; background:#e2e8f0; margin:8px 0 10px 0;"></div>
                        <div style="font-size:10px; color:#536783;">
                          ${flight.legend
                            .map(
                              ([code, name]) => `<div style="margin:0 0 3px 0;"><b>${escapeHtml(
                                code
                              )}</b>&nbsp;&nbsp;= ${escapeHtml(formatBudgetItemText(name))}</div>`
                            )
                            .join("")}
                        </div>`
                     : ""
                 }
               </td>
             </tr>
           </tbody>
         </table>`
      : "";

  const fallbackHtml =
    fallbackItems.length > 0
      ? `${sectionTitleCard("Outros serviços")}
         ${buildFallbackItemsHtml(fallbackItems, showItemValues)}`
      : "";

  return `${hotelsHtml}${passeiosHtml}${flightsHtml}${fallbackHtml}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "orcamento"
  );
}

function extractItemSortMinutes(item: QuotePdfItem) {
  const raw = getItemRawImports(item);
  const importedSegmentTime = raw.aereo_import?.segmentos?.find((segment) => textValue(segment?.hora_saida))?.hora_saida;
  if (importedSegmentTime) return parseTimeToMinutes(importedSegmentTime);
  const importedTime = textValue(raw.aereo_import?.hora_saida);
  if (importedTime) return parseTimeToMinutes(importedTime);
  const details = getFlightDetails(item);
  const detailsTime = details?.directions
    ?.flatMap((direction) => direction.legs || [])
    ?.find((leg) => textValue(leg?.departure_time))?.departure_time;
  if (detailsTime) return parseTimeToMinutes(detailsTime);
  return Number.MAX_SAFE_INTEGER;
}

function sortQuoteItemsForPdf(items: QuotePdfItem[]) {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((left, right) => {
      const leftStart = parseIsoDateSafe(left.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightStart = parseIsoDateSafe(right.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftStart !== rightStart) return leftStart - rightStart;

      const leftTime = extractItemSortMinutes(left.item);
      const rightTime = extractItemSortMinutes(right.item);
      if (leftTime !== rightTime) return leftTime - rightTime;

      const leftOrder = Number(left.item.order_index ?? left.idx);
      const rightOrder = Number(right.item.order_index ?? right.idx);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;

      return left.idx - right.idx;
    })
    .map(({ item }) => item);
}

function buildSummaryRows(items: QuotePdfItem[], discount: number) {
  const totalsByType = items.reduce<Record<string, number>>((acc, item) => {
    const key = textValue(item.item_type || "Outros");
    acc[key] = (acc[key] || 0) + Number(item.total_amount || 0);
    return acc;
  }, {});

  const subtotal = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const taxesTotal = items.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0);
  const safeDiscount = Number.isFinite(discount) ? Math.max(discount, 0) : 0;
  const total = Math.max(subtotal - safeDiscount, 0);

  const rows = Object.entries(totalsByType).map(([label, value]) => ({
    label,
    value,
  }));
  rows.push({ label: "Taxas e impostos", value: taxesTotal });
  if (safeDiscount > 0) rows.push({ label: "Desconto", value: -safeDiscount });
  rows.push({ label: "Total", value: total });
  return {
    rows,
    subtotal,
    taxesTotal,
    total,
    discount: safeDiscount,
    valorSemTaxas: Math.max(subtotal - taxesTotal, 0),
  };
}

function buildFileName(quote: QuotePdfData) {
  const timestamp = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
  const safeBase = slugify(String(quote.id || "orcamento"));
  return `${safeBase}-${timestamp}.pdf`;
}

function buildQuoteHtml(params: {
  quote: QuotePdfData;
  items: QuotePdfItem[];
  settings: QuotePdfSettings;
  options: ExportOptions;
  logoDataUrl: string | null;
  qrDataUrl: string | null;
  complementDataUrl: string | null;
  airportCodeCityLookup: AirportCodeCityLookup;
}) {
  const {
    quote,
    items,
    settings,
    options,
    logoDataUrl,
    qrDataUrl,
    complementDataUrl,
    airportCodeCityLookup,
  } = params;

  const orderedItems = sortQuoteItemsForPdf(items);
  const summary = buildSummaryRows(orderedItems, Number(options.discount || 0));
  const rightLines = [
    settings.consultor_nome ? `Consultor: ${settings.consultor_nome}` : "",
    settings.telefone ? `Telefone: ${settings.telefone}` : "",
    settings.whatsapp ? `WhatsApp: ${settings.whatsapp}` : "",
    settings.email ? `E-mail: ${settings.email}` : "",
  ].filter(Boolean);
  const footerLines = settings.rodape_texto ? toLines(settings.rodape_texto) : DEFAULT_FOOTER;
  const clientName = textValue(quote.client_name || "Cliente");
  const createdAt = quote.created_at ? new Date(quote.created_at) : new Date();
  const dateLabel = formatDateLong(createdAt);
  const validityLabel = formatDateLong(createdAt);
  const showHeaderSummary = true;
  const itemsCount = orderedItems.length;

  return `
<div>
  <table width="100%" data-pdfmake='{"layout":"noBorders"}' style="width:100%; margin:0 0 4px 0; border:none; border-collapse:separate; border-spacing:0;">
    <tbody>
      <tr>
        <td style="width:52%; vertical-align:top; border:none;">
          ${
            logoDataUrl
              ? `<img src="${logoDataUrl}" style="max-width:120px; max-height:56px; width:auto; height:auto; object-fit:contain;" />`
              : ""
          }
          <div style="font-size:11px; color:#0f172a; margin:8px 0 0 0;">
            ${settings.filial_nome ? `<div>${escapeHtml(`Filial: ${settings.filial_nome}`)}</div>` : ""}
            ${settings.endereco_linha1 ? `<div>${escapeHtml(settings.endereco_linha1)}</div>` : ""}
            ${settings.endereco_linha2 ? `<div>${escapeHtml(settings.endereco_linha2)}</div>` : ""}
            ${settings.endereco_linha3 ? `<div>${escapeHtml(settings.endereco_linha3)}</div>` : ""}
          </div>
        </td>
        <td style="width:48%; vertical-align:top; border:none;">
          <table width="100%" data-pdfmake='{"layout":"noBorders"}' style="width:100%; border:none; border-collapse:separate; border-spacing:0;">
            <tbody>
              <tr>
                <td style="width:${qrDataUrl ? "72%" : "100%"}; vertical-align:top; font-size:11px; color:#334155; border:none;">
                  ${
                    qrDataUrl
                      ? `<div style="font-size:9px; color:#475569; margin:0 0 5px 0;">Aponte para o QR Code abaixo e chame o consultor:</div>`
                      : ""
                  }
                  ${rightLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
                </td>
                ${
                  qrDataUrl
                    ? `<td style="width:28%; vertical-align:top; text-align:right; border:none;">
                         <img src="${qrDataUrl}" style="width:66px; height:66px;" />
                       </td>`
                    : ""
                }
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="height:1px; background:#dbe3f0; margin:0 0 10px 0;"></div>

  <table width="100%" data-pdfmake='{"layout":"noBorders"}' style="width:100%; margin:0 0 10px 0; border:none; border-collapse:separate; border-spacing:0;">
    <tbody>
      <tr>
        <td style="width:${showHeaderSummary ? "65%" : "100%"}; vertical-align:top; border:none;">
          <div style="color:#1d4ed8; font-size:21; line-height:1.06; font-weight:bold; margin:0 0 4px 0;">Orcamento da sua viagem</div>
          <div style="font-size:11px; color:#0f172a;">${escapeHtml(dateLabel)}</div>
        </td>
        ${
          showHeaderSummary
            ? `<td style="width:35%; vertical-align:top; text-align:right; border:none;">
                 <table style="width:230px; margin-left:auto; border-collapse:separate; border-spacing:0; border:1px solid #d1d5db; border-radius:10px;">
                   <tbody>
                     <tr>
                       <td style="border:none; padding:9px 12px;">
                         <table data-pdfmake='{"layout":"noBorders"}' style="width:100%; font-size:10px; border:none; border-collapse:separate; border-spacing:0;">
                           <tbody>
                             <tr>
                               <td style="padding:1px 0; color:#0f172a; border:none;">Valor (${itemsCount} produto${
                                 itemsCount === 1 ? "" : "s"
                               })</td>
                               <td style="padding:1px 0; text-align:right; border:none;">${escapeHtml(
                                 formatCurrency(summary.valorSemTaxas)
                               )}</td>
                             </tr>
                             <tr>
                               <td style="padding:1px 0; color:#0f172a; border:none;">Taxas e impostos</td>
                               <td style="padding:1px 0; text-align:right; border:none;">${escapeHtml(
                                 formatCurrency(summary.taxesTotal)
                               )}</td>
                             </tr>
                             ${
                               summary.discount > 0
                                 ? `<tr>
                                      <td style="padding:1px 0; color:#0f172a; border:none;">Desconto</td>
                                      <td style="padding:1px 0; text-align:right; border:none;">${escapeHtml(
                                        formatCurrency(-summary.discount)
                                      )}</td>
                                    </tr>`
                                 : ""
                             }
                             <tr>
                               <td style="padding:3px 0 0 0; border:none;"><b>Total de</b></td>
                               <td style="padding:3px 0 0 0; text-align:right; border:none;"><b>${escapeHtml(
                                 formatCurrency(summary.total)
                               )}</b></td>
                             </tr>
                           </tbody>
                         </table>
                       </td>
                     </tr>
                   </tbody>
                 </table>
               </td>`
            : ""
        }
      </tr>
    </tbody>
  </table>

  ${buildItemsHtml(orderedItems, options.showItemValues, airportCodeCityLookup)}

  ${
    options.showSummary
      ? `<div data-pdfmake='{"unbreakable":true}' style="border:1px solid #d1d5db; border-radius:10px; padding:11px 13px; margin:0 0 14px 0;">
           <div style="font-size:11px; color:#1d4ed8; margin:0 0 6px 0;"><b>Resumo de servicos</b></div>
           <div style="height:1px; background:#e2e8f0; margin:0 0 7px 0;"></div>
           <table data-pdfmake='{"layout":"noBorders"}' style="width:100%; font-size:10px; border:none; border-collapse:separate; border-spacing:0;">
             <tbody>
               ${summary.rows
                 .map(
                   (row) => `<tr>
                     <td style="padding:2px 0; border:none;">${escapeHtml(row.label)}</td>
                     <td style="padding:2px 0; text-align:right; border:none;">${escapeHtml(
                       formatCurrency(Number(row.value || 0))
                     )}</td>
                   </tr>`
                 )
                 .join("")}
             </tbody>
           </table>
         </div>`
      : ""
  }

  <div style="border:1px solid #d1d5db; border-radius:10px; padding:11px 13px; margin:0 0 12px 0;">
    <div style="font-size:11px; color:#1d4ed8; margin:0 0 6px 0;"><b>Informacoes importantes</b></div>
    <div style="height:1px; background:#e2e8f0; margin:0 0 8px 0;"></div>
    <ul style="margin:0 0 0 14px; padding:0;">
      ${footerLines.map((line) => `<li style="font-size:9px; color:#334155; margin:0 0 3px 0;">${escapeHtml(line)}</li>`).join("")}
    </ul>
    ${
      complementDataUrl
        ? `<div style="margin:10px 0 0 0; text-align:center;"><img src="${complementDataUrl}" style="width:100%; max-height:170px;" /></div>`
        : ""
    }
    <div style="border:1px solid #d1d5db; border-radius:8px; margin:10px 0 0 0; padding:8px; text-align:center;">
      <div style="font-size:10px; color:#0f172a;"><b>Orcamento para ${escapeHtml(clientName)}</b></div>
      <div style="font-size:10px; color:#dc2626; margin:3px 0 0 0;"><b>Validade somente para: ${escapeHtml(validityLabel)}</b></div>
    </div>
  </div>
</div>`;
}

export async function buildQuotePreviewHtml(params: QuotePreviewParams): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Visualizacao HTML disponivel apenas no navegador.");
  }

  const options: ExportOptions = {
    showItemValues: params.options?.showItemValues ?? true,
    showSummary: params.options?.showSummary ?? true,
    discount: params.options?.discount,
    action: "download",
  };
  const settings = params.settings || {};
  const whatsappLink = construirLinkWhatsApp(settings.whatsapp, settings.whatsapp_codigo_pais);

  const [logoDataUrl, complementDataUrl, qrDataUrl, airportCodeCityLookup] = await Promise.all([
    settings.logo_url ? fetchImageData(settings.logo_url).catch(() => null) : Promise.resolve(null),
    settings.imagem_complementar_url
      ? fetchImageData(settings.imagem_complementar_url).catch(() => null)
      : Promise.resolve(null),
    whatsappLink
      ? fetchImageData(`https://quickchart.io/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`).catch(() => null)
      : Promise.resolve(null),
    loadAirportCodeCityLookup().catch(() => ({})),
  ]);

  return buildQuoteHtml({
    quote: params.quote,
    items: params.items,
    settings,
    options,
    logoDataUrl,
    qrDataUrl,
    complementDataUrl,
    airportCodeCityLookup,
  });
}

function loadPdfmakeDeps() {
  if (!pdfmakeDepsPromise) {
    pdfmakeDepsPromise = Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
      import("html-to-pdfmake/browser.js"),
    ]).then(async ([pdfmakeMod, vfsFontsMod, htmlToPdfmakeMod]) => {
      const pdfmakeAny = pdfmakeMod as any;
      const pdfMake = (
        [
          pdfmakeAny?.pdfMake,
          pdfmakeAny?.default?.pdfMake,
          pdfmakeAny?.default,
          (globalThis as any)?.pdfMake,
          pdfmakeAny,
        ].find((candidate: any) => candidate && typeof candidate.createPdf === "function") || null
      ) as PdfMakeLike | null;
      if (!pdfMake) {
        throw new Error("PDFMake não disponível no ambiente do navegador.");
      }

      const vfsFontsAny = vfsFontsMod as any;
      const htmlToPdfmake = (
        [
          (htmlToPdfmakeMod as any)?.default,
          typeof htmlToPdfmakeMod === "function" ? (htmlToPdfmakeMod as any) : null,
          (globalThis as any)?.htmlToPdfmake,
        ].find((candidate: any) => typeof candidate === "function") || null
      ) as HtmlToPdfmakeLike | null;
      if (typeof htmlToPdfmake !== "function") {
        throw new Error("html-to-pdfmake não disponível no ambiente do navegador.");
      }

      // pdfmake 2.x: vfs nested under pdfMake.vfs or .vfs
      // pdfmake 0.3.x: the module (or its default) IS the vfs object directly
      const vfsFontsBase = typeof vfsFontsAny?.default === "object" && vfsFontsAny.default !== null
        ? vfsFontsAny.default
        : vfsFontsAny;
      const resolvedVfs =
        vfsFontsAny?.pdfMake?.vfs ||
        vfsFontsAny?.default?.pdfMake?.vfs ||
        vfsFontsAny?.vfs ||
        vfsFontsAny?.default?.vfs ||
        (typeof vfsFontsBase === "object" && vfsFontsBase !== null ? vfsFontsBase : null);
      if (resolvedVfs) {
        if (typeof (pdfMake as any).addVirtualFileSystem === "function") {
          (pdfMake as any).addVirtualFileSystem(resolvedVfs);
        } else {
          try {
            pdfMake.vfs = resolvedVfs;
          } catch {
            // fallback silencioso quando o objeto importado é readonly
          }
        }
      }

      const robotoFontMap = {
        Roboto: {
          normal: "Roboto-Regular.ttf",
          bold: "Roboto-Medium.ttf",
          italics: "Roboto-Italic.ttf",
          bolditalics: "Roboto-MediumItalic.ttf",
        },
      };
      if (typeof (pdfMake as any).addFonts === "function") {
        (pdfMake as any).addFonts(robotoFontMap);
      } else {
        try {
          pdfMake.fonts = {
            ...(pdfMake.fonts || {}),
            ...robotoFontMap,
          };
        } catch {
          // fallback silencioso quando o objeto importado é readonly
        }
      }

      let defaultFont = "Roboto";
      const [nunitoRegularBase64, nunitoSemiBoldBase64, nunitoBoldBase64] = await Promise.all([
        fetchAssetBase64(nunitoSansRegularUrl),
        fetchAssetBase64(nunitoSansSemiBoldUrl),
        fetchAssetBase64(nunitoSansBoldUrl),
      ]);

      if (nunitoRegularBase64 && nunitoSemiBoldBase64 && nunitoBoldBase64) {
        const nunitoVfs = {
          [NUNITO_REGULAR_FILE]: nunitoRegularBase64,
          [NUNITO_SEMIBOLD_FILE]: nunitoSemiBoldBase64,
          [NUNITO_BOLD_FILE]: nunitoBoldBase64,
        };
        if (typeof (pdfMake as any).addVirtualFileSystem === "function") {
          (pdfMake as any).addVirtualFileSystem(nunitoVfs);
        } else {
          try {
            pdfMake.vfs = {
              ...(pdfMake.vfs || {}),
              ...nunitoVfs,
            };
          } catch {
            // fallback silencioso quando o objeto importado é readonly
          }
        }
        const nunitoFonts = {
          NunitoSans: {
            normal: NUNITO_REGULAR_FILE,
            bold: NUNITO_BOLD_FILE,
            italics: NUNITO_REGULAR_FILE,
            bolditalics: NUNITO_BOLD_FILE,
          },
        };
        if (typeof (pdfMake as any).addFonts === "function") {
          (pdfMake as any).addFonts(nunitoFonts);
        } else {
          try {
            pdfMake.fonts = {
              ...(pdfMake.fonts || {}),
              ...nunitoFonts,
            };
          } catch {
            // fallback silencioso quando o objeto importado é readonly
          }
        }
        defaultFont = "NunitoSans";
      }

      return { pdfMake, htmlToPdfmake, defaultFont };
    });
  }
  return pdfmakeDepsPromise;
}

export async function exportQuoteToPdf(params: QuoteModernParams) {
  try {
    if (typeof window === "undefined") throw new Error("PDFMake disponivel apenas no navegador.");
    const { quote, items, settings, options } = params;
    const whatsappLink = construirLinkWhatsApp(settings.whatsapp, settings.whatsapp_codigo_pais);

    const [logoDataUrl, complementDataUrl, qrDataUrl, airportCodeCityLookup] = await Promise.all([
      settings.logo_url ? fetchImageData(settings.logo_url).catch(() => null) : Promise.resolve(null),
      settings.imagem_complementar_url ? fetchImageData(settings.imagem_complementar_url).catch(() => null) : Promise.resolve(null),
      whatsappLink
        ? fetchImageData(`https://quickchart.io/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`).catch(() => null)
        : Promise.resolve(null),
      loadAirportCodeCityLookup().catch(() => ({})),
    ]);

    const { pdfMake, htmlToPdfmake, defaultFont } = await loadPdfmakeDeps();
    const html = buildQuoteHtml({
      quote,
      items,
      settings,
      options,
      logoDataUrl,
      qrDataUrl,
      complementDataUrl,
      airportCodeCityLookup,
    });

    const content = htmlToPdfmake(html, {
      window,
      defaultStyles: {
        table: { marginBottom: 0 },
      },
    });
    const docDefinition = {
      pageSize: "A4",
      pageMargins: [24, 22, 24, 30],
      defaultStyle: {
        font: defaultFont,
        fontSize: 10,
        color: "#0f172a",
        lineHeight: 1.25,
      },
      content: Array.isArray(content) ? content : [content],
      footer: (currentPage: number, pageCount: number) => ({
        text: `Pagina ${currentPage} de ${pageCount}`,
        alignment: "center",
        color: "#64748b",
        fontSize: 8,
        margin: [0, 6, 0, 0],
      }),
    };

    const fileName = buildFileName(quote);
    const action = options.action || "download";
    if (typeof window !== "undefined") {
      console.info("[Quote PDF] Renderer moderno ativo (pdfmake).");
    }
    const pdfDoc = pdfMake.createPdf(docDefinition) as {
      download: (fileName?: string) => Promise<void> | void;
      getBlob?: ((cb: (blob: Blob) => void) => void) | (() => Promise<Blob>);
    };

    const getBlobFromPdfDoc = async () => {
      if (!pdfDoc.getBlob) {
        throw new Error("Renderer PDF não suporta geração de blob.");
      }
      if ((pdfDoc.getBlob as any).length >= 1) {
        return await new Promise<Blob>((resolve, reject) => {
          try {
            (pdfDoc.getBlob as any)((blob: Blob) => resolve(blob));
          } catch (error) {
            reject(error);
          }
        });
      }
      const maybePromise = (pdfDoc.getBlob as any)();
      if (maybePromise && typeof maybePromise.then === "function") {
        return (await maybePromise) as Blob;
      }
      throw new Error("Renderer PDF nao retornou blob.");
    };

    if (action === "blob-url") {
      const blob = await getBlobFromPdfDoc();
      return URL.createObjectURL(blob);
    }

    if (action === "preview") {
      const blob = await getBlobFromPdfDoc();
      const url = URL.createObjectURL(blob);
      const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!previewWindow) {
        await pdfDoc.download(fileName);
      }
      return;
    }

    await pdfDoc.download(fileName);
  } catch (error) {
    if (typeof window !== "undefined") {
      console.warn("[Quote PDF] Falha no renderer moderno; usando fallback legado (jsPDF).", error);
    }
    return await exportQuoteToPdfLegacy(params);
  }
}
