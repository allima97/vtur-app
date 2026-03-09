import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";

type EmpresaRow = {
  id: string;
  company_id: string;
  status: string;
  company?: {
    id: string;
    nome_empresa?: string | null;
    nome_fantasia?: string | null;
    cnpj?: string | null;
    cidade?: string | null;
    estado?: string | null;
  } | null;
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

const statusLabel: Record<string, string> = {
  approved: "Aprovada",
  pending: "Pendente",
  rejected: "Rejeitada",
};

export default function MasterEmpresasIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("MasterEmpresas");
  const isMaster = /MASTER/i.test(String(userType || ""));

  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const { toasts, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    if (!loadingPerm && podeVer) {
      carregarEmpresas();
    }
  }, [loadingPerm, podeVer]);

  async function carregarEmpresas() {
    try {
      setLoading(true);
      setErro(null);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;
      if (!userId) {
        setErro("Usuário não autenticado.");
        return;
      }

      const { data, error } = await supabase
        .from("master_empresas")
        .select(
          "id, company_id, status, companies(id, nome_empresa, nome_fantasia, cnpj, cidade, estado)"
        )
        .eq("master_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []).map((row: any) => ({
        id: row.id,
        company_id: row.company_id,
        status: row.status || "pending",
        company: row.companies || null,
      }));
      setEmpresas(rows as EmpresaRow[]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar empresas do master.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer || !isMaster) {
    return (
      <div style={{ padding: 20 }}>
        <h3>Apenas usuários MASTER podem acessar este módulo.</h3>
      </div>
    );
  }

  return (
    <div className="mt-6 admin-page admin-empresas-page">
      <div className="card-base card-blue mb-3 list-toolbar-sticky">
        <div
          className="form-row mobile-stack"
          style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
        >
          <div className="form-group">
            <h3 className="page-title">🏢 Empresas do portfólio</h3>
            <p className="page-subtitle">
              Empresas atribuídas pelo admin.
            </p>
          </div>
        </div>
      </div>

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {loading ? (
        <p>Carregando empresas...</p>
      ) : (
        <div className="table-container overflow-x-auto">
          <table className="table-default table-header-blue table-mobile-cards min-w-[720px]">
            <thead>
              <tr>
                <th>Nome Fantasia</th>
                <th>CNPJ</th>
                <th>Cidade/Estado</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {empresas.length === 0 && (
                <tr>
                  <td colSpan={4}>Nenhuma empresa vinculada.</td>
                </tr>
              )}
              {empresas.map((e) => (
                <tr key={e.id}>
                  <td data-label="Nome Fantasia">{e.company?.nome_fantasia || "-"}</td>
                  <td data-label="CNPJ">{formatCnpj(e.company?.cnpj || "")}</td>
                  <td data-label="Cidade/Estado">
                    {e.company?.cidade || "-"}/{e.company?.estado || "-"}
                  </td>
                  <td data-label="Status">{statusLabel[e.status] || e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
