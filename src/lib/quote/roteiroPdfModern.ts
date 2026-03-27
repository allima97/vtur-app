import { extractSeguroViagemIncludeLinesFromPasseios, isSeguroPasseioLike } from "../roteiroSeguro";
import { supabaseBrowser } from "../supabase-browser";
import nunitoSansBoldUrl from "../../assets/cards/fonts/NunitoSans-Bold.ttf?url";
import nunitoSansRegularUrl from "../../assets/cards/fonts/NunitoSans-Regular.ttf?url";
import nunitoSansSemiBoldUrl from "../../assets/cards/fonts/NunitoSans-SemiBold.ttf?url";
import type { QuotePdfSettings } from "./quotePdf";
import { resolveAirlineIata, resolveAirlineNameByIata, type AirlineIataLookupEntry } from "../airlineIata";
import { construirLinkWhatsApp } from "../whatsapp";
import type {
  ExportRoteiroPdfOptions,
  RoteiroDiaPdf,
  RoteiroHotelPdf,
  RoteiroPagamentoPdf,
  RoteiroParaPdf,
  RoteiroPasseioPdf,
  RoteiroTransportePdf,
} from "./roteiroPdf";
import { exportRoteiroPdf as exportRoteiroPdfLegacy } from "./roteiroPdf";

type PdfMakeLike = {
  vfs?: Record<string, string>;
  fonts?: Record<string, any>;
  createPdf: (docDefinition: any) => {
    // pdfmake 0.3.x: both are async; 2.x: getBlob was callback-based
    download: (fileName?: string) => Promise<void> | void;
    getBlob: ((cb: (blob: Blob) => void) => void) | (() => Promise<Blob>);
  };
};

const NUNITO_REGULAR_FILE = "NunitoSans-Regular.ttf";
const NUNITO_SEMIBOLD_FILE = "NunitoSans-SemiBold.ttf";
const NUNITO_BOLD_FILE = "NunitoSans-Bold.ttf";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + CHUNK_SIZE);
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

let pdfmakeDepsPromise: Promise<{ pdfMake: PdfMakeLike; defaultFont: string }> | null = null;

function loadPdfmakeDeps() {
  if (!pdfmakeDepsPromise) {
    pdfmakeDepsPromise = Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
    ]).then(async ([pdfmakeMod, vfsFontsMod]) => {
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
            pdfMake.vfs = { ...(pdfMake.vfs || {}), ...nunitoVfs };
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
            pdfMake.fonts = { ...(pdfMake.fonts || {}), ...nunitoFonts };
          } catch {
            // fallback silencioso quando o objeto importado é readonly
          }
        }
        defaultFont = "NunitoSans";
      }

      return { pdfMake, defaultFont };
    });
  }
  return pdfmakeDepsPromise;
}

function textValue(value?: string | null) {
  return String(value || "").trim();
}

function normalizeLookup(value?: string | null) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}


function formatCurrency(value?: number | string | null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return textValue(value);
  return date.toLocaleDateString("pt-BR");
}

