import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import PerformanceDashboardIsland from "./PerformanceDashboardIsland";

type BillingRow = {
  company_id: string;
  status: string;
  proximo_vencimento: string | null;
  companies?: { nome_fantasia: string | null; cnpj: string | null } | null;
};

type PlanRow = {
  id: string;
  ativo: boolean;
};

type AdminKpis = {
  empresasTotal: number;
  empresasAtivas: number;
  empresasInativas: number;
  usuariosTotal: number;
  usuariosAtivos: number;
  usuariosInativos: number;
  planosTotal: number;
  planosAtivos: number;
  planosInativos: number;
  cobrancasAtivas: number;
  cobrancasTrial: number;
  cobrancasAtrasadas: number;
  cobrancasSuspensas: number;
  cobrancasCanceladas: number;
};

type MaintenanceStatus = {
  maintenance_enabled: boolean;
  maintenance_message: string | null;
  updated_at: string | null;
};

export default function DashboardAdminIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminDashboard");

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [adminKpis, setAdminKpis] = useState<AdminKpis>({
    empresasTotal: 0,
    empresasAtivas: 0,
    empresasInativas: 0,
    usuariosTotal: 0,
    usuariosAtivos: 0,
    usuariosInativos: 0,
    planosTotal: 0,
    planosAtivos: 0,
    planosInativos: 0,
    cobrancasAtivas: 0,
    cobrancasTrial: 0,
    cobrancasAtrasadas: 0,
    cobrancasSuspensas: 0,
    cobrancasCanceladas: 0,
  });

  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus>({
    maintenance_enabled: false,
    maintenance_message: null,
    updated_at: null,
  });
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceNotice, setMaintenanceNotice] = useState<string | null>(null);

  const resumoCards = [
    {
      key: "empresas",
      label: "Empresas cadastradas",
      value: adminKpis.empresasTotal,
      meta: `Ativas: ${adminKpis.empresasAtivas} · Inativas: ${adminKpis.empresasInativas}`,
      color: "#0ea5e9",
      background: "rgba(14, 165, 233, 0.08)",
      icon: "🏢",
    },
    {
      key: "usuarios",
      label: "Usuários",
      value: adminKpis.usuariosTotal,
      meta: `Ativos: ${adminKpis.usuariosAtivos} · Inativos: ${adminKpis.usuariosInativos}`,
      color: "#6366f1",
      background: "rgba(99, 102, 241, 0.08)",
      icon: "👥",
    },
    {
      key: "planos",
      label: "Planos",
      value: adminKpis.planosTotal,
      meta: `Ativos: ${adminKpis.planosAtivos} · Inativos: ${adminKpis.planosInativos}`,
      color: "#14b8a6",
      background: "rgba(20, 184, 166, 0.08)",
      icon: "💳",
    },
    {
      key: "atrasos",
      label: "Pagamentos em atraso",
      value: adminKpis.cobrancasAtrasadas,
      meta: "Monitorar cobranças vencidas",
      color: "#f97316",
      background: "rgba(249, 115, 22, 0.08)",
      icon: "⚠️",
    },
  ];

  const cobrancaCards = [
    {
      key: "ativas",
      label: "Ativas",
      value: adminKpis.cobrancasAtivas,
      color: "#22c55e",
      background: "rgba(34, 197, 94, 0.1)",
    },
    {
      key: "trial",
      label: "Trial",
      value: adminKpis.cobrancasTrial,
      color: "#0ea5e9",
      background: "rgba(14, 165, 233, 0.1)",
    },
    {
      key: "atrasadas",
      label: "Atrasadas",
      value: adminKpis.cobrancasAtrasadas,
      color: "#f59e0b",
      background: "rgba(245, 158, 11, 0.12)",
    },
    {
      key: "suspensas",
      label: "Suspensas",
      value: adminKpis.cobrancasSuspensas,
      color: "#f97316",
      background: "rgba(249, 115, 22, 0.12)",
    },
    {
      key: "canceladas",
      label: "Canceladas",
      value: adminKpis.cobrancasCanceladas,
      color: "#ef4444",
      background: "rgba(239, 68, 68, 0.1)",
    },
  ];

  const atalhos = [
    {
      key: "empresas",
      label: "Empresas",
      description: "Cadastro e status de contas",
      href: "/admin/empresas",
      icon: "🏢",
      color: "#0ea5e9",
    },
    {
      key: "usuarios",
      label: "Usuários",
      description: "Perfis, cargos e acesso",
      href: "/admin/usuarios",
      icon: "👥",
      color: "#6366f1",
    },
    {
      key: "planos",
      label: "Planos",
      description: "Catálogo e valores",
      href: "/admin/planos",
      icon: "💳",
      color: "#14b8a6",
    },
    {
      key: "financeiro",
      label: "Financeiro",
      description: "Status e cobranças",
      href: "/admin/financeiro",
      icon: "💰",
      color: "#f59e0b",
    },
    {
      key: "permissoes",
      label: "Permissões",
      description: "Módulos e níveis de acesso",
      href: "/admin/permissoes",
      icon: "⚙️",
      color: "#475569",
    },
    {
      key: "avisos",
      label: "Avisos",
      description: "Templates e notificações",
      href: "/admin/avisos",
      icon: "📣",
      color: "#ef4444",
    },
    {
      key: "email",
      label: "E-mail (Envio)",
      description: "Configurar envio",
      href: "/admin/email",
      icon: "✉️",
      color: "#0ea5e9",
    },
    {
      key: "logs",
      label: "Logs",
      description: "Auditoria do sistema",
      href: "/dashboard/logs",
      icon: "📜",
      color: "#64748b",
    },
    {
      key: "documentacao",
      label: "Documentação",
      description: "Guias e instruções",
      href: "/documentacao",
      icon: "📚",
      color: "#7c3aed",
    },
  ];

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      setErro(null);

      const resp = await fetch("/api/v1/admin/summary");
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const payload = await resp.json();
      setAdminKpis(payload);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar dados administrativos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      setMaintenanceLoading(true);
      setMaintenanceError(null);
      const resp = await fetch("/api/v1/admin/maintenance");
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const payload = (await resp.json()) as MaintenanceStatus;
      setMaintenanceStatus({
        maintenance_enabled: Boolean(payload?.maintenance_enabled),
        maintenance_message: payload?.maintenance_message ?? null,
        updated_at: payload?.updated_at ?? null,
      });
    } catch (e) {
      console.error(e);
      setMaintenanceError("Erro ao carregar status de manutencao.");
    } finally {
      setMaintenanceLoading(false);
    }
  }, []);

  const salvarManutencao = useCallback(async () => {
    try {
      setMaintenanceSaving(true);
      setMaintenanceError(null);
      setMaintenanceNotice(null);

      const resp = await fetch("/api/v1/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maintenance_enabled: maintenanceStatus.maintenance_enabled,
          maintenance_message: maintenanceStatus.maintenance_message,
        }),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      setMaintenanceNotice("Modo de manutencao atualizado.");
      await fetchMaintenanceStatus();
    } catch (e) {
      console.error(e);
      setMaintenanceError("Erro ao salvar manutencao.");
    } finally {
      setMaintenanceSaving(false);
    }
  }, [maintenanceStatus, fetchMaintenanceStatus]);

  // =========================================================
  // VERIFICAR SE O USUÁRIO É ADMIN
  // =========================================================
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function loadAdmin() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user) return;

        const { data: u } = await supabase
          .from("users")
          .select("id, user_types(name)")
          .eq("id", data.user.id)
          .maybeSingle();

        const tipo = u?.user_types?.name?.toUpperCase() || "";
        setIsAdmin(tipo.includes("ADMIN"));
      } catch (e) {
        console.error(e);
      }
    }
    loadAdmin();
  }, []);

  // =========================================================
  // CARREGAR DADOS ADMINISTRATIVOS
  // =========================================================
  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  useEffect(() => {
    if (isAdmin) {
      fetchMaintenanceStatus();
    }
  }, [isAdmin, fetchMaintenanceStatus]);

  // bloquear quem não é admin
  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer || !isAdmin)
    return (
      <div style={{ padding: 20 }}>
        <h3>Apenas administradores podem acessar este dashboard.</h3>
      </div>
    );

  // =========================================================
  // UI PRINCIPAL
  // =========================================================

  return (
    <div className="dashboard-admin-page admin-page admin-dashboard-page">
      {/* INDICADOR */}
      <div className="card-base card-red mb-3 list-toolbar-sticky">
        <div className="form-row mobile-stack" style={{ gap: 12 }}>
          <div className="form-group">
            <h3 className="page-title">📊 Dashboard administrativo</h3>
            <p className="page-subtitle">Controle geral do sistema e indicadores-chave.</p>
          </div>
        </div>
      </div>

      {/* RESUMO ADMINISTRATIVO */}
      <div className="card-base card-red mb-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="mb-0 font-semibold text-lg">Modo de manutencao</h3>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Suspende o acesso do sistema e exibe a pagina de manutencao.
            </p>
          </div>
          <a className="btn btn-light" href="/manutencao">
            Abrir pagina de manutencao
          </a>
        </div>
        {maintenanceError && <div className="auth-error" style={{ marginTop: 12 }}>{maintenanceError}</div>}
        {maintenanceNotice && <div className="auth-success" style={{ marginTop: 12 }}>{maintenanceNotice}</div>}
        <div className="form-row mobile-stack" style={{ gap: 16, marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={maintenanceStatus.maintenance_enabled}
              onChange={(e) =>
                setMaintenanceStatus((prev) => ({
                  ...prev,
                  maintenance_enabled: e.target.checked,
                }))
              }
              disabled={maintenanceLoading || maintenanceSaving}
            />
            {maintenanceStatus.maintenance_enabled ? "Manutencao ativa" : "Manutencao desativada"}
          </label>
          <button
            className="btn btn-primary"
            type="button"
            onClick={salvarManutencao}
            disabled={maintenanceLoading || maintenanceSaving}
          >
            {maintenanceSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="card-base card-red mb-3">
        <h3 className="mb-3 font-semibold text-lg">Resumo administrativo</h3>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {resumoCards.map((card) => (
            <div
              key={card.key}
              className="kpi-card"
              style={{
                borderLeft: `4px solid ${card.color}`,
                background: card.background,
              }}
            >
              <div className="kpi-icon" style={{ color: card.color }}>
                {card.icon}
              </div>
              <div>
                <div className="kpi-label">{card.label}</div>
                <div className="kpi-value">{card.value}</div>
                {card.meta && (
                  <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                    {card.meta}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-base card-red mb-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="mb-0 font-semibold text-lg">Status de cobrança</h3>
          <a className="btn btn-light" href="/admin/financeiro">Ver financeiro</a>
        </div>
        <div
          className="grid gap-3 mt-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          {cobrancaCards.map((card) => (
            <div
              key={card.key}
              className="kpi-card"
              style={{
                background: card.background,
                borderLeft: `4px solid ${card.color}`,
              }}
            >
              <div>
                <div className="kpi-label">{card.label}</div>
                <div className="kpi-value">{card.value}</div>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: card.color,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ATALHOS */}
      <div className="card-base card-red mb-3">
        <h3 className="mb-3 font-semibold text-lg">Atalhos rápidos</h3>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          {atalhos.map((atalho) => (
            <a
              key={atalho.key}
              href={atalho.href}
              className="card-base"
              style={{
                textDecoration: "none",
                color: "inherit",
                border: "1px solid rgba(148, 163, 184, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: "1.5rem" }}>{atalho.icon}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{atalho.label}</div>
                  <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                    {atalho.description}
                  </div>
                </div>
              </div>
              <span style={{ color: atalho.color, fontWeight: 700 }}>&gt;</span>
            </a>
          ))}
        </div>
      </div>

      {/* PERFORMANCE DASHBOARD */}
      <div className="card-base card-red mb-3">
        <h3 className="mb-4 font-semibold text-lg">⚡ Monitoramento de performance</h3>
        <PerformanceDashboardIsland />
      </div>

      {erro && <div className="card-base card-config">{erro}</div>}
      {loading && <div>Carregando dados...</div>}
    </div>
  );
}
