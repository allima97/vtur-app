export type PdfTableOptions = {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number | null)[][];
  fileName?: string;
  orientation?: "portrait" | "landscape";
};

import nunitoSansBoldUrl from "../assets/cards/fonts/NunitoSans-Bold.ttf?url";
import nunitoSansRegularUrl from "../assets/cards/fonts/NunitoSans-Regular.ttf?url";
import nunitoSansSemiBoldUrl from "../assets/cards/fonts/NunitoSans-SemiBold.ttf?url";

type PdfMakeLike = {
  vfs?: Record<string, string>;
  fonts?: Record<string, any>;
  createPdf: (docDefinition: any) => {
    download: (fileName?: string) => void;
  };
};

type PdfModernDeps = {
  pdfMake: PdfMakeLike;
  defaultFont: string;
};

type PdfLegacyDeps = {
  jsPDF: (typeof import("jspdf"))["jsPDF"];
  autoTable: typeof import("jspdf-autotable") extends { default: infer T } ? T : any;
};

const NUNITO_REGULAR_FILE = "NunitoSans-Regular.ttf";
const NUNITO_SEMIBOLD_FILE = "NunitoSans-SemiBold.ttf";
const NUNITO_BOLD_FILE = "NunitoSans-Bold.ttf";

let pdfModernDepsPromise: Promise<PdfModernDeps> | null = null;
let pdfLegacyDepsPromise: Promise<PdfLegacyDeps> | null = null;

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

function loadPdfModernDeps(): Promise<PdfModernDeps> {
  if (!pdfModernDepsPromise) {
    pdfModernDepsPromise = Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
    ]).then(async ([pdfmakeMod, vfsFontsMod]) => {
      const pdfMake = ((pdfmakeMod as any).default || pdfmakeMod) as PdfMakeLike;
      const vfsFonts = (vfsFontsMod as any).default || vfsFontsMod;

      if (vfsFonts?.pdfMake?.vfs) {
        pdfMake.vfs = vfsFonts.pdfMake.vfs;
      } else if (vfsFonts?.vfs) {
        pdfMake.vfs = vfsFonts.vfs;
      }

      pdfMake.fonts = {
        ...(pdfMake.fonts || {}),
        Roboto: {
          normal: "Roboto-Regular.ttf",
          bold: "Roboto-Medium.ttf",
          italics: "Roboto-Italic.ttf",
          bolditalics: "Roboto-MediumItalic.ttf",
        },
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

      return { pdfMake, defaultFont };
    });
  }
  return pdfModernDepsPromise;
}

function loadPdfLegacyDeps(): Promise<PdfLegacyDeps> {
  if (!pdfLegacyDepsPromise) {
    pdfLegacyDepsPromise = Promise.all([import("jspdf"), import("jspdf-autotable")]).then(
      ([jspdfModule, autoTableModule]) => ({
        jsPDF: jspdfModule.jsPDF,
        autoTable: (autoTableModule as any).default ?? autoTableModule,
      })
    );
  }
  return pdfLegacyDepsPromise;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "relatorio"
  );
}

type ColumnAlign = "left" | "center" | "right";

function normalizeLookup(value?: string | null) {
  return String(value || "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isDateLike(value?: string | null) {
  const v = String(value || "").trim();
  if (!v) return false;
  return /^\d{2}\/\d{2}\/\d{4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isNumericLike(value?: string | null) {
  const v = String(value || "")
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/%$/, "");
  if (!v) return false;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return /^-?\d+(\.\d+)?$/.test(v);
}

function estimateCellWidthScore(value?: string | number | null) {
  const text = String(value ?? "").trim();
  if (!text) return 6;
  const length = text.length;
  if (isDateLike(text)) return 10;
  if (isNumericLike(text)) return Math.min(Math.max(length, 8), 14);
  return Math.min(Math.max(length, 8), 42);
}

function resolveColumnAlignments(headers: string[], rows: (string | number | null)[][]): ColumnAlign[] {
  const rightHeaderHints = [
    "valor",
    "total",
    "taxa",
    "faturamento",
    "ticket",
    "preco",
    "liquido",
    "comissao",
    "qtd",
    "qtde",
    "quantidade",
    "pax",
  ];
  const centerHeaderHints = ["data", "cpf", "status", "prazo", "recibo", "numero", "nº"];

  return headers.map((header, colIndex) => {
    const headerNorm = normalizeLookup(header);
    if (rightHeaderHints.some((hint) => headerNorm.includes(hint))) return "right";
    if (centerHeaderHints.some((hint) => headerNorm.includes(hint))) return "center";

    const sampleSize = Math.min(rows.length, 120);
    let numericCount = 0;
    let dateCount = 0;
    for (let rowIndex = 0; rowIndex < sampleSize; rowIndex += 1) {
      const value = String(rows[rowIndex]?.[colIndex] ?? "").trim();
      if (!value) continue;
      if (isDateLike(value)) {
        dateCount += 1;
        continue;
      }
      if (isNumericLike(value)) {
        numericCount += 1;
      }
    }
    if (dateCount >= Math.max(2, Math.round(sampleSize * 0.35))) return "center";
    if (numericCount >= Math.max(2, Math.round(sampleSize * 0.5))) return "right";
    return "left";
  });
}

function resolveTableWidths(headers: string[], rows: (string | number | null)[][], aligns: ColumnAlign[]) {
  const sampleSize = Math.min(rows.length, 150);
  const scores = headers.map((header, colIndex) => {
    let maxScore = estimateCellWidthScore(header);
    for (let rowIndex = 0; rowIndex < sampleSize; rowIndex += 1) {
      const score = estimateCellWidthScore(rows[rowIndex]?.[colIndex]);
      if (score > maxScore) maxScore = score;
    }
    const align = aligns[colIndex];
    if (align === "right") maxScore = Math.min(Math.max(maxScore * 0.78, 7), 14);
    if (align === "center") maxScore = Math.min(Math.max(maxScore * 0.9, 8), 16);
    const clamped = Math.min(Math.max(maxScore, 7), 36);
    const weight = Number((clamped / 10).toFixed(2));
    return Math.min(Math.max(weight, 0.75), 3.6);
  });
  return scores.map((score) => `${score}*`);
}

async function exportTableToPdfLegacy(options: PdfTableOptions) {
  const {
    title,
    subtitle,
    headers,
    rows,
    fileName,
    orientation = "portrait",
  } = options;
  const { jsPDF, autoTable } = await loadPdfLegacyDeps();
  const doc = new jsPDF({ orientation, unit: "pt" });
  const margin = 40;
  const lineHeight = 14;

  doc.setFontSize(14);
  doc.text(title, margin, margin);
  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, margin, margin + lineHeight);
  }

  autoTable(doc, {
    startY: margin + (subtitle ? lineHeight * 2 : lineHeight),
    head: [headers],
    body: rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))),
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, valign: "middle" },
    headStyles: { fillColor: "#ede9fe", textColor: "#1e1b4b", fontStyle: "bold" },
  });

  const timestamp = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
  const safeBase = fileName ? fileName.replace(/\.pdf$/i, "") : slugify(title);
  doc.save(`${safeBase}-${timestamp}.pdf`);
}