function toDateOrNull(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseLineItems(text: string) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  return normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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

function formatFlightPlace(city?: string | null, airport?: string | null) {
  const cityValue = formatBudgetItemText(city);
  const airportValue = textValue(airport).toUpperCase();
  if (!cityValue && !airportValue) return "";
  if (!/^[A-Z]{3}$/.test(airportValue)) return cityValue || airportValue;
  if (!cityValue) return airportValue;
  if (new RegExp(`\\(${airportValue}\\)\\s*$`, "i").test(cityValue)) return cityValue;
  const normalizedCity = cityValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (normalizedCity === airportValue) return airportValue;
  return `${cityValue} (${airportValue})`;
}

function splitTrechoCities(trecho?: string | null) {
  const parts = String(trecho || "")
    .split("-")
    .map((part) => formatBudgetItemText(part))
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return {
    origem: parts[0] || "",
    destino: parts[parts.length - 1] || parts[0] || "",
    parts,
  };
}

function resolveInvestimentoValorTotalApto(item?: { valor_por_pessoa?: number | null; qtd_apto?: number | null; valor_por_apto?: number | null } | null) {
  const valorPorPessoa = Number(item?.valor_por_pessoa || 0);
  const qtdPax = Number(item?.qtd_apto || 0);
  const valorPorApto = Number(item?.valor_por_apto || 0);
  const safePessoa = Number.isFinite(valorPorPessoa) ? Math.max(valorPorPessoa, 0) : 0;
  const safeQtd = Number.isFinite(qtdPax) ? Math.max(qtdPax, 0) : 0;
  const safeApto = Number.isFinite(valorPorApto) ? Math.max(valorPorApto, 0) : 0;
  return safeApto > 0 ? safeApto : Math.max(Number((safePessoa * safeQtd).toFixed(2)), 0);
}

function normalizeDiaKey(d: { cidade?: string | null; percurso?: string | null; data?: string | null; descricao?: string | null }) {
  const cidade = normalizeLookup(d.cidade);
  const percurso = normalizeLookup(d.percurso);
  const data = textValue(d.data);
  const descricao = normalizeLookup(d.descricao);
  return `${data}__${cidade}__${percurso}__${descricao}`;
}

function normalizeDiasForPdf(items: RoteiroDiaPdf[]) {
  const sorted = (items || [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((item) => ({
      ...item,
      percurso: textValue(item.percurso),
      cidade: textValue(item.cidade),
      data: textValue(item.data),
      descricao: textValue(item.descricao),
    }))
    .filter((item) => Boolean(item.percurso || item.cidade || item.data || item.descricao));

  const seen = new Set<string>();
  const unique: typeof sorted = [];
  sorted.forEach((item) => {
    const key = normalizeDiaKey(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });
  return unique;
}

function groupHoteisByCidade(items: RoteiroHotelPdf[]) {
  const groups = new Map<string, { cidade: string; items: RoteiroHotelPdf[] }>();
  items.forEach((item) => {
    const cidade = formatBudgetItemText(item.cidade) || "Hospedagem";
    const key = normalizeLookup(cidade);
    if (!groups.has(key)) groups.set(key, { cidade, items: [] });
    groups.get(key)!.items.push(item);
  });
  return Array.from(groups.values()).sort((a, b) =>
    String(a.items[0]?.data_inicio || "").localeCompare(String(b.items[0]?.data_inicio || ""))
  );
}

function groupPasseiosByCidade(items: RoteiroPasseioPdf[]) {
  const groups = new Map<string, { cidade: string; items: RoteiroPasseioPdf[] }>();
  items.forEach((item) => {
    const cidade = formatBudgetItemText(item.cidade) || "Serviços";
    const key = normalizeLookup(cidade);
    if (!groups.has(key)) groups.set(key, { cidade, items: [] });
    groups.get(key)!.items.push(item);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items
        .slice()
        .sort((a, b) => {
          const aSeguro = isSeguroPasseioLike(a as any);
          const bSeguro = isSeguroPasseioLike(b as any);
          if (aSeguro !== bSeguro) return aSeguro ? -1 : 1;
          const dateCompare = String(a.data_inicio || "").localeCompare(String(b.data_inicio || ""));
          if (dateCompare !== 0) return dateCompare;
          return formatBudgetItemText(a.passeio).localeCompare(formatBudgetItemText(b.passeio));
        }),
    }))
    .sort((a, b) => {
      const aSeguro = a.items.some((item) => isSeguroPasseioLike(item as any));
      const bSeguro = b.items.some((item) => isSeguroPasseioLike(item as any));
      if (aSeguro !== bSeguro) return aSeguro ? -1 : 1;
      return String(a.items[0]?.data_inicio || "").localeCompare(String(b.items[0]?.data_inicio || ""));
    });
}

type PagamentoGroup = {
  servicos: string[];
  formas: string[];
  subtotal: number;
  taxesTotal: number;
  total: number;
  order: number;
};

function groupPagamentosByForma(items: RoteiroPagamentoPdf[]): PagamentoGroup[] {
  const groups = new Map<
    string,
    {
      order: number;
      servicos: Set<string>;
      formas: string[];
      formasSeen: Set<string>;
      subtotal: number;
      taxesTotal: number;
      total: number;
    }
  >();

  (items || []).forEach((item, index) => {
    const formas = parseLineItems(String(item.forma_pagamento || ""))
      .map((value) => formatBudgetItemText(value))
      .filter(Boolean);
    const formasKey = Array.from(new Set(formas.map((value) => normalizeLookup(value)).filter(Boolean)))
      .sort()
      .join("|");
    const groupKey = formasKey || "__sem_forma__";
    const servico = formatBudgetItemText(item.servico);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        order: index,
        servicos: new Set<string>(),
        formas: [],
        formasSeen: new Set<string>(),
        subtotal: 0,
        taxesTotal: 0,
        total: 0,
      });
    }
    const group = groups.get(groupKey)!;
    if (servico) group.servicos.add(servico);
    formas.forEach((forma) => {
      const lookup = normalizeLookup(forma);
      if (!lookup || group.formasSeen.has(lookup)) return;
      group.formasSeen.add(lookup);
      group.formas.push(forma);
    });
    const total = Number(item.valor_total_com_taxas || 0);
    const taxas = Number(item.taxas || 0);
    const safeTotal = Number.isFinite(total) ? Math.max(total, 0) : 0;
    const safeTaxes = Number.isFinite(taxas) ? Math.max(taxas, 0) : 0;
    group.total += safeTotal;
    group.taxesTotal += safeTaxes;
    group.subtotal += Math.max(safeTotal - safeTaxes, 0);
  });

  return Array.from(groups.values())
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      order: group.order,
      servicos: Array.from(group.servicos),
      formas: group.formas,
      subtotal: group.subtotal,
      taxesTotal: group.taxesTotal,
      total: group.total,
    }));
}

function collectCities(roteiro: RoteiroParaPdf) {
  const dias = normalizeDiasForPdf(roteiro.dias || []);
  const seen = new Set<string>();
  const cities: string[] = [];
  const add = (value?: string | null) => {
    const cidade = formatBudgetItemText(value);
    const key = normalizeLookup(cidade);
    if (!key || seen.has(key)) return;
    seen.add(key);
    cities.push(cidade);
  };

  dias.forEach((dia) => {
    const percursoParts = splitTrechoCities(dia.percurso).parts;
    if (percursoParts.length > 1) {
      percursoParts.forEach((part) => add(part));
      return;
    }
    add(dia.cidade);
    if (!textValue(dia.cidade)) add(dia.percurso);
  });
  (roteiro.hoteis || []).forEach((item) => add(item.cidade));
  (roteiro.passeios || []).forEach((item) => add(item.cidade));

  const firstDia = dias[0];
  const lastDia = dias[dias.length - 1];
  const firstParts = splitTrechoCities(firstDia?.percurso).parts;
  const lastParts = splitTrechoCities(lastDia?.percurso).parts;
  const origemBase = firstParts[0] || formatBudgetItemText(roteiro.inicio_cidade) || formatBudgetItemText(firstDia?.cidade);
  const destinoBase = lastParts[lastParts.length - 1] || formatBudgetItemText(roteiro.fim_cidade) || formatBudgetItemText(lastDia?.cidade);
  const baseKeys = new Set([origemBase, destinoBase].map((value) => normalizeLookup(value)).filter(Boolean));

  if (cities.length > 0) return cities.filter((cidade) => !baseKeys.has(normalizeLookup(cidade)));
  return cities;
}

