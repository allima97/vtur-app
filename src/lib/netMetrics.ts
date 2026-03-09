export type NetMetric = {
  ts: number;
  url: string;
  method: string;
  screen?: string;
  kind?: "supabase" | "bff";
  status?: number | null;
  durationMs?: number | null;
};

const metrics: NetMetric[] = [];
let currentScreen = "unknown";

const EVENT_NAME = "sgtur:net-metrics";
const SCREEN_EVENT_NAME = "sgtur:net-metrics-screen";
const MAX_METRICS = 4000;

function safeDispatch(eventName: string, detail: unknown) {
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  } catch {}
}

export function setCurrentScreen(name: string) {
  const next = String(name || "").trim() || "unknown";
  currentScreen = next;
  safeDispatch(SCREEN_EVENT_NAME, { screen: currentScreen });
}

export function getCurrentScreen() {
  return currentScreen;
}

export function getNetMetrics() {
  return metrics.slice();
}

export function clearNetMetrics() {
  metrics.length = 0;
  safeDispatch(EVENT_NAME, { cleared: true });
}

export function getMetricsSnapshot() {
  const bffMetrics = metrics.filter((m) => m.kind === "bff");
  const supabaseMetrics = metrics.filter((m) => m.kind === "supabase");

  const topEndpoints = Array.from(
    metrics
      .reduce((acc, m) => {
        const key = m.url;
        if (!acc.has(key)) {
          acc.set(key, { urls: m.url, count: 0, totalDuration: 0 });
        }
        const entry = acc.get(key)!;
        entry.count.push(undefined);
        entry.totalDuration += m.durationMs ?? 0;
        return acc;
      }, new Map<string, { urls: string; count: any[]; totalDuration: number }>())
      .values()
  )
    .map((e) => ({
      url: e.urls,
      count: e.count.length,
      avgDurationMs: Math.round(e.totalDuration / e.count.length),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const durations = metrics
    .map((m) => m.durationMs ?? 0)
    .filter((d) => d > 0);
  const avgTTFB =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  return {
    timestamp: Date.now(),
    screen: currentScreen,
    totalRequests: metrics.length,
    bffRequests: bffMetrics.length,
    supabaseRequests: supabaseMetrics.length,
    avgTTFBMs: avgTTFB,
    topEndpoints,
  };
}

export function subscribeNetMetrics(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener(SCREEN_EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener(SCREEN_EVENT_NAME, handler);
  };
}

export function installFetchMetrics() {
  if (typeof window === "undefined") return;
  if ((globalThis as any).__fetchMetricsInstalled) return;
  (globalThis as any).__fetchMetricsInstalled = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as any).url ?? input);
    const method = String(init?.method || "GET").toUpperCase();

    const isSupabase =
      url.includes("/rest/v1/") ||
      url.includes("/rpc/") ||
      url.includes("/auth/v1/") ||
      url.includes("/storage/v1/");

    const getPathname = () => {
      try {
        const base = typeof window !== "undefined" ? window.location.href : "http://localhost";
        return new URL(url, base).pathname;
      } catch {
        return String(url || "").split("?")[0];
      }
    };

    const pathname = getPathname();
    const isBff = pathname.startsWith("/api/v1/") || pathname.startsWith("/api/");
    const shouldLog = isSupabase || isBff;
    const kind: NetMetric["kind"] = isSupabase ? "supabase" : isBff ? "bff" : undefined;

    const startPerf = (() => {
      try {
        return performance.now();
      } catch {
        return Date.now();
      }
    })();

    try {
      const response = await originalFetch(input as any, init);
      if (shouldLog) {
        const endPerf = (() => {
          try {
            return performance.now();
          } catch {
            return Date.now();
          }
        })();

        metrics.push({
          ts: Date.now(),
          url,
          method,
          screen: currentScreen,
          kind,
          status: response?.status ?? null,
          durationMs: Math.round((endPerf - startPerf) * 10) / 10,
        });
        if (metrics.length > MAX_METRICS) {
          metrics.splice(0, metrics.length - MAX_METRICS);
        }
        safeDispatch(EVENT_NAME, { ts: Date.now() });
      }
      return response;
    } catch (err) {
      if (shouldLog) {
        const endPerf = (() => {
          try {
            return performance.now();
          } catch {
            return Date.now();
          }
        })();

        metrics.push({
          ts: Date.now(),
          url,
          method,
          screen: currentScreen,
          kind,
          status: null,
          durationMs: Math.round((endPerf - startPerf) * 10) / 10,
        });
        if (metrics.length > MAX_METRICS) {
          metrics.splice(0, metrics.length - MAX_METRICS);
        }
        safeDispatch(EVENT_NAME, { ts: Date.now() });
      }
      throw err;
    }
  };
}
