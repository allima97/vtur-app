import { construirLinkWhatsApp } from "../whatsapp";
import nunitoSansBoldUrl from "../../assets/cards/fonts/NunitoSans-Bold.ttf?url";
import nunitoSansRegularUrl from "../../assets/cards/fonts/NunitoSans-Regular.ttf?url";
import nunitoSansSemiBoldUrl from "../../assets/cards/fonts/NunitoSans-SemiBold.ttf?url";
import type { QuotePdfData, QuotePdfItem, QuotePdfSettings } from "./quotePdf";
import { exportQuoteToPdf as exportQuoteToPdfLegacy } from "./quotePdf";

type ExportOptions = {
  showItemValues: boolean;
  showSummary: boolean;
  discount?: number;
};

type PdfMakeLike = {
  vfs?: Record<string, string>;
  fonts?: Record<string, any>;
  createPdf: (docDefinition: any) => {
    download: (fileName?: string) => void;
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
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(blob);
  });
  const type = (blob.type || "").toLowerCase();
  if (type.includes("svg")) {
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
  const date = new Date(value);
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

function buildFlightLegLine(leg: FlightLeg, kind: "depart" | "arrive") {
  const time = kind === "depart" ? leg.departure_time : leg.arrival_time;
  const code = kind === "depart" ? leg.departure_code : leg.arrival_code;
  const city = kind === "depart" ? leg.departure_city : leg.arrival_city;
  return [time, code, city].filter(Boolean).join(" ");
}

function buildFlightLegMeta(leg: FlightLeg) {
  return [leg.flight_type, leg.flight_number, leg.duration].filter(Boolean).join(" | ");
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

function buildItemsHtml(items: QuotePdfItem[], showItemValues: boolean) {
  return items
    .map((item) => {
      const itemType = textValue(item.item_type || "Servico");
      const title = textValue(item.title || item.product_name || "Item");
      const city = textValue(item.city_name || "");
      const period = formatDateRange(item.start_date, item.end_date);
      const value = Number(item.total_amount || 0);
      const valueLabel = formatCurrency(value);
      const itemMetaParts = [period, city].filter(Boolean);

      const circuitMeta = getCircuitMeta(item);
      const circuitDays = getCircuitDays(item);
      const isCircuit = normalizeType(item.item_type) === "circuito";

      const flightDetails = getFlightDetails(item);

      return `
<div data-pdfmake='{"unbreakable":true}' style="border:1px solid #d1d5db; border-radius:11px; padding:13px 15px; margin:0 0 14px 0; background:#ffffff;">
  <table style="width:100%;">
    <tbody>
      <tr>
        <td style="width:72%; vertical-align:top;">
          <div style="font-size:10px; color:#1d4ed8; font-weight:bold; margin:0 0 4px 0;">${escapeHtml(itemType)}</div>
          <div style="font-size:12px; color:#0f172a; font-weight:bold; margin:0 0 4px 0;">${escapeHtml(title)}</div>
          ${
            itemMetaParts.length
              ? `<div style="font-size:10px; color:#64748b;">${escapeHtml(itemMetaParts.join(" | "))}</div>`
              : ""
          }
        </td>
        <td style="width:28%; text-align:right; vertical-align:top;">
          ${
            showItemValues
              ? `<div style="font-size:9px; color:#64748b; margin:0 0 3px 0;">Valor</div>
                 <div style="border:1px solid #cbd5e1; border-radius:6px; padding:4px 7px; display:inline-block; min-width:92px; text-align:right;">
                   <div style="font-size:12px; color:#0f172a; font-weight:bold;">${escapeHtml(valueLabel)}</div>
                 </div>`
              : ""
          }
        </td>
      </tr>
    </tbody>
  </table>
  <div style="height:1px; background:#e2e8f0; margin:8px 0 8px 0;"></div>

  ${
    isCircuit
      ? `<div style="margin:0; font-size:10px; color:#334155;">
          ${
            circuitMeta.codigo || circuitMeta.serie
              ? `<div style="margin:0 0 4px 0;">${escapeHtml(
                  [circuitMeta.codigo ? `Codigo: ${circuitMeta.codigo}` : "", circuitMeta.serie ? `Serie: ${circuitMeta.serie}` : ""]
                    .filter(Boolean)
                    .join(" | ")
                )}</div>`
              : ""
          }
          ${
            (circuitMeta.itinerario || []).length
              ? `<div style="margin:0 0 4px 0;">${escapeHtml((circuitMeta.itinerario || []).join(" - "))}</div>`
              : ""
          }
          ${
            (circuitMeta.tags || []).length
              ? `<div style="margin:0 0 4px 0;">${escapeHtml((circuitMeta.tags || []).join(" | "))}</div>`
              : ""
          }
          ${
            circuitDays.length
              ? `<div style="margin:6px 0 0 0;">
                  ${circuitDays
                    .map(
                      (day) =>
                        `<div style="margin:0 0 5px 0;"><b>Dia ${day.dia}: ${escapeHtml(day.titulo || "")}</b>${
                          day.descricao ? `<br/>${escapeHtml(day.descricao)}` : ""
                        }</div>`
                    )
                    .join("")}
                </div>`
              : ""
          }
        </div>`
      : ""
  }

  ${
    isFlightItem(item) && flightDetails
      ? `<div style="margin:0; font-size:10px; color:#334155;">
          ${
            [flightDetails.airline, flightDetails.cabin].filter(Boolean).length
              ? `<div style="margin:0 0 4px 0;">${escapeHtml(
                  [flightDetails.airline, flightDetails.cabin].filter(Boolean).join(" | ")
                )}</div>`
              : ""
          }
          ${
            (flightDetails.fare_tags || []).length
              ? `<div style="margin:0 0 4px 0;">${escapeHtml(`Tarifas: ${(flightDetails.fare_tags || []).join(", ")}`)}</div>`
              : ""
          }
          ${
            (flightDetails.notices || []).length
              ? (flightDetails.notices || [])
                  .map((note) => `<div style="margin:0 0 2px 0;">${escapeHtml(`Aviso: ${note}`)}</div>`)
                  .join("")
              : ""
          }
          ${
            (flightDetails.directions || []).length
              ? (flightDetails.directions || [])
                  .map((direction) => {
                    const directionTitle = [direction.label, direction.route].filter(Boolean).join(" - ");
                    const legRows = (direction.legs || [])
                      .map((leg) => {
                        const saida = buildFlightLegLine(leg, "depart");
                        const chegada = buildFlightLegLine(leg, "arrive");
                        const meta = buildFlightLegMeta(leg);
                        return `<tr>
                          <td style="padding:2px 4px 2px 0;">${escapeHtml(saida || "-")}</td>
                          <td style="padding:2px 4px;">${escapeHtml(chegada || "-")}</td>
                          <td style="padding:2px 0 2px 4px; text-align:right;">${escapeHtml(meta || "-")}</td>
                        </tr>`;
                      })
                      .join("");
                    const notices = (direction.notices || [])
                      .map((note) => `<div style="margin:1px 0;">${escapeHtml(`Aviso: ${note}`)}</div>`)
                      .join("");
                    return `<div style="margin:6px 0;">
                      <div style="font-weight:bold; color:#0f172a;">${escapeHtml(directionTitle || "Trecho")}</div>
                      ${direction.date ? `<div style="color:#64748b; margin:1px 0 3px 0;">${escapeHtml(direction.date)}</div>` : ""}
                      <table style="width:100%; font-size:9px; color:#334155;">
                        <thead>
                          <tr>
                            <th style="text-align:left; width:35%;">Saida</th>
                            <th style="text-align:left; width:35%;">Chegada</th>
                            <th style="text-align:right; width:30%;">Detalhes</th>
                          </tr>
                        </thead>
                        <tbody>${legRows}</tbody>
                      </table>
                      ${notices}
                    </div>`;
                  })
                  .join("")
              : ""
          }
          ${
            (flightDetails.baggage || []).length
              ? `<div style="margin:6px 0 0 0;"><b>Bagagens:</b> ${escapeHtml((flightDetails.baggage || []).join(" | "))}</div>`
              : ""
          }
          ${
            (flightDetails.hotel_lines || []).length
              ? `<div style="margin:4px 0 0 0;"><b>Hotel:</b> ${escapeHtml((flightDetails.hotel_lines || []).join(" | "))}</div>`
              : ""
          }
        </div>`
      : ""
  }
</div>`;
    })
    .join("");
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
}) {
  const { quote, items, settings, options, logoDataUrl, qrDataUrl, complementDataUrl } = params;

  const orderedItems = [...items].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
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
  const isTotalOnlyMode = !options.showItemValues;

  return `
<div>
  <table style="width:100%; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:48%; vertical-align:top;">
          ${logoDataUrl ? `<img src="${logoDataUrl}" style="width:180px; height:auto;" />` : ""}
          <div style="font-size:10px; color:#0f172a; margin:8px 0 0 0;">
            ${settings.filial_nome ? `<div>${escapeHtml(`Filial: ${settings.filial_nome}`)}</div>` : ""}
            ${settings.endereco_linha1 ? `<div>${escapeHtml(settings.endereco_linha1)}</div>` : ""}
            ${settings.endereco_linha2 ? `<div>${escapeHtml(settings.endereco_linha2)}</div>` : ""}
            ${settings.endereco_linha3 ? `<div>${escapeHtml(settings.endereco_linha3)}</div>` : ""}
          </div>
        </td>
        <td style="width:52%; text-align:right; vertical-align:top;">
          <div style="font-size:10px; color:#334155;">
            ${rightLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
          </div>
          ${
            qrDataUrl
              ? `<div style="margin:8px 0 0 auto; width:84px; text-align:center;">
                   <div style="font-size:7px; color:#64748b; margin:0 0 4px 0;">QR consultor</div>
                   <img src="${qrDataUrl}" style="width:70px; height:70px;" />
                 </div>`
              : ""
          }
        </td>
      </tr>
    </tbody>
  </table>
  <div style="height:1px; background:#dbe3f0; margin:0 0 12px 0;"></div>

  <h1 style="color:#1d4ed8; font-size:20px; margin:0 0 3px 0;">Orcamento da sua viagem</h1>
  <div style="font-size:11px; color:#0f172a; margin:0 0 12px 0;">${escapeHtml(dateLabel)}</div>

  ${
    isTotalOnlyMode
      ? `<div data-pdfmake='{"unbreakable":true}' style="border:1px solid #d1d5db; border-radius:10px; padding:11px 13px; margin:0 0 14px 0;">
           <div style="font-size:11px; color:#1d4ed8; margin:0 0 6px 0;"><b>Total do Orcamento</b></div>
           <div style="height:1px; background:#e2e8f0; margin:0 0 7px 0;"></div>
           <table style="width:100%; font-size:10px;">
             <tbody>
               <tr>
                 <td style="padding:2px 0; color:#64748b;">Valor Total</td>
                 <td style="padding:2px 0; text-align:right;"><b>${escapeHtml(formatCurrency(summary.total))}</b></td>
               </tr>
             </tbody>
           </table>
         </div>`
      : ""
  }

  ${
    options.showSummary
      ? `<div data-pdfmake='{"unbreakable":true}' style="border:1px solid #d1d5db; border-radius:10px; padding:11px 13px; margin:0 0 14px 0;">
           <div style="font-size:11px; color:#1d4ed8; margin:0 0 6px 0;"><b>Resumo do Orcamento</b></div>
           <div style="height:1px; background:#e2e8f0; margin:0 0 6px 0;"></div>
           <table style="width:100%; font-size:10px;">
             <tbody>
               <tr>
                 <td style="padding:1px 0; color:#64748b;">Valor sem taxas</td>
                 <td style="padding:1px 0; text-align:right;">${escapeHtml(formatCurrency(summary.valorSemTaxas))}</td>
               </tr>
               <tr>
                 <td style="padding:1px 0; color:#64748b;">Taxas e impostos</td>
                 <td style="padding:1px 0; text-align:right;">${escapeHtml(formatCurrency(summary.taxesTotal))}</td>
               </tr>
               ${
                 summary.discount > 0
                   ? `<tr>
                        <td style="padding:1px 0; color:#64748b;">Desconto</td>
                        <td style="padding:1px 0; text-align:right;">${escapeHtml(formatCurrency(-summary.discount))}</td>
                      </tr>`
                   : ""
               }
               <tr>
                 <td style="padding:3px 0 0 0;"><b>Total</b></td>
                 <td style="padding:3px 0 0 0; text-align:right;"><b>${escapeHtml(formatCurrency(summary.total))}</b></td>
               </tr>
             </tbody>
           </table>
         </div>`
      : ""
  }

  ${buildItemsHtml(orderedItems, options.showItemValues)}

  ${
    options.showSummary
      ? `<div data-pdfmake='{"unbreakable":true}' style="border:1px solid #d1d5db; border-radius:10px; padding:11px 13px; margin:0 0 14px 0;">
           <div style="font-size:11px; color:#1d4ed8; margin:0 0 6px 0;"><b>Resumo de servicos</b></div>
           <div style="height:1px; background:#e2e8f0; margin:0 0 7px 0;"></div>
           <table style="width:100%; font-size:10px;">
             <tbody>
               ${summary.rows
                 .map(
                   (row) => `<tr>
                     <td style="padding:2px 0;">${escapeHtml(row.label)}</td>
                     <td style="padding:2px 0; text-align:right;">${escapeHtml(formatCurrency(Number(row.value || 0)))}</td>
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

function loadPdfmakeDeps() {
  if (!pdfmakeDepsPromise) {
    pdfmakeDepsPromise = Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
      import("html-to-pdfmake"),
    ]).then(async ([pdfmakeMod, vfsFontsMod, htmlToPdfmakeMod]) => {
      const pdfMake = ((pdfmakeMod as any).default || pdfmakeMod) as PdfMakeLike;
      const vfsFonts = (vfsFontsMod as any).default || vfsFontsMod;
      const htmlToPdfmake = ((htmlToPdfmakeMod as any).default || htmlToPdfmakeMod) as HtmlToPdfmakeLike;

      if (vfsFonts?.pdfMake?.vfs) {
        pdfMake.vfs = vfsFonts.pdfMake.vfs;
      } else if (vfsFonts?.vfs) {
        pdfMake.vfs = vfsFonts.vfs;
      }

      const robotoFontMap = {
        Roboto: {
          normal: "Roboto-Regular.ttf",
          bold: "Roboto-Medium.ttf",
          italics: "Roboto-Italic.ttf",
          bolditalics: "Roboto-MediumItalic.ttf",
        },
      };
      pdfMake.fonts = {
        ...(pdfMake.fonts || {}),
        ...robotoFontMap,
      };

      let defaultFont = "Roboto";
      const [nunitoRegularBase64, nunitoSemiBoldBase64, nunitoBoldBase64] = await Promise.all([
        fetchAssetBase64(nunitoSansRegularUrl),
        fetchAssetBase64(nunitoSansSemiBoldUrl),
        fetchAssetBase64(nunitoSansBoldUrl),
      ]);

      if (nunitoRegularBase64 && nunitoSemiBoldBase64 && nunitoBoldBase64) {
        pdfMake.vfs = {
          ...(pdfMake.vfs || {}),
          [NUNITO_REGULAR_FILE]: nunitoRegularBase64,
          [NUNITO_SEMIBOLD_FILE]: nunitoSemiBoldBase64,
          [NUNITO_BOLD_FILE]: nunitoBoldBase64,
        };
        pdfMake.fonts = {
          ...(pdfMake.fonts || {}),
          NunitoSans: {
            normal: NUNITO_REGULAR_FILE,
            bold: NUNITO_BOLD_FILE,
            italics: NUNITO_REGULAR_FILE,
            bolditalics: NUNITO_BOLD_FILE,
          },
        };
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

    const [logoDataUrl, complementDataUrl, qrDataUrl] = await Promise.all([
      settings.logo_url ? fetchImageData(settings.logo_url).catch(() => null) : Promise.resolve(null),
      settings.imagem_complementar_url ? fetchImageData(settings.imagem_complementar_url).catch(() => null) : Promise.resolve(null),
      whatsappLink
        ? fetchImageData(`https://quickchart.io/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`).catch(() => null)
        : Promise.resolve(null),
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
    });

    const content = htmlToPdfmake(html, { window });
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
    if (typeof window !== "undefined") {
      console.info("[Quote PDF] Renderer moderno ativo (pdfmake).");
    }
    pdfMake.createPdf(docDefinition).download(fileName);
  } catch (error) {
    if (typeof window !== "undefined") {
      console.warn("[Quote PDF] Falha no renderer moderno; usando fallback legado (jsPDF).", error);
    }
    await exportQuoteToPdfLegacy(params);
  }
}