function buildPeriodText(roteiro: RoteiroParaPdf) {
  const dateCandidates: Date[] = [];
  const pushDate = (value?: string | null) => {
    const date = toDateOrNull(value);
    if (date) dateCandidates.push(date);
  };
  normalizeDiasForPdf(roteiro.dias || []).forEach((d) => pushDate(d.data));
  (roteiro.hoteis || []).forEach((h) => {
    pushDate(h.data_inicio);
    pushDate(h.data_fim);
  });
  (roteiro.passeios || []).forEach((p) => {
    pushDate(p.data_inicio);
    pushDate(p.data_fim);
  });
  (roteiro.transportes || []).forEach((t) => {
    pushDate(t.data_inicio || t.data_voo);
    pushDate(t.data_fim || t.data_voo);
  });

  if (dateCandidates.length === 0) {
    if (roteiro.duracao) return `${roteiro.duracao} dias`;
    return "";
  }

  const startDate = dateCandidates.reduce((min, date) => (date.getTime() < min.getTime() ? date : min), dateCandidates[0]);
  const endDate = dateCandidates.reduce((max, date) => (date.getTime() > max.getTime() ? date : max), dateCandidates[0]);
  const range = `${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`;
  const daysCount = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  const nightsCount = Math.max(0, daysCount - 1);
  return `${range} (${daysCount} dias / ${nightsCount} noites)`;
}

async function resolveStorageUrl(url?: string | null, path?: string | null) {
  const storagePath =
    path ||
    (() => {
      if (!url) return null;
      const marker = "/quotes/";
      const index = url.indexOf(marker);
      return index === -1 ? null : url.slice(index + marker.length);
    })();

  if (storagePath) {
    const signed = await supabaseBrowser.storage.from("quotes").createSignedUrl(storagePath, 3600);
    if (signed.data?.signedUrl) return signed.data.signedUrl;
  }
  return url || null;
}

async function fetchImageDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// ── Native pdfmake content builder (no html-to-pdfmake) ─────────────────────

const CARD_BORDER_CLR = "#9ca3af";
const TITLE_BLUE_CLR = "#1a2cc8";
const TEXT_MUTED_CLR = "#64748b";
const TEXT_CLR = "#0f172a";

const cardLayout = {
  hLineWidth: () => 0.8,
  vLineWidth: () => 0.8,
  hLineColor: () => CARD_BORDER_CLR,
  vLineColor: () => CARD_BORDER_CLR,
  paddingLeft: () => 14,
  paddingRight: () => 14,
  paddingTop: () => 11,
  paddingBottom: () => 11,
};

