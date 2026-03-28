const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const STORAGE_KEY = "vtur:app-timezone";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getSupportedTimeZones() {
  try {
    const values = (Intl as any).supportedValuesOf?.("timeZone");
    return Array.isArray(values) ? values : null;
  } catch {
    return null;
  }
}

export function isValidTimeZone(value?: string | null) {
  const tz = String(value || "").trim();
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getStoredTimeZone() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isValidTimeZone(value) ? String(value) : null;
  } catch {
    return null;
  }
}

function getBrowserTimeZone() {
  if (typeof window === "undefined") return null;
  try {
    const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(value) ? value : null;
  } catch {
    return null;
  }
}

function getEnvTimeZone() {
  try {
    const processLike = (globalThis as any)?.process;
    const env = processLike?.env || null;
    const value = env?.APP_TIME_ZONE || env?.TZ || null;
    return isValidTimeZone(value) ? String(value) : null;
  } catch {
    return null;
  }
}

export function resolveAppTimeZone(preferred?: string | null) {
  if (isValidTimeZone(preferred)) return String(preferred);
  const stored = getStoredTimeZone();
  if (stored) return stored;
  const browser = getBrowserTimeZone();
  if (browser) return browser;
  const env = getEnvTimeZone();
  if (env) return env;
  return DEFAULT_TIME_ZONE;
}

export function setAppTimeZone(timeZone: string) {
  const tz = String(timeZone || "").trim();
  if (!isValidTimeZone(tz)) return false;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, tz);
    } catch {
      // ignore
    }
  }
  return true;
}

function getDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = new Map<string, string>();
  parts.forEach((part) => {
    if (part.type !== "literal") map.set(part.type, part.value);
  });
  const year = map.get("year");
  const month = map.get("month");
  const day = map.get("day");
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function getDateTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = new Map<string, string>();
  parts.forEach((part) => {
    if (part.type !== "literal") map.set(part.type, part.value);
  });
  const year = map.get("year");
  const month = map.get("month");
  const day = map.get("day");
  const hour = map.get("hour");
  const minute = map.get("minute");
  const second = map.get("second");
  if (!year || !month || !day || !hour || !minute || !second) return null;
  return { year, month, day, hour, minute, second };
}

export function toISODateInTimeZone(date: Date, preferredTimeZone?: string | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const timeZone = resolveAppTimeZone(preferredTimeZone);
  const parts = getDateParts(date, timeZone);
  if (!parts) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function toISODateLocal(date: Date) {
  return toISODateInTimeZone(date);
}

export function toISODateTimeInTimeZone(date: Date, preferredTimeZone?: string | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const timeZone = resolveAppTimeZone(preferredTimeZone);
  const parts = getDateTimeParts(date, timeZone);
  if (!parts) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
      date.getHours()
    )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseDateValue(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00`);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDatePtBrInTimeZone(
  value?: string | Date | null,
  fallback = "-",
  preferredTimeZone?: string | null
) {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  const iso = toISODateInTimeZone(parsed, preferredTimeZone);
  if (!iso) return fallback;
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return fallback;
  return `${day}/${month}/${year}`;
}

export function formatDateTimePtBrInTimeZone(
  value?: string | Date | null,
  fallback = "-",
  preferredTimeZone?: string | null
) {
  if (!value) return fallback;
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  const timeZone = resolveAppTimeZone(preferredTimeZone);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function guessTimeZoneFromCity(city?: string | null) {
  const input = String(city || "").trim();
  if (!input) return null;
  const supported = getSupportedTimeZones();
  if (!supported?.length) return null;
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return null;
  const matches = supported.filter((tz) => tz.toLowerCase().endsWith(`/${normalized}`));
  if (matches.length === 1) return matches[0];
  return null;
}
