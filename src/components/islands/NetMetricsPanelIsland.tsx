import React, { useEffect, useMemo, useState } from "react";
import {
  clearNetMetrics,
  getCurrentScreen,
  getNetMetrics,
  subscribeNetMetrics,
  type NetMetric,
} from "../../lib/netMetrics";

function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw, window.location.href);
    return url.pathname;
  } catch {
    return String(raw || "").split("?")[0] || raw;
  }
}

function groupCount<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

type EndpointStat = {
  key: string;
  count: number;
  avgMs: number | null;
};

function groupEndpointStats(metrics: NetMetric[]) {
  const map = new Map<string, { count: number; durTotal: number; durCount: number }>();
  metrics.forEach((m) => {
    const kind = m.kind || "outros";
    const key = `${kind} ${m.method} ${normalizeUrl(m.url)}`;
    const current = map.get(key) || { count: 0, durTotal: 0, durCount: 0 };
    current.count += 1;
    if (typeof m.durationMs === "number" && Number.isFinite(m.durationMs)) {
      current.durTotal += m.durationMs;
      current.durCount += 1;
    }
    map.set(key, current);
  });
  const stats: EndpointStat[] = Array.from(map.entries()).map(([key, s]) => ({
    key,
    count: s.count,
    avgMs: s.durCount > 0 ? Math.round((s.durTotal / s.durCount) * 10) / 10 : null,
  }));
  return stats.sort((a, b) => b.count - a.count);
}

export default function NetMetricsPanelIsland() {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeNetMetrics(() => setTick((v) => v + 1));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
      if (key === "m" && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const metrics = useMemo(() => getNetMetrics(), [tick]);
  const total = metrics.length;
  const totalSupabase = metrics.filter((m) => m.kind === "supabase").length;
  const totalBff = metrics.filter((m) => m.kind === "bff").length;
  const currentScreen = getCurrentScreen();

  const byScreen = useMemo(
    () => groupCount(metrics, (m: NetMetric) => m.screen || "unknown").slice(0, 8),
    [metrics]
  );

  const byEndpoint = useMemo(() => groupEndpointStats(metrics).slice(0, 10), [metrics]);

  return (
    <div
      style={{
        position: "fixed",
        left: 14,
        bottom: 14,
        zIndex: 9999,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "#0f172a",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "8px 12px",
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 12px 24px rgba(15, 23, 42, 0.18)",
        }}
        title="Net metrics (Ctrl/Cmd+Shift+M)"
      >
        Net {total}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            width: "min(520px, calc(100vw - 28px))",
            maxHeight: "min(60vh, 520px)",
            overflow: "auto",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.18)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>
              Requests (dev)
            </div>
            <button
              type="button"
              onClick={() => {
                clearNetMetrics();
                setTick((v) => v + 1);
              }}
              style={{
                background: "#f1f5f9",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "6px 10px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Limpar
            </button>
          </div>
          <div style={{ marginTop: 6, color: "#475569", fontSize: 12, fontWeight: 700 }}>
            Tela atual: {currentScreen} • Total: {totalSupabase} Supabase + {totalBff} API • Toggle:
            Ctrl/Cmd+Shift+M
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Por tela</div>
              {byScreen.length === 0 ? (
                <div style={{ color: "#64748b" }}>Nenhuma requisição registrada ainda.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {byScreen.map(([screen, count]) => (
                    <li key={screen} style={{ marginBottom: 2 }}>
                      <span style={{ fontWeight: 900 }}>{screen}</span>: {count}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Top endpoints</div>
              {byEndpoint.length === 0 ? (
                <div style={{ color: "#64748b" }}>—</div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {byEndpoint.map((stat) => (
                    <li key={stat.key} style={{ marginBottom: 2 }}>
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {stat.key}
                      </span>{" "}
                      <span style={{ color: "#475569" }}>({stat.count})</span>
                      {stat.avgMs != null && (
                        <span style={{ color: "#64748b" }}> • avg {stat.avgMs}ms</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
