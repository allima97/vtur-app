export function onlyDigits(value?: string | null): string {
  return String(value ?? "").replace(/\D+/g, "");
}

export function cpfDigitsToFormatted(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function reciboCoreDigits(value?: string | null): string {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function buildReciboSearchTokens(value?: string | null): string[] {
  const digits = onlyDigits(value);
  const core = reciboCoreDigits(value);
  const tokens = [digits, core].map((t) => t.trim()).filter(Boolean);
  return Array.from(new Set(tokens));
}

export function matchesCpfSearch(value?: string | null, termRaw?: string | null): boolean {
  const termDigits = onlyDigits(termRaw);
  if (!termDigits) return false;
  const valueDigits = onlyDigits(value);
  if (!valueDigits) return false;
  return valueDigits.includes(termDigits);
}

export function matchesReciboSearch(value?: string | null, termRaw?: string | null): boolean {
  const termDigits = onlyDigits(termRaw);
  if (!termDigits) return false;
  const valueDigits = onlyDigits(value);
  if (!valueDigits) return false;

  const valueCore = valueDigits.length >= 10 ? valueDigits.slice(-10) : valueDigits;
  const termCore = termDigits.length >= 10 ? termDigits.slice(-10) : termDigits;

  return (
    valueDigits.includes(termDigits) ||
    valueCore.includes(termDigits) ||
    valueDigits.includes(termCore) ||
    valueCore.includes(termCore)
  );
}
