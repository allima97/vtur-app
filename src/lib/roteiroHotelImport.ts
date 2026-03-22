export type ImportedRoteiroHotel = {
  cidade: string;
  hotel: string;
  endereco: string;
  data_inicio: string;
  data_fim: string;
  noites: number;
  qtd_apto: number;
  apto: string;
  categoria: string;
  regime: string;
  tipo_tarifa: string;
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

const DATE_RANGE_RE =
  /^(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)\s*-\s*(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)(?:\s*\((\d+)\s*dias?(?:\s*e\s*(\d+)\s*noites?)?\))?$/i;

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

export function normalizeImportedHotelRegime(value?: string | null) {
  const raw = normalizeLine(value);
  const normalized = normalizeText(raw);
  if (!normalized) return "";
  if (normalized.includes("cafe da manha")) return "Café da Manhã";
  if (normalized.includes("meia pensao")) return "Meia Pensão";
  if (normalized.includes("pensao completa")) return "Pensão Completa";
  if (normalized.includes("all inclusive")) return "All Inclusive";
  if (normalized.includes("sem refeicao")) return "Sem Refeição";
  return raw;
}

export function normalizeImportedHotelTarifa(value?: string | null) {
  const raw = normalizeLine(value);
  const normalized = normalizeText(raw);
  if (!normalized) return "";
  if (normalized.includes("nao reembols") || normalized.includes("não reembols")) return "Não Reembolsável";
  if (normalized.includes("reembols")) return "Reembolsável";
  return raw;
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

function diffNights(start: Date | null, end: Date | null) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function isRecommendedLine(line: string) {
  const normalized = normalizeText(line);
  return normalized === "recomendado";
}

function isRoomLine(line: string) {
  return /^\d+\s+\S+/i.test(normalizeLine(line));
}

function isOccupancyLine(line: string) {
  return /^total\s*\(/i.test(normalizeText(line));
}

function isRefundLine(line: string) {
  const normalized = normalizeText(line);
  return normalized.includes("reembols");
}

function isAddressLine(line: string) {
  const normalized = normalizeLine(line);
  if (!normalized) return false;
  return /,/.test(normalized) || /\d/.test(normalized);
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
    if (DATE_RANGE_RE.test(line) && current.length > 0) {
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

function sortHotels(list: ImportedRoteiroHotel[]) {
  return list
    .slice()
    .sort((a, b) => {
      const dateCompare = String(a.data_inicio || "").localeCompare(String(b.data_inicio || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(a.hotel || "").localeCompare(String(b.hotel || ""));
    })
    .map((hotel, index) => ({ ...hotel, ordem: index }));
}

function parseHotelBlock(block: string[], index: number, referenceYear: number): ImportedRoteiroHotel | null {
  const [periodLine, ...restLines] = block;
  const periodMatch = periodLine.match(DATE_RANGE_RE);
  if (!periodMatch) return null;

  const startDay = Number(periodMatch[1]);
  const startMonth = periodMatch[2];
  const endDay = Number(periodMatch[3]);
  const endMonth = periodMatch[4];

  let startDate = parseDate(startDay, startMonth, referenceYear);
  let endDate = parseDate(endDay, endMonth, referenceYear);
  if (!startDate || !endDate) return null;
  if (endDate.getTime() < startDate.getTime()) {
    endDate = parseDate(endDay, endMonth, referenceYear + 1);
  }

  const noitesFromText = periodMatch[6] ? Number(periodMatch[6]) : 0;
  const usefulLines = restLines.filter((line) => !isRecommendedLine(line));
  if (usefulLines.length === 0) return null;

  const destinationLine = usefulLines[0] || "";
  const cidade = normalizeLine(destinationLine.split(/\s+-\s+/)[0] || destinationLine);

  let cursor = 1;
  const hotel = usefulLines[cursor] || "";
  if (!hotel) return null;
  cursor += 1;

  while (cursor < usefulLines.length && normalizeText(usefulLines[cursor]) === normalizeText(hotel)) {
    cursor += 1;
  }

  let endereco = "";
  if (cursor < usefulLines.length && isAddressLine(usefulLines[cursor])) {
    endereco = usefulLines[cursor];
    cursor += 1;
  }

  let qtd_apto = 0;
  let apto = "";
  const roomLine = usefulLines.find((line, idx) => idx >= cursor && isRoomLine(line)) || "";
  if (roomLine) {
    const roomMatch = roomLine.match(/^(\d+)\s+(.+)$/);
    qtd_apto = roomMatch?.[1] ? Number(roomMatch[1]) : 0;
    apto = normalizeLine(roomMatch?.[2] || roomLine);
    cursor = usefulLines.indexOf(roomLine, cursor) + 1;
  }

  let regime = "";
  if (cursor < usefulLines.length && !isRefundLine(usefulLines[cursor]) && !isOccupancyLine(usefulLines[cursor])) {
    regime = usefulLines[cursor];
    cursor += 1;
  }

  let tipo_tarifa = "";
  if (cursor < usefulLines.length && isRefundLine(usefulLines[cursor])) {
    tipo_tarifa = usefulLines[cursor];
    cursor += 1;
  } else {
    const refundLine = usefulLines.find((line, idx) => idx >= cursor && isRefundLine(line));
    if (refundLine) {
      tipo_tarifa = refundLine;
      cursor = usefulLines.indexOf(refundLine, cursor) + 1;
    }
  }

  let qtd_adultos = 0;
  let qtd_criancas = 0;
  const occupancyLine = usefulLines.find((line, idx) => idx >= cursor && isOccupancyLine(line));
  if (occupancyLine) {
    const occupancy = parseOccupancy(occupancyLine);
    qtd_adultos = occupancy.qtd_adultos;
    qtd_criancas = occupancy.qtd_criancas;
    cursor = usefulLines.indexOf(occupancyLine, cursor) + 1;
  }

  const monetaryLines = usefulLines.slice(cursor);
  let valor_original = 0;
  let valor_final = 0;
  let sawDiscountLine = false;

  for (const line of monetaryLines) {
    const values = extractMoneyValues(line);
    if (values.length === 0) continue;
    const normalized = normalizeText(line);
    if (normalized.includes("de r$") && normalized.includes(" por")) {
      sawDiscountLine = true;
      valor_original = values[0] || 0;
      if (values.length > 1) valor_final = values[values.length - 1] || valor_final;
      continue;
    }

    if (sawDiscountLine) {
      valor_final = values[values.length - 1] || valor_final;
      continue;
    }

    valor_final = values[values.length - 1] || valor_final;
  }

  if (!valor_final && valor_original) valor_final = valor_original;

  const noites = noitesFromText || diffNights(startDate, endDate);

  return {
    cidade,
    hotel: normalizeLine(hotel),
    endereco,
    data_inicio: toIsoDate(startDate),
    data_fim: toIsoDate(endDate),
    noites,
    qtd_apto,
    apto,
    categoria: "",
    regime: normalizeImportedHotelRegime(regime),
    tipo_tarifa: normalizeImportedHotelTarifa(tipo_tarifa),
    qtd_adultos,
    qtd_criancas,
    valor_original,
    valor_final,
    ordem: index,
  };
}

export function parseImportedRoteiroHotels(text: string, referenceDate = new Date()) {
  const referenceYear = referenceDate.getFullYear();
  const parsed = buildBlocks(text)
    .map((block, index) => parseHotelBlock(block, index, referenceYear))
    .filter((item): item is ImportedRoteiroHotel => Boolean(item));

  return sortHotels(parsed);
}

export function mergeImportedRoteiroHotels(
  existing: ImportedRoteiroHotel[],
  imported: ImportedRoteiroHotel[]
) {
  const meaningfulExisting = (existing || []).filter((hotel) =>
    Boolean(
      String(hotel.cidade || "").trim() ||
        String(hotel.hotel || "").trim() ||
        String(hotel.data_inicio || "").trim() ||
        String(hotel.data_fim || "").trim() ||
        String(hotel.endereco || "").trim() ||
        String(hotel.apto || "").trim() ||
        Number(hotel.valor_final || 0) > 0
    )
  );

  return sortHotels([...(meaningfulExisting || []), ...(imported || [])]);
}
