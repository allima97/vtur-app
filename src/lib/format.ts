export function formatNumberBR(
  value: number | string | null | undefined,
  decimals = 2
): string {
  if (value == null || value === "") return "-";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "-";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimals <= 0) return `${sign}${withSep}`;
  return `${sign}${withSep},${decPart ?? "00"}`;
}

export function formatCurrencyBRL(value: number | string | null | undefined): string {
  const formatted = formatNumberBR(value, 2);
  if (formatted === "-") return formatted;
  return `R$ ${formatted}`;
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency: string | null | undefined = "BRL"
): string {
  const code = (currency || "BRL").toUpperCase();
  if (code === "BRL") return formatCurrencyBRL(value);
  const formatted = formatNumberBR(value, 2);
  if (formatted === "-") return formatted;
  return `${code} ${formatted}`;
}

export function formatDateBR(value?: string | Date | null): string {
  if (!value) return "-";
  if (value instanceof Date) {
    return formatDateBR(value.toISOString());
  }
  const raw = String(value).trim();
  if (!raw) return "-";
  const datePart = raw.includes("T")
    ? raw.split("T")[0]
    : raw.includes(" ")
    ? raw.split(" ")[0]
    : raw;
  if (datePart.includes("/")) return datePart;
  const parts = datePart.split("-");
  if (parts.length !== 3) return datePart;
  const [year, month, day] = parts;
  if (!year || !month || !day) return datePart;
  return `${day}/${month}/${year}`;
}

export function formatDateTimeBR(value?: string | Date | null): string {
  if (!value) return "-";
  if (value instanceof Date) {
    return formatDateTimeBR(value.toISOString());
  }
  const raw = String(value).trim();
  if (!raw) return "-";
  const sep = raw.includes("T") ? "T" : raw.includes(" ") ? " " : null;
  if (!sep) return formatDateBR(raw);
  const [datePart, timePartRaw] = raw.split(sep);
  const date = formatDateBR(datePart);
  if (!timePartRaw) return date;
  const timeMatch = timePartRaw.match(/(\d{2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : timePartRaw;
  return `${date} ${time}`;
}

export function formatMonthYearBR(value?: string | Date | null, fallback = "-"): string {
  if (!value) return fallback;

  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!raw) return fallback;

  const datePart = raw.includes("T") ? raw.split("T")[0] : raw.includes(" ") ? raw.split(" ")[0] : raw;
  const m = datePart.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!m) return datePart;

  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return datePart;

  const ref = new Date(year, month - 1, 1);
  const mesExtenso = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(ref);
  const mesLabel = mesExtenso ? mesExtenso.charAt(0).toUpperCase() + mesExtenso.slice(1) : m[2];
  const ano2 = String(year).slice(-2);
  return `${mesLabel}-${ano2}`;
}

export function buildMonthOptionsYYYYMM(
  {
    base = new Date(),
    yearsBack = 5,
    yearsForward = 1,
    order = "desc",
  }: {
    base?: Date;
    yearsBack?: number;
    yearsForward?: number;
    order?: "desc" | "asc";
  } = {}
): string[] {
  const baseIndex = base.getFullYear() * 12 + base.getMonth();
  const startIndex = baseIndex - yearsBack * 12;
  const endIndex = baseIndex + yearsForward * 12;

  const result: string[] = [];

  function pushIndex(idx: number) {
    const year = Math.floor(idx / 12);
    const month0 = idx % 12;
    result.push(`${year}-${String(month0 + 1).padStart(2, "0")}`);
  }

  if (order === "asc") {
    for (let idx = startIndex; idx <= endIndex; idx += 1) pushIndex(idx);
  } else {
    for (let idx = endIndex; idx >= startIndex; idx -= 1) pushIndex(idx);
  }

  return result;
}
