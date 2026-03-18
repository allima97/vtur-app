type RateRule = {
  key: string;
  path: string;
  methods: string[];
  limit: number;
  windowMs: number;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

const RATE_RULES: RateRule[] = [
  { key: "admin-reset-mfa", path: "/api/admin/auth/reset-mfa", methods: ["POST"], limit: 10, windowMs: 60_000 },
  { key: "master-reset-mfa", path: "/api/master/auth/reset-mfa", methods: ["POST"], limit: 10, windowMs: 60_000 },
  { key: "admin-set-password", path: "/api/admin/auth/set-password", methods: ["POST"], limit: 10, windowMs: 60_000 },
  { key: "convites-send", path: "/api/convites/send", methods: ["POST"], limit: 15, windowMs: 60_000 },
  { key: "clientes-template-send", path: "/api/clientes/templates/send", methods: ["POST"], limit: 20, windowMs: 60_000 },
  { key: "admin-email-test", path: "/api/admin/email/test", methods: ["POST"], limit: 5, windowMs: 60_000 },
];

const rateBuckets = new Map<string, RateEntry>();
let requestCounter = 0;

function resolveClientIp(request: Request) {
  const forwarded =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "";
  return String(forwarded).split(",")[0]?.trim() || "";
}

function findRule(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  return RATE_RULES.find((rule) => pathname === rule.path && rule.methods.includes(method));
}

function pruneExpiredBuckets(now: number) {
  requestCounter += 1;
  if (requestCounter % 100 !== 0) return;

  for (const [key, entry] of rateBuckets.entries()) {
    if (entry.resetAt <= now) rateBuckets.delete(key);
  }
}

function isDisabled(env?: Record<string, unknown>) {
  const raw = String(env?.DISABLE_SOFT_RATE_LIMIT ?? "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

export function enforceApiRateLimit(request: Request, env?: Record<string, unknown>) {
  if (isDisabled(env)) return null;

  const rule = findRule(request);
  if (!rule) return null;

  const ip = resolveClientIp(request);
  if (!ip) return null;

  const now = Date.now();
  pruneExpiredBuckets(now);

  const bucketKey = `${rule.key}:${ip}`;
  const current = rateBuckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }

  if (current.count >= rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return new Response(
      JSON.stringify({
        error: "Muitas tentativas em pouco tempo. Aguarde e tente novamente.",
        retry_after_seconds: retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSeconds),
        },
      }
    );
  }

  current.count += 1;
  rateBuckets.set(bucketKey, current);
  return null;
}
