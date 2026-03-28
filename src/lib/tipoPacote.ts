import { normalizeText } from "./normalizeText";

export function cleanTipoPacoteForRule(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let cleaned = raw;
  while (/\s*\([^()]*\)\s*$/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\([^()]*\)\s*$/, "").trim();
  }

  return cleaned || raw;
}

export function normalizeTipoPacoteRuleKey(value?: string | null) {
  return normalizeText(cleanTipoPacoteForRule(value), {
    trim: true,
    collapseWhitespace: true,
  });
}
