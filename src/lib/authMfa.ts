type MfaFactorLike = {
  id: string;
  friendly_name?: string | null;
  factor_type?: string | null;
  status?: string | null;
};

type MfaFactorsLike = {
  all?: MfaFactorLike[] | null;
  totp?: MfaFactorLike[] | null;
};

export function getPrimaryVerifiedTotpFactor(factors?: MfaFactorsLike | null) {
  const totpFactors = Array.isArray(factors?.totp) ? factors.totp : [];
  return (totpFactors.find((factor) => factor?.status === "verified") ||
    totpFactors[0] ||
    null) as MfaFactorLike | null;
}

export function hasVerifiedTotpFactor(factors?: MfaFactorsLike | null) {
  return Boolean(getPrimaryVerifiedTotpFactor(factors));
}

export function getPendingTotpFactors(factors?: MfaFactorsLike | null) {
  const all = Array.isArray(factors?.all) ? factors.all : [];
  return all.filter(
    (factor) => factor?.factor_type === "totp" && factor?.status === "unverified"
  );
}

export function normalizeMfaCode(value?: string | null) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

export function buildTotpQrDataUrl(qrCode?: string | null) {
  if (!qrCode) return "";
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}

export function normalizeMfaRedirectPath(next?: string | null, fallback = "/dashboard") {
  const value = String(next || "").trim();
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.startsWith("/auth/login")) return fallback;
  return value;
}
