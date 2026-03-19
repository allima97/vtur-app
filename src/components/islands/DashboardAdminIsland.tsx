import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
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

function renderDashboardAdminIcon(icon: string) {
  const iconClass = String(icon || "").trim();
  if (!iconClass.startsWith("pi ")) return icon;
  return <i className={iconClass} aria-hidden="true" />;
}

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
      icon: "pi pi-building",
    },
    {
      key: "usuarios",
      label: "Usuários",
      value: adminKpis.usuariosTotal,
      meta: `Ativos: ${adminKpis.usuariosAtivos} · Inativos: ${adminKpis.usuariosInativos}`,
      color: "#6366f1",
      background: "rgba(99, 102, 241, 0.08)",
      icon: "pi pi-users",
    },
    {
      key: "planos",
      label: "Planos",
      value: adminKpis.planosTotal,
      meta: `Ativos: ${adminKpis.planosAtivos} · Inativos: ${adminKpis.planosInativos}`,
      color: "#14b8a6",
      background: "rgba(20, 184, 166, 0.08)",
      icon: "pi pi-credit-card",
    },
    {
      key: "atrasos",
      label: "Pagamentos em atraso",
      value: adminKpis.cobrancasAtrasadas,
      meta: "Monitorar cobranças vencidas",
      color: "#f97316",
      background: "rgba(249, 115, 22, 0.08)",
      icon: "pi pi-exclamation-triangle",
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
      icon: "pi pi-building",
      color: "#0ea5e9",
    },
    {
      key: "usuarios",
      label: "Usuários",
      description: "Perfis, cargos e acesso",
      href: "/admin/usuarios",
      icon: "pi pi-users",
      color: "#6366f1",
    },
    {
      key: "planos",
      label: "Planos",
      description: "Catálogo e valores",
      href: "/admin/planos",
      icon: "pi pi-credit-card",
      color: "#14b8a6",
    },
    {
      key: "financeiro",
      label: "Financeiro",
      description: "Status e cobranças",
      href: "/admin/financeiro",
      icon: "pi pi-dollar",
      color: "#f59e0b",
    },
    {
      key: "permissoes",
      label: "Permissões",
      description: "Módulos e níveis de acesso",
      href: "/admin/permissoes",
      icon: "pi pi-cog",
      color: "#475569",
    },
    {
      key: "avisos",
      label: "Avisos",
      description: "Templates e notificações",
      href: "/admin/avisos",
      icon: "pi pi-megaphone",
      color: "#ef4444",
    },
    {
      key: "email",
      label: "E-mail (Envio)",
      description: "Configurar envio",
      href: "/admin/email",
      icon: "pi pi-envelope",
      color: "#0ea5e9",
    },
    {
      key: "logs",
      label: "Logs",
      description: "Auditoria do sistema",
      href: "/dashboard/logs",
      icon: "pi pi-file",
      color: "#64748b",
    },
    {
      key: "documentacao",
      label: "Documentação",
      description: "Guias e instruções",
      href: "/documentacao",
      icon: "pi pi-book",
      color: "#2563eb",
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
  if (!podeVer || !isAdmin) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap admin-dashboard-page">
          <AppCard tone="config">Apenas administradores podem acessar este dashboard.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  // =========================================================
  // UI PRINCIPAL
  // =========================================================

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap dashboard-admin-page admin-page admin-dashboard-page vtur-dashboard-shell">
        <AppCard
          className="mb-3 list-toolbar-sticky"
          title="Dashboard administrativo"
          subtitle="Controle geral do sistema, manutencao, cobrancas, atalhos operacionais e monitoramento de performance."
          tone="config"
        />

        <AppCard
          tone="config"
          title="Modo de manutencao"
          subtitle="Suspende o acesso do sistema e exibe a pagina de manutencao para todos os usuarios."
          actions={
            <AppButton as="a" href="/manutencao" variant="secondary">
              Abrir pagina de manutencao
            </AppButton>
          }
        >
          <div className="vtur-dashboard-stack">
            {maintenanceError && <AlertMessage variant="error">{maintenanceError}</AlertMessage>}
            {maintenanceNotice && <AlertMessage variant="success">{maintenanceNotice}</AlertMessage>}
            <div className="vtur-dashboard-inline-fields">
              <label className="vtur-dashboard-checkbox-row">
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
                <span>
                  {maintenanceStatus.maintenance_enabled ? "Manutencao ativa" : "Manutencao desativada"}
                </span>
              </label>
              <AppButton
                type="button"
                variant="primary"
                onClick={salvarManutencao}
                disabled={maintenanceLoading || maintenanceSaving}
              >
                {maintenanceSaving ? "Salvando..." : "Salvar"}
              </AppButton>
            </div>
            <AppField
              as="textarea"
              label="Mensagem de manutencao"
              rows={4}
              value={maintenanceStatus.maintenance_message || ""}
              onChange={(e) =>
                setMaintenanceStatus((prev) => ({
                  ...prev,
                  maintenance_message: e.target.value,
                }))
              }
              placeholder="Informe uma mensagem opcional para a pagina de manutencao."
              caption={
                maintenanceStatus.updated_at
                  ? `Ultima atualizacao em ${new Date(maintenanceStatus.updated_at).toLocaleString("pt-BR")}.`
                  : "Ainda nao houve atualizacao registrada."
              }
              disabled={maintenanceLoading || maintenanceSaving}
            />
          </div>
        </AppCard>

        <AppCard
          tone="config"
          title="Resumo administrativo"
          subtitle="Visao consolidada de empresas, usuarios, planos e cobrancas."
        >
          <div className="vtur-dashboard-kpi-grid">
            {resumoCards.map((card) => (
              <div
                key={card.key}
                className="vtur-dashboard-kpi-card"
                style={{ borderLeft: `4px solid ${card.color}`, background: card.background }}
              >
                <div className="vtur-dashboard-kpi-icon" style={{ color: card.color }}>
                  {renderDashboardAdminIcon(card.icon)}
                </div>
                <div className="vtur-dashboard-kpi-copy">
                  <div className="vtur-dashboard-kpi-label">{card.label}</div>
                  <div className="vtur-dashboard-kpi-value">{card.value}</div>
                  {card.meta ? <div className="vtur-dashboard-kpi-meta">{card.meta}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard
          tone="config"
          title="Status de cobranca"
          subtitle="Acompanhe rapidamente contas ativas, em trial, atrasadas, suspensas e canceladas."
          actions={
            <AppButton as="a" href="/admin/financeiro" variant="secondary">
              Ver financeiro
            </AppButton>
          }
        >
          <div className="vtur-dashboard-summary-grid">
            {cobrancaCards.map((card) => (
              <div
                key={card.key}
                className="vtur-dashboard-kpi-card"
                style={{ background: card.background, borderLeft: `4px solid ${card.color}` }}
              >
                <div className="vtur-dashboard-kpi-copy">
                  <div className="vtur-dashboard-kpi-label">{card.label}</div>
                  <div className="vtur-dashboard-kpi-value">{card.value}</div>
                </div>
                <span className="vtur-dashboard-stat-dot" style={{ background: card.color }} />
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard
          tone="config"
          title="Atalhos rapidos"
          subtitle="Acesso direto aos paineis administrativos mais usados."
        >
          <div className="vtur-dashboard-link-grid">
            {atalhos.map((atalho) => (
              <a key={atalho.key} href={atalho.href} className="vtur-dashboard-link-card">
                <div className="vtur-dashboard-link-copy">
                  <span className="vtur-dashboard-link-icon">{renderDashboardAdminIcon(atalho.icon)}</span>
                  <div>
                    <div className="vtur-dashboard-link-title">{atalho.label}</div>
                    <div className="vtur-dashboard-link-description">{atalho.description}</div>
                  </div>
                </div>
                <span className="vtur-dashboard-link-arrow" style={{ color: atalho.color }}>
                  &gt;
                </span>
              </a>
            ))}
          </div>
        </AppCard>

        <AppCard
          tone="config"
          title="Monitoramento de performance"
          subtitle="Indicadores tecnicos e observabilidade do sistema."
        >
          <PerformanceDashboardIsland />
        </AppCard>

        {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
        {loading && <AppCard tone="config">Carregando dados...</AppCard>}
      </div>
    </AppPrimerProvider>
  );
}