export async function exportTableToPDF(options: PdfTableOptions) {
  try {
    const {
      title,
      subtitle,
      headers,
      rows,
      fileName,
      orientation = "portrait",
    } = options;
    const { pdfMake, defaultFont } = await loadPdfModernDeps();
    const alignments = resolveColumnAlignments(headers, rows);
    const widths = resolveTableWidths(headers, rows, alignments);

    const tableBody = [
      headers.map((header, colIndex) => ({
        text: String(header || ""),
        style: "tableHeader",
        alignment: alignments[colIndex],
        noWrap: true,
      })),
      ...rows.map((row) =>
        row.map((cell, colIndex) => {
          const text = cell === null || cell === undefined ? "" : String(cell);
          const align = alignments[colIndex];
          return {
            text,
            style: "tableBody",
            alignment: align,
            noWrap: align !== "left" || isDateLike(text),
          };
        })
      ),
    ];

    const docDefinition = {
      pageSize: "A4",
      pageOrientation: orientation,
      pageMargins: [24, 22, 24, 28],
      defaultStyle: {
        font: defaultFont,
        fontSize: 9,
        color: "#0f172a",
        lineHeight: 1.22,
      },
      content: [
        { text: title, style: "title" },
        ...(subtitle ? [{ text: subtitle, style: "subtitle" }] : []),
        {
          margin: [0, subtitle ? 12 : 14, 0, 0],
          table: {
            headerRows: 1,
            dontBreakRows: true,
            keepWithHeaderRows: 1,
            widths,
            body: tableBody,
          },
          layout: {
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
            hLineColor: () => "#d1d5db",
            vLineColor: () => "#d1d5db",
            fillColor: (rowIndex: number) => {
              if (rowIndex === 0) return "#e0e7ff";
              return rowIndex % 2 === 0 ? "#f8fafc" : "#ffffff";
            },
            paddingLeft: () => 7,
            paddingRight: () => 7,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
        },
      ],
      styles: {
        title: {
          fontSize: 15,
          bold: true,
          color: "#1d4ed8",
        },
        subtitle: {
          margin: [0, 5, 0, 0],
          fontSize: 10,
          color: "#475569",
        },
        tableHeader: {
          bold: true,
          fontSize: 9.5,
          color: "#1e3a8a",
        },
        tableBody: {
          fontSize: 9,
          color: "#0f172a",
        },
      },
      footer: (currentPage: number, pageCount: number) => ({
        text: `Pagina ${currentPage} de ${pageCount}`,
        alignment: "center",
        color: "#64748b",
        fontSize: 8,
        margin: [0, 6, 0, 0],
      }),
    };

    const timestamp = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
    const safeBase = fileName ? fileName.replace(/\.pdf$/i, "") : slugify(title);
    if (typeof window !== "undefined") {
      console.info("[Table PDF] Renderer moderno ativo (pdfmake).");
    }
    pdfMake.createPdf(docDefinition).download(`${safeBase}-${timestamp}.pdf`);
  } catch {
    if (typeof window !== "undefined") {
      console.warn("[Table PDF] Falha no renderer moderno; usando fallback legado (jsPDF).");
    }
    await exportTableToPdfLegacy(options);
  }
}
