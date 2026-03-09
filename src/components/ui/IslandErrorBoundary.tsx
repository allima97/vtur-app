import React from "react";

type Props = {
  name?: string;
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class IslandErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Erro inesperado";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: unknown) {
    try {
      const err = error as any;
      console.error("[IslandErrorBoundary]", {
        island: this.props.name || "unknown",
        message: err?.message ?? String(error),
        stack: err?.stack,
        info,
        url: typeof window !== "undefined" ? window.location.href : "",
      });
    } catch {}

    try {
      // best-effort: log no servidor (não quebra se falhar)
      fetch("/api/v1/client-error", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          island: this.props.name || "unknown",
          message: (error as any)?.message ?? String(error),
          stack: (error as any)?.stack ?? null,
          info,
          url: typeof window !== "undefined" ? window.location.href : "",
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="card-base card-config" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Erro ao carregar esta tela</div>
        <div style={{ fontSize: "0.9rem", marginBottom: 10 }}>
          {this.props.name ? `${this.props.name}: ` : ""}
          {this.state.message || "Erro inesperado"}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Recarregar
          </button>
          <button
            type="button"
            className="btn btn-light"
            onClick={() => {
              try {
                window.localStorage.removeItem("dashboard_widgets");
                window.localStorage.removeItem("dashboard_kpis");
                window.localStorage.removeItem("dashboard_charts");
                window.localStorage.removeItem("dashboard_gestor_widgets");
                window.localStorage.removeItem("dashboard_gestor_kpis");
              } catch {}
              window.location.reload();
            }}
          >
            Limpar preferências do dashboard
          </button>
        </div>
      </div>
    );
  }
}
