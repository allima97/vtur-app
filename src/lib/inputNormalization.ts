import { formatNumberBR } from "./format";

export function selectAllInputOnFocus(e: { currentTarget: { select?: () => void } }) {
  try {
    e.currentTarget.select?.();
  } catch {
    // noop
  }
}

export function boundDateEndISO(startISO: string, endISO: string): string {
  if (!startISO || !endISO) return endISO;
  return endISO < startISO ? startISO : endISO;
}

export function sanitizeMoneyInput(
  raw: string,
  { allowNegative = false }: { allowNegative?: boolean } = {}
): string {
  const str = String(raw ?? "");
  let cleaned = str.replace(/[^0-9,.-]/g, "");

  if (allowNegative) {
    cleaned = cleaned.replace(/(?!^)-/g, "");
  } else {
    cleaned = cleaned.replace(/-/g, "");
  }

  // Keep only the first comma (pt-BR decimal)
  const commaParts = cleaned.split(",");
  if (commaParts.length > 2) {
    cleaned = `${commaParts[0]},${commaParts.slice(1).join("")}`;
  }

  return cleaned;
}

export function parseMoneyPtBR(raw: string): number | null {
  const cleaned = sanitizeMoneyInput(raw, { allowNegative: true }).trim();
  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  let normalized = cleaned;

  if (hasComma) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    // If user typed multiple dots, treat all but last as thousand separators.
    const dotParts = normalized.split(".");
    if (dotParts.length > 2) {
      normalized = `${dotParts.slice(0, -1).join("")}.${dotParts.at(-1)}`;
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function formatMoneyForInput(
  value: number | string | null | undefined,
  decimals = 2
): string {
  if (value == null || value === "") return "";
  const formatted = formatNumberBR(value, decimals);
  return formatted === "-" ? "" : formatted;
}

export function normalizeMoneyInput(
  raw: string,
  {
    decimals = 2,
    emptyAsZero = false,
    allowNegative = false,
  }: { decimals?: number; emptyAsZero?: boolean; allowNegative?: boolean } = {}
): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return emptyAsZero ? formatNumberBR(0, decimals) : "";

  const parsed = parseMoneyPtBR(trimmed);
  if (parsed == null) return emptyAsZero ? formatNumberBR(0, decimals) : "";

  const bounded = allowNegative ? parsed : Math.max(0, parsed);
  const formatted = formatNumberBR(bounded, decimals);
  return formatted === "-" ? (emptyAsZero ? formatNumberBR(0, decimals) : "") : formatted;
}
