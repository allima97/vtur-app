import { extractSeguroViagemIncludeLinesFromPasseios, isSeguroPasseioLike } from "../roteiroSeguro";
import { supabaseBrowser } from "../supabase-browser";
import nunitoSansBoldUrl from "../../assets/cards/fonts/NunitoSans-Bold.ttf?url";
import nunitoSansRegularUrl from "../../assets/cards/fonts/NunitoSans-Regular.ttf?url";
import nunitoSansSemiBoldUrl from "../../assets/cards/fonts/NunitoSans-SemiBold.ttf?url";
import type { QuotePdfSettings } from "./quotePdf";
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
    download: (fileName?: string) => void;
    getBlob: (cb: (blob: Blob) => void) => void;
  };
};

type HtmlToPdfmakeLike = (html: string, options?: { window?: Window }) => any;

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

let pdfmakeDepsPromise: Promise<{ pdfMake: PdfMakeLike; htmlToPdfmake: HtmlToPdfmakeLike; defaultFont: string }> | null = null;

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

      return { pdfMake, htmlToPdfmake, defaultFont };
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

function escapeHtml(value?: string | null) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function buildRoteiroHtml(roteiro: RoteiroParaPdf, settings: QuotePdfSettings, logoDataUrl: string | null) {
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

  const headerInfo = [
    settings.consultor_nome ? `Consultor: ${settings.consultor_nome}` : "",
    settings.telefone ? `Telefone: ${settings.telefone}` : "",
    settings.whatsapp ? `WhatsApp: ${settings.whatsapp}` : "",
    settings.email ? `E-mail: ${settings.email}` : "",
  ].filter(Boolean);

  return `
<div>
  <table style="width:100%; margin-bottom:10px;">
    <tbody>
      <tr>
        <td style="width:45%; vertical-align:top;">
          ${logoDataUrl ? `<img src="${logoDataUrl}" style="width:180px; height:auto;" />` : ""}
        </td>
        <td style="width:55%; text-align:right; vertical-align:top; color:#475569; font-size:9px;">
          ${headerInfo.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        </td>
      </tr>
    </tbody>
  </table>

  <h1 style="color:#1d4ed8; font-size:20px; margin:0 0 4px 0;">Roteiro Personalizado</h1>
  <h2 style="color:#0f172a; font-size:15px; margin:0 0 10px 0;">${escapeHtml(roteiro.nome || "Roteiro")}</h2>

  <div data-pdfmake='{"unbreakable":true}' style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
    ${citiesLine ? `<div style="font-size:12px; margin-bottom:4px;"><b>Cidades:</b> ${escapeHtml(citiesLine)}</div>` : ""}
    ${periodText ? `<div style="font-size:12px;"><b>Período:</b> ${escapeHtml(periodText)}</div>` : ""}
  </div>

  ${
    dias.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">Itinerário Detalhado</h2>
         <div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
           ${dias
             .map((dia, index) => {
               const place = formatBudgetItemText(dia.percurso) || formatBudgetItemText(dia.cidade);
               const header = `${formatDate(dia.data)} — Dia ${index + 1}${place ? `: ${place}` : ""}`;
               const descricao = formatBudgetItemText(dia.descricao) || "-";
               return `<div data-pdfmake='{"unbreakable":true}' style="margin-bottom:8px;"><b>${escapeHtml(header)}</b><br/>${escapeHtml(descricao)}</div>`;
             })
             .join("")}
         </div>`
      : ""
  }

  ${
    groupedHoteis.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">Hotéis Sugeridos</h2>
         ${groupedHoteis
           .map((group) => {
             const rows = group.items
               .map((hotel) => {
                 const de = formatDate(hotel.data_inicio);
                 const ate = formatDate(hotel.data_fim);
                 return `<tr>
                   <td>${escapeHtml(formatBudgetItemText(hotel.hotel) || "-")}</td>
                   <td style="text-align:center;">${escapeHtml(de || "-")}</td>
                   <td style="text-align:center;">${escapeHtml(ate || "-")}</td>
                   <td style="text-align:center;">${Number(hotel.noites || 0) || "-"}</td>
                   <td style="text-align:center;">${escapeHtml(formatBudgetItemText(hotel.apto) || "-")}</td>
                   <td style="text-align:center;">${escapeHtml(formatBudgetItemText(hotel.regime) || "-")}</td>
                 </tr>`;
               })
               .join("");
             return `<div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
               <div style="font-size:13px; color:#334155; margin-bottom:6px;"><b>${escapeHtml(group.cidade)}</b></div>
               <table style="width:100%; font-size:10px;">
                 <thead>
                   <tr>
                     <th style="text-align:left;">Nome Hotel</th>
                     <th style="text-align:center;">Período de</th>
                     <th style="text-align:center;">Período até</th>
                     <th style="text-align:center;">Noites</th>
                     <th style="text-align:center;">Acomodação</th>
                     <th style="text-align:center;">Regime</th>
                   </tr>
                 </thead>
                 <tbody>${rows}</tbody>
               </table>
             </div>`;
           })
           .join("")}`
      : ""
  }

  ${
    groupedPasseios.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">Passeios e Serviços</h2>
         ${groupedPasseios
           .map((group) => {
             const groupHasSeguro = group.items.some((item) => isSeguroPasseioLike(item as any));
             const isGenericServiceGroup = !normalizeLookup(group.cidade) || normalizeLookup(group.cidade) === "servicos";
             const displayCidade = groupHasSeguro && isGenericServiceGroup ? groupedSeguroCityLabel : group.cidade;
             const rows = group.items
               .map((item) => {
                 const dataInicio = formatDate(item.data_inicio);
                 const dataFim = formatDate(item.data_fim);
                 const data = dataInicio && dataFim && dataInicio !== dataFim ? `${dataInicio} a ${dataFim}` : dataInicio || dataFim || "-";
                 return `<tr>
                   <td style="text-align:left;">${escapeHtml(data)}</td>
                   <td style="text-align:left;">${escapeHtml(formatBudgetItemText(item.passeio) || "-")}</td>
                   <td style="text-align:left;">${escapeHtml(formatBudgetItemText(item.ingressos) || "-")}</td>
                 </tr>`;
               })
               .join("");
             return `<div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
               <div style="font-size:13px; color:#334155; margin-bottom:6px;"><b>${escapeHtml(displayCidade || "Serviços")}</b></div>
               <table style="width:100%; font-size:10px;">
                 <thead>
                   <tr>
                     <th style="text-align:left; width:18%;">Data</th>
                     <th style="text-align:left; width:62%;">Descrição</th>
                     <th style="text-align:left; width:20%;">Ingressos</th>
                   </tr>
                 </thead>
                 <tbody>${rows}</tbody>
               </table>
             </div>`;
           })
           .join("")}`
      : ""
  }

  ${
    transportes.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">Passagem Aérea</h2>
         <div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
           <table style="width:100%; font-size:10px;">
             <thead>
               <tr>
                 <th style="text-align:left;">Cia</th>
                 <th style="text-align:left;">Origem</th>
                 <th style="text-align:left;">Saída</th>
                 <th style="text-align:left;">Destino</th>
                 <th style="text-align:left;">Chegada</th>
                 <th style="text-align:left;">Saída / Chegada</th>
               </tr>
             </thead>
             <tbody>
               ${transportes
                 .map((item) => {
                   const trecho = splitTrechoCities(item.trecho);
                   const dataOrigem = formatDate(item.data_voo || item.data_inicio);
                   const dataDestino = formatDate(item.data_fim || item.data_voo || item.data_inicio);
                   const horarios =
                     textValue(item.hora_saida) && textValue(item.hora_chegada)
                       ? `${textValue(item.hora_saida)} / ${textValue(item.hora_chegada)}`
                       : textValue(item.hora_saida) || textValue(item.hora_chegada) || "-";
                   return `<tr>
                     <td>${escapeHtml(formatBudgetItemText(item.cia_aerea) || "-")}</td>
                     <td>${escapeHtml(trecho.origem || "-")}</td>
                     <td>${escapeHtml(dataOrigem || "-")}</td>
                     <td>${escapeHtml(trecho.destino || "-")}</td>
                     <td>${escapeHtml(dataDestino || "-")}</td>
                     <td>${escapeHtml(horarios)}</td>
                   </tr>`;
                 })
                 .join("")}
             </tbody>
           </table>
         </div>`
      : ""
  }

  ${
    investimentos.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">Investimento</h2>
         <div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
           <table style="width:100%; font-size:10px;">
             <thead>
               <tr>
                 <th style="text-align:left;">Tipo</th>
                 <th style="text-align:center;">Valor por Pessoa</th>
                 <th style="text-align:center;">Qte Paxs</th>
                 <th style="text-align:center;">Valor total por Apto</th>
               </tr>
             </thead>
             <tbody>
               ${investimentos
                 .map((item) => {
                   const valorApto = resolveInvestimentoValorTotalApto(item as any);
                   return `<tr>
                     <td>${escapeHtml(formatBudgetItemText(item.tipo) || "-")}</td>
                     <td style="text-align:center;">${escapeHtml(Number(item.valor_por_pessoa || 0) > 0 ? formatCurrency(item.valor_por_pessoa) : "-")}</td>
                     <td style="text-align:center;">${Number(item.qtd_apto || 0) > 0 ? Number(item.qtd_apto || 0) : "-"}</td>
                     <td style="text-align:center;">${escapeHtml(valorApto > 0 ? formatCurrency(valorApto) : "-")}</td>
                   </tr>`;
                 })
                 .join("")}
               <tr>
                 <td colspan="3"><b>Total Geral (Aptos)</b></td>
                 <td style="text-align:center;"><b>${escapeHtml(formatCurrency(investimentoTotalApto))}</b></td>
               </tr>
             </tbody>
           </table>
         </div>`
      : ""
  }

  ${
    pagamentoGroups.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">Pagamento</h2>
         <div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
           ${pagamentoGroups
             .map((group) => {
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
                 ? `Valor sem Taxas: ${formatCurrency(displaySubtotal)} | Valor das Taxas: ${formatCurrency(displayTaxes)} | Valor Total: ${formatCurrency(displayTotal)}`
                 : `Valor Total: ${formatCurrency(displayTotal)}`;
               const formas = group.formas.map((forma) => `<li>${escapeHtml(forma)}</li>`).join("");
               return `<div data-pdfmake='{"unbreakable":true}' style="margin-bottom:10px;">
                 ${serviceTitle ? `<div><b>→ ${escapeHtml(serviceTitle)}</b></div>` : ""}
                 <div style="font-size:9px; color:#64748b; margin:3px 0 6px 14px;">${escapeHtml(resumo)}</div>
                 ${
                   formas
                     ? `<div style="margin-left:14px;"><b>Forma de Pagamento:</b><ul style="margin:4px 0 0 12px;">${formas}</ul></div>`
                     : ""
                 }
               </div>`;
             })
             .join("")}
         </div>`
      : ""
  }

  ${
    includeUnique.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">O que está incluído</h2>
         <div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
           <ul>${includeUnique.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
         </div>`
      : ""
  }

  ${
    noIncludeItems.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">O que não está incluído</h2>
         <div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
           <ul>${noIncludeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
         </div>`
      : ""
  }

  ${
    infoItems.length > 0
      ? `<h2 style="color:#1d4ed8; font-size:16px; margin:0 0 6px 0;">Informações Importantes</h2>
         <div style="border:1px solid #d1d5db; padding:10px; margin-bottom:10px;">
           <ul>${infoItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
         </div>`
      : ""
  }

  ${
    textValue(settings.rodape_texto)
      ? `<div style="margin-top:12px; font-size:8px; color:#64748b;">
          ${parseLineItems(String(settings.rodape_texto || ""))
            .map((line) => `<div>${escapeHtml(line)}</div>`)
            .join("")}
        </div>`
      : ""
  }
</div>`;
}

function buildFileName(roteiro: RoteiroParaPdf) {
  const safeName = textValue(roteiro.nome || "roteiro")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  return `roteiro-${safeName || "roteiro"}.pdf`;
}

async function getBlobFromPdf(pdfDoc: { getBlob: (cb: (blob: Blob) => void) => void }) {
  return await new Promise<Blob>((resolve, reject) => {
    try {
      pdfDoc.getBlob((blob) => resolve(blob));
    } catch (error) {
      reject(error);
    }
  });
}

export async function exportRoteiroPdf(roteiro: RoteiroParaPdf, options: ExportRoteiroPdfOptions = {}) {
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
    const logoDataUrl = logoUrl ? await fetchImageDataUrl(logoUrl).catch(() => null) : null;

    const { pdfMake, htmlToPdfmake, defaultFont } = await loadPdfmakeDeps();
    const html = buildRoteiroHtml(roteiro, settings as QuotePdfSettings, logoDataUrl || null);
    const content = htmlToPdfmake(html, { window });

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [22, 20, 22, 28],
      defaultStyle: {
        font: defaultFont,
        fontSize: 10,
        color: "#0f172a",
        lineHeight: 1.2,
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

    const fileName = buildFileName(roteiro);
    const pdfDoc = pdfMake.createPdf(docDefinition);
    if (typeof window !== "undefined") {
      console.info("[Roteiro PDF] Renderer moderno ativo (pdfmake).");
    }

    if (action === "preview") {
      const blob = await getBlobFromPdf(pdfDoc);
      const url = URL.createObjectURL(blob);
      const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!previewWindow) {
        pdfDoc.download(fileName);
      }
      return;
    }

    pdfDoc.download(fileName);
  } catch (error) {
    // Fallback seguro para o gerador atual baseado em jsPDF.
    if (typeof window !== "undefined") {
      console.warn("[Roteiro PDF] Falha no renderer moderno; usando fallback legado (jsPDF).", error);
    }
    await exportRoteiroPdfLegacy(roteiro, options);
  }
}