const innerTableLayout = {
  hLineWidth: (i: number, node: any) =>
    i === 0 || i === 1 || i === node.table.body.length ? 0.7 : 0.3,
  vLineWidth: () => 0,
  hLineColor: () => "#d1d5db",
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

function makeCard(body: any, marginBottom = 14): any {
  const inner = Array.isArray(body) ? { stack: body } : body;
  return {
    table: { widths: ["*"], body: [[inner]] },
    layout: cardLayout,
    margin: [0, 0, 0, marginBottom],
  };
}

const sectionCardLayout = {
  hLineWidth: (i: number) => (i === 0 || i === 2) ? 0.8 : 0.4,
  vLineWidth: () => 0.8,
  hLineColor: (i: number) => i === 1 ? "#e2e8f0" : CARD_BORDER_CLR,
  vLineColor: () => CARD_BORDER_CLR,
  paddingLeft: () => 14,
  paddingRight: () => 14,
  paddingTop: () => 10,
  paddingBottom: () => 10,
};

function makeSectionCard(title: string, kind: IconKind, body: any | any[], marginBottom = 14): any {
  const contentCell = Array.isArray(body) ? { stack: body } : body;
  return {
    table: {
      widths: ["*"],
      body: [
        [sectionHeaderContent(title, kind)],
        [contentCell],
      ],
    },
    layout: sectionCardLayout,
    margin: [0, 0, 0, marginBottom],
  };
}

// ── Vector icons (ported from jsPDF drawIcon) ──────────────────────────────
type IconKind = "itinerary" | "hotel" | "passeio" | "flight" | "invest" | "included" | "excluded" | "payment" | "info" | "city";

function makeIconCanvas(kind: IconKind, size = 14, color = TITLE_BLUE_CLR): any {
  const s = size;
  const shapes: any[] = [];

  if (kind === "itinerary") {
    const r = s * 0.12;
    const yMid = s * 0.5;
    const x1 = s * 0.12, x2 = s * 0.5, x3 = s * 0.88;
    shapes.push({ type: "ellipse", x: x1, y: yMid, r1: r, r2: r, lineWidth: 1, lineColor: color });
    shapes.push({ type: "ellipse", x: x2, y: s * 0.24, r1: r, r2: r, lineWidth: 1, lineColor: color });
    shapes.push({ type: "ellipse", x: x3, y: s * 0.72, r1: r, r2: r, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: x1 + r, y1: yMid, x2: x2 - r, y2: s * 0.24, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: x2 + r, y1: s * 0.24, x2: x3 - r, y2: s * 0.72, lineWidth: 1, lineColor: color });
  } else if (kind === "hotel") {
    const baseY = s * 0.74;
    shapes.push({ type: "rect", x: s * 0.14, y: baseY - s * 0.38, w: s * 0.72, h: s * 0.38 + s * 0.12, lineWidth: 1, lineColor: color });
    shapes.push({ type: "rect", x: s * 0.14, y: baseY - s * 0.38, w: s * 0.22, h: s * 0.18, lineWidth: 0.6, lineColor: color });
  } else if (kind === "passeio") {
    shapes.push({ type: "ellipse", x: s * 0.5, y: s * 0.5, r1: s * 0.28, r2: s * 0.28, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.5, y1: s * 0.22, x2: s * 0.5, y2: s * 0.78, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.22, y1: s * 0.5, x2: s * 0.78, y2: s * 0.5, lineWidth: 1, lineColor: color });
  } else if (kind === "flight") {
    shapes.push({ type: "line", x1: s * 0.08, y1: s * 0.52, x2: s * 0.9, y2: s * 0.52, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.58, y1: s * 0.3, x2: s * 0.9, y2: s * 0.52, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.58, y1: s * 0.74, x2: s * 0.9, y2: s * 0.52, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.32, y1: s * 0.4, x2: s * 0.2, y2: s * 0.2, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.32, y1: s * 0.64, x2: s * 0.2, y2: s * 0.84, lineWidth: 1, lineColor: color });
  } else if (kind === "invest") {
    const bx = s * 0.1, by = s * 0.2, bw = s * 0.8, bh = s * 0.56;
    shapes.push({ type: "rect", x: bx, y: by, w: bw, h: bh, r: 2, lineWidth: 1, lineColor: color });
    shapes.push({ type: "ellipse", x: bx + bw * 0.5, y: by + bh * 0.5, r1: s * 0.12, r2: s * 0.12, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: bx + bw * 0.16, y1: by + bh * 0.24, x2: bx + bw * 0.28, y2: by + bh * 0.24, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: bx + bw * 0.72, y1: by + bh * 0.76, x2: bx + bw * 0.84, y2: by + bh * 0.76, lineWidth: 1, lineColor: color });
  } else if (kind === "included") {
    shapes.push({ type: "rect", x: s * 0.1, y: s * 0.1, w: s * 0.8, h: s * 0.8, r: 2, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.28, y1: s * 0.52, x2: s * 0.45, y2: s * 0.7, lineWidth: 1.5, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.45, y1: s * 0.7, x2: s * 0.74, y2: s * 0.34, lineWidth: 1.5, lineColor: color });
  } else if (kind === "excluded") {
    shapes.push({ type: "rect", x: s * 0.1, y: s * 0.1, w: s * 0.8, h: s * 0.8, r: 2, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.28, y1: s * 0.28, x2: s * 0.72, y2: s * 0.72, lineWidth: 1.5, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.72, y1: s * 0.28, x2: s * 0.28, y2: s * 0.72, lineWidth: 1.5, lineColor: color });
  } else if (kind === "payment") {
    shapes.push({ type: "rect", x: s * 0.08, y: s * 0.2, w: s * 0.84, h: s * 0.62, r: 2, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.08, y1: s * 0.38, x2: s * 0.92, y2: s * 0.38, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.2, y1: s * 0.58, x2: s * 0.42, y2: s * 0.58, lineWidth: 1.5, lineColor: color });
  } else if (kind === "info") {
    shapes.push({ type: "ellipse", x: s * 0.5, y: s * 0.5, r1: s * 0.34, r2: s * 0.34, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: s * 0.5, y1: s * 0.42, x2: s * 0.5, y2: s * 0.66, lineWidth: 1.5, lineColor: color });
    shapes.push({ type: "ellipse", x: s * 0.5, y: s * 0.28, r1: s * 0.05, r2: s * 0.05, lineWidth: 1, lineColor: color, color });
  } else if (kind === "city") {
    const cx = s * 0.5, cy = s * 0.38, r = s * 0.2;
    shapes.push({ type: "ellipse", x: cx, y: cy, r1: r, r2: r, lineWidth: 1, lineColor: color });
    shapes.push({ type: "ellipse", x: cx, y: cy, r1: r * 0.35, r2: r * 0.35, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: cx - r * 0.75, y1: cy + r * 0.7, x2: cx, y2: s * 0.92, lineWidth: 1, lineColor: color });
    shapes.push({ type: "line", x1: cx + r * 0.75, y1: cy + r * 0.7, x2: cx, y2: s * 0.92, lineWidth: 1, lineColor: color });
  }

  return { canvas: shapes, width: s + 2, height: s };
}

function sectionHeaderContent(title: string, kind: IconKind): any {
  return {
    columns: [
      { ...makeIconCanvas(kind, 14, TITLE_BLUE_CLR), margin: [0, 1, 0, 0] },
      { text: title, fontSize: 16, bold: true, color: TITLE_BLUE_CLR, width: "*" },
    ],
    columnGap: 8,
  };
}

function cityLabel(cidade: string): any {
  return {
    columns: [
      { ...makeIconCanvas("city", 12, TEXT_MUTED_CLR), margin: [0, 1, 0, 0] },
      { text: cidade, fontSize: 12, bold: true, color: "#334155", width: "*" },
    ],
    columnGap: 6,
    margin: [0, 0, 0, 7],
  };
}

function th(text: string, align: "left" | "center" | "right" = "left"): any {
  return { text, fontSize: 10, bold: true, color: "#1e3a8a", fillColor: "#e0e7ff", alignment: align };
}

function td(text: string, align: "left" | "center" | "right" = "left"): any {
  return { text, fontSize: 10, alignment: align, color: TEXT_MUTED_CLR };
}

function buildRoteiroPdfContent(roteiro: RoteiroParaPdf, settings: QuotePdfSettings, airlineLookup: AirlineIataLookupEntry[] = []): any[] {
  const dias = normalizeDiasForPdf(roteiro.dias || []);
  const hoteis = (roteiro.hoteis || []).filter((item) => Boolean(textValue(item.cidade) || textValue(item.hotel)));
  const passeios = (roteiro.passeios || []).filter((item) => Boolean(textValue(item.passeio) || textValue(item.cidade)));
  const transportes = (roteiro.transportes || []).filter((item) => Boolean(textValue(item.cia_aerea) || textValue(item.trecho)));
  const investimentos = (roteiro.investimentos || []).filter((item) =>
    Boolean(textValue(item.tipo) || Number(item.valor_por_pessoa || 0) > 0 || Number(item.valor_por_apto || 0) > 0 || Number(item.qtd_apto || 0) > 0)
  );
  const pagamentos = (roteiro.pagamentos || []).filter((item) =>
    Boolean(textValue(item.servico) || textValue(item.forma_pagamento) || Number(item.valor_total_com_taxas || 0) > 0 || Number(item.taxas || 0) > 0)
  );

  const cities = collectCities(roteiro);
  const citiesLine = cities.join(" - ");
  const periodText = buildPeriodText(roteiro);
  const groupedHoteis = groupHoteisByCidade(hoteis);
  const groupedPasseios = groupPasseiosByCidade(passeios);
  const investimentoTotalApto = investimentos.reduce((sum, item) => sum + resolveInvestimentoValorTotalApto(item as any), 0);
  const pagamentoGroups = groupPagamentosByForma(pagamentos);
  const groupedSeguroCityLabel = citiesLine || "Serviços";

  const includeItems = [
    ...parseLineItems(String(roteiro.inclui_texto || "")),
    ...extractSeguroViagemIncludeLinesFromPasseios(roteiro.passeios || []),
  ];
  const includeSeen = new Set<string>();
  const includeUnique = includeItems.filter((item) => {
    const key = normalizeLookup(item);
    if (!key || includeSeen.has(key)) return false;
    includeSeen.add(key);
    return true;
  });

  const noIncludeItems = parseLineItems(String(roteiro.nao_inclui_texto || ""));
  const infoItems = parseLineItems(String(roteiro.informacoes_importantes || ""));

  const content: any[] = [];

  // ── Title card ────────────────────────────────────────────────
  content.push(makeCard([
    { text: "Roteiro Personalizado", fontSize: 18, bold: true, color: TITLE_BLUE_CLR },
    { text: textValue(roteiro.nome || "Roteiro"), fontSize: 15, bold: true, color: TEXT_CLR, margin: [0, 6, 0, 0] },
  ], 10));

  // ── Period / cities card ──────────────────────────────────────
  if (citiesLine || periodText) {
    const periodItems: any[] = [];
    if (citiesLine) periodItems.push({ text: citiesLine, fontSize: 13, bold: true, color: TEXT_CLR, margin: [0, 0, 0, 4] });
    if (periodText) periodItems.push({ text: [{ text: "Per\u00edodo: ", bold: true }, { text: periodText }], fontSize: 11 });
    content.push(makeCard(periodItems.length === 1 ? periodItems[0] : { stack: periodItems }, 14));
  }

  // ── Itinerary ─────────────────────────────────────────────────
  if (dias.length > 0) {
    const diaItems = dias.map((dia, index) => {
      const place = formatBudgetItemText(dia.percurso) || formatBudgetItemText(dia.cidade);
      const header = `${formatDate(dia.data)} \u2014 Dia ${index + 1}${place ? `: ${place}` : ""}`;
      const descricao = formatBudgetItemText(dia.descricao) || "-";
      return {
        stack: [
          { text: header, bold: true, fontSize: 11, color: TEXT_CLR },
          { text: descricao, fontSize: 11, color: TEXT_MUTED_CLR, margin: [0, 2, 0, 0] },
        ],
        unbreakable: true,
        margin: [0, 0, 0, index < dias.length - 1 ? 8 : 0],
      };
    });
    content.push(makeSectionCard("Itiner\u00e1rio Detalhado", "itinerary", { stack: diaItems }, 14));
  }

  // ── Hotels ────────────────────────────────────────────────────
  if (groupedHoteis.length > 0) {
    groupedHoteis.forEach((group, groupIndex) => {
      const tableBody: any[][] = [
        [
          th("Nome Hotel"),
          th("Per\u00edodo de", "center"),
          th("Per\u00edodo at\u00e9", "center"),
          th("Noites", "center"),
          th("Acomoda\u00e7\u00e3o", "center"),
          th("Regime", "center"),
        ],
        ...group.items.map((hotel) => [
          td(formatBudgetItemText(hotel.hotel) || "-"),
          td(formatDate(hotel.data_inicio) || "-", "center"),
          td(formatDate(hotel.data_fim) || "-", "center"),
          td(String(Number(hotel.noites || 0) || "-"), "center"),
          td(formatBudgetItemText(hotel.apto) || "-", "center"),
          td(formatBudgetItemText(hotel.regime) || "-", "center"),
        ]),
      ];
      const tableBlock = {
        table: { widths: ["*", "auto", "auto", "auto", "auto", "auto"], headerRows: 1, body: tableBody },
        layout: innerTableLayout,
      };
      if (groupIndex === 0) {
        content.push(makeSectionCard("Hot\u00e9is Sugeridos", "hotel", [cityLabel(group.cidade), tableBlock], 10));
      } else {
        content.push(makeCard([cityLabel(group.cidade), tableBlock], 10));
      }
    });
  }

  // ── Passeios e Servicos ───────────────────────────────────────
  if (groupedPasseios.length > 0) {
    groupedPasseios.forEach((group, groupIndex) => {
      const groupHasSeguro = group.items.some((item) => isSeguroPasseioLike(item as any));
      const isGenericServiceGroup = !normalizeLookup(group.cidade) || normalizeLookup(group.cidade) === "servicos";
      const displayCidade = groupHasSeguro && isGenericServiceGroup ? groupedSeguroCityLabel : group.cidade;
      const tableBody: any[][] = [
        [th("Data"), th("Descri\u00e7\u00e3o"), th("Ingressos")],
        ...group.items.map((item) => {
          const dataInicio = formatDate(item.data_inicio);
          const dataFim = formatDate(item.data_fim);
          const data = dataInicio && dataFim && dataInicio !== dataFim
            ? `${dataInicio} a ${dataFim}`
            : dataInicio || dataFim || "-";
          return [
            td(data),
            td(formatBudgetItemText(item.passeio) || "-"),
            td(formatBudgetItemText(item.ingressos) || "-"),
          ];
        }),
      ];
      const tableBlock = {
        table: { widths: ["auto", "*", "auto"], headerRows: 1, body: tableBody },
        layout: innerTableLayout,
      };
      if (groupIndex === 0) {
        content.push(makeSectionCard("Passeios e Servi\u00e7os", "passeio", [cityLabel(displayCidade || "Servi\u00e7os"), tableBlock], 10));
      } else {
        content.push(makeCard([cityLabel(displayCidade || "Servi\u00e7os"), tableBlock], 10));
      }
    });
  }

  // ── Passagem Aerea ────────────────────────────────────────────
  if (transportes.length > 0) {
    const flightRows = transportes.map((item) => {
      const trecho = splitTrechoCities(item.trecho);
      const dataOrigem = formatDate(item.data_voo || item.data_inicio);
      const dataDestino = formatDate(item.data_fim || item.data_voo || item.data_inicio);
      const horarios =
        textValue(item.hora_saida) && textValue(item.hora_chegada)
          ? `${textValue(item.hora_saida)} / ${textValue(item.hora_chegada)}`
          : textValue(item.hora_saida) || textValue(item.hora_chegada) || "-";
      const iataCode = resolveAirlineIata(item.cia_aerea, airlineLookup) || formatBudgetItemText(item.cia_aerea) || "-";
      const origemDisplay = formatFlightPlace(trecho.origem, item.aeroporto_saida) || "-";
      const destinoDisplay = formatFlightPlace(trecho.destino, item.aeroporto_chegada) || "-";
      return { iataCode, origemDisplay, dataOrigem, destinoDisplay, dataDestino, horarios };
    });
    const flightTableBody: any[][] = [
      [th("Cia"), th("Origem"), th("Sa\u00edda"), th("Destino"), th("Chegada"), th("Sa\u00edda / Chegada")],
      ...flightRows.map((row) => [
        td(row.iataCode),
        td(row.origemDisplay),
        td(row.dataOrigem || "-"),
        td(row.destinoDisplay),
        td(row.dataDestino || "-"),
        td(row.horarios),
      ]),
    ];
    const airlineLegendParts: string[] = [];
    const seenCodes = new Set<string>();
    flightRows.forEach((row, index) => {
      const code = resolveAirlineIata(transportes[index].cia_aerea, airlineLookup);
      if (!code || code === "-" || seenCodes.has(code)) return;
      seenCodes.add(code);
      const name = resolveAirlineNameByIata(code, airlineLookup) || formatBudgetItemText(transportes[index].cia_aerea);
      if (name) airlineLegendParts.push(`${code} = ${name}`);
    });
    const flightCardBody: any[] = [
      {
        table: { widths: ["auto", "*", "auto", "*", "auto", "auto"], headerRows: 1, body: flightTableBody },
        layout: innerTableLayout,
      },
    ];
    if (airlineLegendParts.length > 0) {
      flightCardBody.push({
        text: airlineLegendParts.join("  |  "),
        fontSize: 8,
        color: TEXT_MUTED_CLR,
        margin: [0, 6, 0, 0],
      });
    }
    content.push(makeSectionCard("Passagem A\u00e9rea", "flight", flightCardBody, 14));
  }

  // ── Investimento ──────────────────────────────────────────────
  if (investimentos.length > 0) {
    const investTableBody: any[][] = [
      [th("Tipo"), th("Valor por Pessoa", "center"), th("Qte Paxs", "center"), th("Valor total por Apto", "center")],
      ...investimentos.map((item) => {
        const valorApto = resolveInvestimentoValorTotalApto(item as any);
        return [
          td(formatBudgetItemText(item.tipo) || "-"),
          td(Number(item.valor_por_pessoa || 0) > 0 ? formatCurrency(item.valor_por_pessoa) : "-", "center"),
          td(Number(item.qtd_apto || 0) > 0 ? String(Number(item.qtd_apto)) : "-", "center"),
          td(valorApto > 0 ? formatCurrency(valorApto) : "-", "center"),
        ];
      }),
      [
        { text: "Total Geral (Aptos)", bold: true, fontSize: 10, colSpan: 3, color: TEXT_CLR },
        {},
        {},
        { text: formatCurrency(investimentoTotalApto), bold: true, fontSize: 10, alignment: "center", color: TEXT_CLR },
      ],
    ];
    content.push(makeSectionCard("Investimento", "invest", {
      table: { widths: ["*", "auto", "auto", "auto"], headerRows: 1, body: investTableBody },
      layout: innerTableLayout,
    }, 14));
  }

  // ── Pagamento ─────────────────────────────────────────────────
  if (pagamentoGroups.length > 0) {
    const pagItems: any[] = pagamentoGroups.map((group, index) => {
      const serviceTitle = group.servicos.join(" / ");
      const isAereoGroup = group.servicos.some((servico) => normalizeLookup(servico).startsWith("passagem aerea"));
      const hasPacoteCompleto = group.servicos.some((servico) => normalizeLookup(servico) === "pacote completo");
      let displaySubtotal = group.subtotal;
      let displayTaxes = group.taxesTotal;
      let displayTotal = group.total;
      if (hasPacoteCompleto && displayTotal <= 0 && investimentoTotalApto > 0) {
        displaySubtotal = investimentoTotalApto;
        displayTaxes = 0;
        displayTotal = investimentoTotalApto;
      }
      const resumo = isAereoGroup
        ? `Valor sem Taxas: ${formatCurrency(displaySubtotal)} | Taxas: ${formatCurrency(displayTaxes)} | Total: ${formatCurrency(displayTotal)}`
        : `Valor Total: ${formatCurrency(displayTotal)}`;
      const stackItems: any[] = [];
      if (serviceTitle) stackItems.push({ text: `> ${serviceTitle}`, bold: true, fontSize: 11, color: TEXT_CLR });
      stackItems.push({ text: resumo, fontSize: 10, color: TEXT_MUTED_CLR, margin: [14, 2, 0, 4] });
      if (group.formas.length > 0) {
        stackItems.push({ text: "Forma de Pagamento:", bold: true, fontSize: 11, color: TEXT_CLR, margin: [14, 0, 0, 2] });
        group.formas.forEach((forma) => {
          stackItems.push({ text: `  \u2022 ${forma}`, fontSize: 11, color: TEXT_MUTED_CLR, margin: [22, 0, 0, 1] });
        });
      }
      return {
        stack: stackItems,
        unbreakable: true,
        margin: [0, 0, 0, index < pagamentoGroups.length - 1 ? 10 : 0],
      };
    });
    content.push(makeSectionCard("Pagamento", "payment", { stack: pagItems }, 14));
  }

  // ── O que esta incluido ───────────────────────────────────────
  if (includeUnique.length > 0) {
    content.push(makeSectionCard("O que est\u00e1 inclu\u00eddo:", "included", { ul: includeUnique.map((item) => ({ text: item, fontSize: 11, color: TEXT_MUTED_CLR })) }, 14));
  }

  // ── O que nao esta incluido ───────────────────────────────────
  if (noIncludeItems.length > 0) {
    content.push(makeSectionCard("O que n\u00e3o est\u00e1 inclu\u00eddo", "excluded", { ul: noIncludeItems.map((item) => ({ text: item, fontSize: 11, color: TEXT_MUTED_CLR })) }, 14));
  }

  // ── Informacoes Importantes ───────────────────────────────────
  if (infoItems.length > 0) {
    content.push(makeSectionCard("Informa\u00e7\u00f5es Importantes", "info", { ul: infoItems.map((item) => ({ text: item, fontSize: 11, color: TEXT_MUTED_CLR })) }, 14));
  }

  // ── Rodape ────────────────────────────────────────────────────
  if (textValue(settings.rodape_texto)) {
    content.push({
      stack: parseLineItems(String(settings.rodape_texto || "")).map((line) => ({
        text: line,
        fontSize: 8,
        color: "#64748b",
      })),
      margin: [0, 10, 0, 0],
    });
  }

  return content;
}

function buildFileName(roteiro: RoteiroParaPdf) {
  const safeName = textValue(roteiro.nome || "roteiro")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  return `roteiro-${safeName || "roteiro"}.pdf`;
}

async function getBlobFromPdf(pdfDoc: { getBlob: (...args: any[]) => any }): Promise<Blob> {
  // pdfmake 0.3.x: getBlob() is async and returns Promise<Blob>
  // pdfmake 2.x: getBlob(callback) was callback-based
  const maybePromise = (pdfDoc as any).getBlob();
  if (maybePromise && typeof (maybePromise as any).then === "function") {
    return maybePromise as Promise<Blob>;
  }
  return new Promise<Blob>((resolve, reject) => {
    try {
      (pdfDoc as any).getBlob((blob: Blob) => resolve(blob));
    } catch (error) {
      reject(error);
    }
  });
}

export async function exportRoteiroPdf(
  roteiro: RoteiroParaPdf,
  options: ExportRoteiroPdfOptions = {}
): Promise<string | void> {
  try {
    if (typeof window === "undefined") {
      throw new Error("PDFMake disponível apenas no navegador.");
    }

    const action = options.action || "download";
    const { data: auth } = await supabaseBrowser.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) throw new Error("Usuario nao autenticado.");

    const { data: settings, error: settingsErr } = await supabaseBrowser
      .from("quote_print_settings")
      .select(
        "logo_url, logo_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto, imagem_complementar_url, imagem_complementar_path"
      )
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (settingsErr) throw settingsErr;
    if (!settings) throw new Error("Configure os parametros do PDF em Parametros > Orcamentos.");

    const logoUrl = await resolveStorageUrl((settings as any).logo_url, (settings as any).logo_path).catch(() => null);

    const whatsappLink = construirLinkWhatsApp((settings as any).whatsapp, (settings as any).whatsapp_codigo_pais);

    const [logoDataUrl, qrDataUrl, airlineLookup] = await Promise.all([
      logoUrl ? fetchImageDataUrl(logoUrl).catch(() => null) : Promise.resolve(null),
      whatsappLink
        ? fetchImageDataUrl(`https://quickchart.io/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`).catch(() => null)
        : Promise.resolve(null),
      (async () => {
        try {
          const [{ data: codes }, { data: aliases }] = await Promise.all([
            supabaseBrowser.from("airline_iata_codes").select("id, iata_code, airline_name").eq("active", true).limit(2000),
            supabaseBrowser.from("airline_iata_aliases").select("airline_code_id, alias").limit(5000),
          ]);
          const aliasByCodeId = new Map<string, string[]>();
          (aliases || []).forEach((row: any) => {
            const codeId = String(row?.airline_code_id || "").trim();
            const alias = String(row?.alias || "").trim();
            if (!codeId || !alias) return;
            const current = aliasByCodeId.get(codeId) || [];
            current.push(alias);
            aliasByCodeId.set(codeId, current);
          });
          return (codes || []).map((row: any) => ({
            iata: String(row?.iata_code || "").trim().toUpperCase(),
            name: String(row?.airline_name || "").trim(),
            aliases: aliasByCodeId.get(String(row?.id || "").trim()) || [],
          }));
        } catch {
          return [];
        }
      })(),
    ]);

    const { pdfMake, defaultFont } = await loadPdfmakeDeps();
    const content = buildRoteiroPdfContent(roteiro, settings as QuotePdfSettings, airlineLookup);

    const filialLines = [
      (settings as any).filial_nome,
      (settings as any).endereco_linha1,
      (settings as any).endereco_linha2,
      (settings as any).endereco_linha3,
    ].filter(Boolean) as string[];

    const consultorLines = [
      (settings as any).consultor_nome ? `Consultor: ${(settings as any).consultor_nome}` : null,
      (settings as any).telefone ? `Telefone: ${(settings as any).telefone}` : null,
      (settings as any).whatsapp ? `WhatsApp: ${(settings as any).whatsapp}` : null,
      (settings as any).email ? `E-mail:` : null,
      (settings as any).email || null,
    ].filter(Boolean) as string[];

    const headerLogoDataUrl = logoDataUrl;
    const headerQrDataUrl = qrDataUrl;

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [40, 90, 40, 40],
      defaultStyle: {
        font: defaultFont,
        fontSize: 11,
        color: TEXT_CLR,
        lineHeight: 1.3,
      },
      header: (_currentPage: number, _pageCount: number, pageSize: any) => {
        const logoCol: any[] = headerLogoDataUrl
          ? [{ image: headerLogoDataUrl, width: 52, margin: [0, 0, 6, 0] }]
          : [];
        const filialStack = filialLines.map((line) => ({ text: line, fontSize: 8, color: "#334155" }));
        const leftInner = filialStack.length > 0
          ? { stack: filialStack }
          : { text: "" };
        const rightConsultorStack: any[] = [
          ...(headerQrDataUrl ? [{ text: "Aponte para o QR Code e fale com o consultor:", fontSize: 7, color: "#94a3b8", margin: [0, 0, 0, 2] }] : []),
          ...consultorLines.map((line) => ({ text: line, fontSize: 8, color: "#334155" })),
        ];
        const rightCol: any = headerQrDataUrl
          ? {
              columns: [
                { stack: rightConsultorStack, width: "*" },
                { image: headerQrDataUrl, width: 44, height: 44, margin: [4, 0, 0, 0] },
              ],
              columnGap: 4,
              width: "*",
            }
          : { stack: rightConsultorStack, width: "*" };
        return {
          margin: [40, 12, 40, 0],
          stack: [
            {
              columns: [
                {
                  columns: logoCol.length > 0 ? [...logoCol, leftInner] : [leftInner],
                  columnGap: 6,
                  width: "48%",
                },
                rightCol,
              ],
              columnGap: 10,
            },
            {
              canvas: [{
                type: "line",
                x1: 0, y1: 6,
                x2: pageSize.width - 80, y2: 6,
                lineWidth: 0.5,
                lineColor: "#d1d5db",
              }],
              margin: [0, 2, 0, 0],
            },
          ],
        };
      },
      content,
      footer: (currentPage: number, pageCount: number) => ({
        text: `Pagina ${currentPage} de ${pageCount}`,
        alignment: "center",
        color: "#64748b",
        fontSize: 8,
        margin: [0, 6, 0, 0],
      }),
    };

    const fileName = buildFileName(roteiro);
    const pdfDoc = pdfMake.createPdf(docDefinition);
    if (typeof window !== "undefined") {
      console.info("[Roteiro PDF] Renderer moderno ativo (pdfmake).");
    }

    if (action === "blob-url") {
      const blob = await getBlobFromPdf(pdfDoc);
      return URL.createObjectURL(blob);
    }

    if (action === "preview") {
      const blob = await getBlobFromPdf(pdfDoc);
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
    // Fallback seguro para o gerador atual baseado em jsPDF.
    if (typeof window !== "undefined") {
      console.warn("[Roteiro PDF] Falha no renderer moderno; usando fallback legado (jsPDF).", error);
    }
    return await exportRoteiroPdfLegacy(roteiro, options);
  }
}
