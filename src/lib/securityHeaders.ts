function buildCspValue() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:",
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    "frame-src 'self' https:",
    "form-action 'self' https:",
  ].join("; ");
}

export function applySecurityHeaders(headers: Headers) {
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", buildCspValue());
  }
  if (!headers.has("X-Frame-Options")) {
    headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  if (!headers.has("X-Content-Type-Options")) {
    headers.set("X-Content-Type-Options", "nosniff");
  }
  if (!headers.has("Referrer-Policy")) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  if (!headers.has("Permissions-Policy")) {
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
    );
  }
}
