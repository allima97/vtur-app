import { isSeguroPasseioLike } from "./roteiroSeguro";

export type ImportedRoteiroPasseio = {
  cidade: string;
  passeio: string;
  fornecedor: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  ingressos: string;
  qtd_adultos: number;
  qtd_criancas: number;
  valor_original: number;
  valor_final: number;
  ordem: number;
};

const MONTH_INDEX: Record<string, number> = {
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

const SINGLE_DATE_RE = /^(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)(?:\s*\([^)]*\))?$/i;
const RANGE_DATE_RE =
  /^(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)\s*-\s*(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)(?:\s*\([^)]*\))?$/i;

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeLine(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseMoney(value?: string | null): number {
  const numeric = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractMoneyValues(line?: string | null): number[] {
  return Array.from(String(line || "").matchAll(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/gi))
    .map((match) => parseMoney(match[1]))
    .filter((value) => value > 0);
}

function parseDate(day: number, monthLabel: string, year: number) {
  const monthIndex = MONTH_INDEX[normalizeText(monthLabel)];
  if (monthIndex === undefined) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isDateLine(line: string) {
  return SINGLE_DATE_RE.test(line) || RANGE_DATE_RE.test(line);
}

function isServiceCodeLine(line: string) {
  return /^\d{5,}$/.test(normalizeLine(line));
}

function isRefundLine(line: string) {
  return normalizeText(line).includes("reembols");
}

function isOccupancyLine(line: string) {
  return /^total\s*\(/i.test(normalizeText(line));
}

function isIgnoredMetaLine(line: string) {
  const normalized = normalizeText(line);
  if (!normalized) return true;
  if (normalized === "selecionado") return true;
  if (normalized === "excluir") return true;
  if (normalized === "detalhes") return true;
  if (normalized === "recomendado") return true;
  if (/^-\d+%$/.test(normalized)) return true;
  return false;
}

function looksLikeCityLine(line: string) {
  const normalized = normalizeLine(line);
  if (!normalized) return false;
  if (isServiceCodeLine(normalized)) return false;
  if (isRefundLine(normalized)) return false;
  if (isOccupancyLine(normalized)) return false;
  if (extractMoneyValues(normalized).length > 0) return false;
  if (isIgnoredMetaLine(normalized)) return false;
  return normalized.includes(" - ");
}

function buildBlocks(text: string) {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (isDateLine(line) && current.length > 0) {
      blocks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(current);
  return blocks;
}

function parseOccupancy(line: string) {
  const normalized = normalizeText(line);
  const adultsMatch = normalized.match(/(\d+)\s*adult/);
  const childrenMatch = normalized.match(/(\d+)\s*crianc/);
  return {
    qtd_adultos: adultsMatch?.[1] ? Number(adultsMatch[1]) : 0,
    qtd_criancas: childrenMatch?.[1] ? Number(childrenMatch[1]) : 0,
  };
}

function parseBlockDates(line: string, referenceYear: number) {
  const singleMatch = line.match(SINGLE_DATE_RE);
  if (singleMatch) {
    const date = parseDate(Number(singleMatch[1]), singleMatch[2], referenceYear);
    if (!date) return null;
    const iso = toIsoDate(date);
    return { data_inicio: iso, data_fim: iso };
  }

  const rangeMatch = line.match(RANGE_DATE_RE);
  if (!rangeMatch) return null;
  const startDate = parseDate(Number(rangeMatch[1]), rangeMatch[2], referenceYear);
  let endDate = parseDate(Number(rangeMatch[3]), rangeMatch[4], referenceYear);
  if (!startDate || !endDate) return null;
  if (endDate.getTime() < startDate.getTime()) {
    endDate = parseDate(Number(rangeMatch[3]), rangeMatch[4], referenceYear + 1);
  }
  if (!endDate) return null;
  return { data_inicio: toIsoDate(startDate), data_fim: toIsoDate(endDate) };
}

function normalizeCity(line: string) {
  const raw = normalizeLine(line);
  const parts = raw
    .split("-")
    .map((part) => normalizeLine(part))
    .filter(Boolean);
  return parts[0] || raw;
}

function sortPasseios(list: ImportedRoteiroPasseio[]) {
  return list
    .slice()
    .sort((a, b) => {
      const dateCompare = String(a.data_inicio || "").localeCompare(String(b.data_inicio || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(a.passeio || "").localeCompare(String(b.passeio || ""));
    })
    .map((item, index) => ({ ...item, ordem: index }));
}

function parsePasseioBlock(block: string[], index: number, referenceYear: number): ImportedRoteiroPasseio | null {
  const [dateLine, ...restLines] = block;
  const dates = parseBlockDates(dateLine, referenceYear);
  if (!dates) return null;

  const usefulLines = restLines.filter(Boolean).filter((line) => !isIgnoredMetaLine(line));
  if (usefulLines.length === 0) return null;

  const hasCityLine = looksLikeCityLine(usefulLines[0] || "");
  const cidade = hasCityLine ? normalizeCity(usefulLines[0] || "") : "";
  const passeioRaw = normalizeLine(usefulLines[hasCityLine ? 1 : 0] || "");
  if (!passeioRaw) return null;

  let cursor = hasCityLine ? 2 : 1;
  let fornecedor = "";
  let qtd_adultos = 0;
  let qtd_criancas = 0;
  let valor_original = 0;
  let valor_final = 0;
  let sawDiscountLine = false;

  while (cursor < usefulLines.length) {
    const line = usefulLines[cursor];
    if (!line) {
      cursor += 1;
      continue;
    }

    if (!fornecedor && !isServiceCodeLine(line) && !isRefundLine(line) && !isOccupancyLine(line) && extractMoneyValues(line).length === 0) {
      fornecedor = line;
      cursor += 1;
      continue;
    }

    if (isServiceCodeLine(line) || isRefundLine(line)) {
      cursor += 1;
      continue;
    }

    if (isOccupancyLine(line)) {
      const occupancy = parseOccupancy(line);
      qtd_adultos = occupancy.qtd_adultos;
      qtd_criancas = occupancy.qtd_criancas;
      cursor += 1;
      continue;
    }

    const values = extractMoneyValues(line);
    if (values.length > 0) {
      const normalized = normalizeText(line);
      if (normalized.includes("de r$") && normalized.includes(" por")) {
        sawDiscountLine = true;
        valor_original = values[0] || 0;
        if (values.length > 1) valor_final = values[values.length - 1] || valor_final;
      } else if (sawDiscountLine) {
        valor_final = values[values.length - 1] || valor_final;
      } else {
        valor_final = values[values.length - 1] || valor_final;
      }
    }

    cursor += 1;
  }

  if (!valor_final && valor_original) valor_final = valor_original;
  const isSeguro =
    isSeguroPasseioLike({
      passeio: passeioRaw,
      fornecedor,
      cidade,
    }) || !cidade;
  const passeio = isSeguro && !normalizeText(passeioRaw).includes("seguro")
    ? `Seguro viagem ${passeioRaw}`
    : passeioRaw;

  return {
    cidade,
    passeio,
    fornecedor,
    data_inicio: dates.data_inicio,
    data_fim: dates.data_fim,
    tipo: isSeguro ? "Seguro Viagem" : "Serviço",
    ingressos: "",
    qtd_adultos,
    qtd_criancas,
    valor_original,
    valor_final,
    ordem: index,
  };
}

export function parseImportedRoteiroPasseios(text: string, referenceDate = new Date()) {
  const referenceYear = referenceDate.getFullYear();
  const parsed = buildBlocks(text)
    .map((block, index) => parsePasseioBlock(block, index, referenceYear))
    .filter((item): item is ImportedRoteiroPasseio => Boolean(item));

  return sortPasseios(parsed);
}

export function mergeImportedRoteiroPasseios(
  existing: ImportedRoteiroPasseio[],
  imported: ImportedRoteiroPasseio[]
) {
  const meaningfulExisting = (existing || []).filter((item) =>
    Boolean(
      String(item.cidade || "").trim() ||
        String(item.passeio || "").trim() ||
        String(item.fornecedor || "").trim() ||
        String(item.data_inicio || "").trim() ||
        String(item.data_fim || "").trim() ||
        Number(item.qtd_adultos || 0) > 0 ||
        Number(item.qtd_criancas || 0) > 0 ||
        Number(item.valor_original || 0) > 0 ||
        Number(item.valor_final || 0) > 0
    )
  );

  return sortPasseios([...(meaningfulExisting || []), ...(imported || [])]);
}
