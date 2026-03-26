import { getCardThemeLayout, type CardThemeStyle } from "./themeLayouts";

export type CardStyleSectionKey =
  | "title"
  | "clientName"
  | "body"
  | "footerLead"
  | "consultant"
  | "consultantRole";

export type CardStyleMap = Record<CardStyleSectionKey, CardThemeStyle>;

export type CardStyleBuckets = {
  title_style?: unknown;
  body_style?: unknown;
  signature_style?: unknown;
};

export const CARD_STYLE_SECTION_ORDER: CardStyleSectionKey[] = [
  "title",
  "clientName",
  "body",
  "footerLead",
  "consultant",
  "consultantRole",
];

export const CARD_STYLE_SECTION_LABELS: Record<CardStyleSectionKey, string> = {
  title: "Título",
  clientName: "Nome do cliente",
  body: "Mensagem",
  footerLead: "Linha 'Com carinho'",
  consultant: "Nome do consultor",
  consultantRole: "Cargo do consultor",
};

export const CARD_FONT_OPTIONS = [
  { label: "Cormorant Garamond", value: "Cormorant Garamond, Georgia, serif" },
  { label: "Playfair Display", value: "Playfair Display, Georgia, serif" },
  { label: "DM Serif Display", value: "DM Serif Display, Georgia, serif" },
  { label: "Lora", value: "Lora, Georgia, serif" },
  { label: "Alegreya Sans", value: "Alegreya Sans, Arial, sans-serif" },
  { label: "Nunito Sans", value: "Nunito Sans, Arial, sans-serif" },
  { label: "Parisienne", value: "Parisienne, cursive" },
  { label: "Great Vibes", value: "Great Vibes, cursive" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
] as const;

export const CARD_ALIGN_OPTIONS = [
  { label: "Esquerda", value: "left" },
  { label: "Centro", value: "center" },
  { label: "Direita", value: "right" },
  { label: "Justificado", value: "justify" },
] as const;

export const CARD_WEIGHT_OPTIONS = [
  { label: "400", value: "400" },
  { label: "500", value: "500" },
  { label: "600", value: "600" },
  { label: "700", value: "700" },
] as const;

const MASTER_SECTION_STYLES: CardStyleMap = {
  title: {
    x: 540,
    y: 236,
    maxWidth: 760,
    fontSize: 82,
    fontWeight: 700,
    color: "#1B4F9A",
    fontFamily: "Cormorant Garamond, Georgia, serif",
    align: "center",
    lineHeight: 1.02,
  },
  clientName: {
    x: 226,
    y: 328,
    maxWidth: 628,
    fontSize: 54,
    fontWeight: 700,
    color: "#265F9A",
    fontFamily: "Cormorant Garamond, Georgia, serif",
    align: "left",
    lineHeight: 1.04,
  },
  body: {
    x: 540,
    y: 432,
    maxWidth: 664,
    fontSize: 42,
    fontWeight: 500,
    color: "#101828",
    fontFamily: "Alegreya Sans, Arial, sans-serif",
    align: "center",
    lineHeight: 1.18,
  },
  footerLead: {
    x: 414,
    y: 806,
    maxWidth: 380,
    fontSize: 36,
    fontWeight: 500,
    color: "#1E293B",
    fontFamily: "Alegreya Sans, Arial, sans-serif",
    align: "center",
    lineHeight: 1.06,
    italic: false,
  },
  consultant: {
    x: 414,
    y: 854,
    maxWidth: 380,
    fontSize: 42,
    fontWeight: 700,
    color: "#0F172A",
    fontFamily: "Alegreya Sans, Arial, sans-serif",
    align: "center",
    lineHeight: 1.05,
    italic: false,
  },
  consultantRole: {
    x: 414,
    y: 900,
    maxWidth: 380,
    fontSize: 30,
    fontWeight: 500,
    color: "#334155",
    fontFamily: "Alegreya Sans, Arial, sans-serif",
    align: "center",
    lineHeight: 1.06,
    italic: false,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeStyle(input: unknown): CardThemeStyle {
  if (!isPlainObject(input)) return {};
  const raw = input as Record<string, unknown>;
  const style: CardThemeStyle = {};
  if (Number.isFinite(Number(raw.x))) style.x = Number(raw.x);
  if (Number.isFinite(Number(raw.y))) style.y = Number(raw.y);
  if (Number.isFinite(Number(raw.maxWidth))) style.maxWidth = Number(raw.maxWidth);
  if (Number.isFinite(Number(raw.width))) style.width = Number(raw.width);
  if (Number.isFinite(Number(raw.fontSize))) style.fontSize = Number(raw.fontSize);
  if (raw.fontWeight !== undefined && raw.fontWeight !== null && String(raw.fontWeight).trim()) style.fontWeight = String(raw.fontWeight).trim();
  if (typeof raw.color === "string" && raw.color.trim()) style.color = raw.color.trim();
  if (typeof raw.fontFamily === "string" && raw.fontFamily.trim()) style.fontFamily = raw.fontFamily.trim();
  if (raw.align === "left" || raw.align === "center" || raw.align === "right" || raw.align === "justify") {
    style.align = raw.align;
  }
  if (
    raw.textAlign === "left" ||
    raw.textAlign === "center" ||
    raw.textAlign === "right" ||
    raw.textAlign === "justify"
  ) {
    style.textAlign = raw.textAlign;
  }
  if (Number.isFinite(Number(raw.lineHeight))) style.lineHeight = Number(raw.lineHeight);
  if (typeof raw.italic === "boolean") style.italic = raw.italic;
  if (raw.fontStyle === "normal" || raw.fontStyle === "italic") style.fontStyle = raw.fontStyle;
  return style;
}

function sanitizeLockedStyle(input: unknown): CardThemeStyle {
  const style = sanitizeStyle(input);
  delete style.x;
  delete style.y;
  delete style.maxWidth;
  delete style.width;
  return style;
}

function extractSectionStyle(bucket: unknown, section: CardStyleSectionKey): CardThemeStyle {
  if (!isPlainObject(bucket)) return {};
  const nested = bucket[section];
  if (isPlainObject(nested)) return sanitizeStyle(nested);
  const hasNestedSections = CARD_STYLE_SECTION_ORDER.some((key) => isPlainObject(bucket[key]));
  if (!hasNestedSections) return sanitizeStyle(bucket);
  return {};
}

export function createDefaultCardStyleMap(): CardStyleMap {
  const next = {} as CardStyleMap;
  for (const section of CARD_STYLE_SECTION_ORDER) {
    next[section] = { ...MASTER_SECTION_STYLES[section] };
  }
  return next;
}

export function extractStoredCardStyleMap(buckets?: CardStyleBuckets | null): Partial<CardStyleMap> {
  return {
    title: extractSectionStyle(buckets?.title_style, "title"),
    clientName: extractSectionStyle(buckets?.title_style, "clientName"),
    body: extractSectionStyle(buckets?.body_style, "body"),
    footerLead: extractSectionStyle(buckets?.signature_style, "footerLead"),
    consultant: extractSectionStyle(buckets?.signature_style, "consultant"),
    consultantRole: extractSectionStyle(buckets?.signature_style, "consultantRole"),
  };
}

export function resolveCardStyleMap(params?: {
  themeName?: string | null;
  themeBuckets?: CardStyleBuckets | null;
  templateBuckets?: CardStyleBuckets | null;
  overrideMap?: Partial<CardStyleMap> | null;
}): CardStyleMap {
  const result = createDefaultCardStyleMap();
  const layout = getCardThemeLayout(params?.themeName);

  if (layout) {
    if (layout.title) result.title = { ...result.title, ...sanitizeLockedStyle(layout.title) };
    if (layout.clientName) result.clientName = { ...result.clientName, ...sanitizeLockedStyle(layout.clientName) };
    if (layout.body) result.body = { ...result.body, ...sanitizeLockedStyle(layout.body) };
    if (layout.footerLead) result.footerLead = { ...result.footerLead, ...sanitizeLockedStyle(layout.footerLead) };
    if (layout.consultant) result.consultant = { ...result.consultant, ...sanitizeLockedStyle(layout.consultant) };
    if (layout.consultantRole) result.consultantRole = { ...result.consultantRole, ...sanitizeLockedStyle(layout.consultantRole) };
  }

  const themeMap = extractStoredCardStyleMap(params?.themeBuckets);
  const templateMap = extractStoredCardStyleMap(params?.templateBuckets);

  for (const section of CARD_STYLE_SECTION_ORDER) {
    result[section] = {
      ...result[section],
      ...sanitizeLockedStyle(themeMap[section]),
      ...sanitizeLockedStyle(templateMap[section]),
      ...sanitizeLockedStyle(params?.overrideMap?.[section]),
    };
  }

  return result;
}

export function serializeCardStyleMap(styleMap?: Partial<CardStyleMap> | null) {
  return {
    title_style: {
      title: sanitizeStyle(styleMap?.title),
      clientName: sanitizeStyle(styleMap?.clientName),
    },
    body_style: {
      body: sanitizeStyle(styleMap?.body),
    },
    signature_style: {
      footerLead: sanitizeStyle(styleMap?.footerLead),
      consultant: sanitizeStyle(styleMap?.consultant),
      consultantRole: sanitizeStyle(styleMap?.consultantRole),
    },
  };
}

export function parseCardStyleOverrideParam(raw?: string | null): Partial<CardStyleMap> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const next: Partial<CardStyleMap> = {};
    for (const section of CARD_STYLE_SECTION_ORDER) {
      next[section] = sanitizeStyle(parsed[section]);
    }
    return next;
  } catch {
    return null;
  }
}
