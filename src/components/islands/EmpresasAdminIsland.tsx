import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { formatDateBR } from "../../lib/format";

type EmpresaRow = {
  id: string;
  nome_empresa: string;
  nome_fantasia: string;
  cnpj: string;
  cidade: string | null;
  estado: string | null;

  billing?: {
    status: string;
    valor_mensal: number | null;
    ultimo_pagamento: string | null;
    proximo_vencimento: string | null;
    plan?: { nome: string } | null;
  } | null;
};

type MasterRow = {
  id: string;
  nome_completo: string;
  email: string | null;
};

type MasterVinculo = {
  id: string;
  master_id: string;
  company_id: string;
  status: string;
  created_at: string | null;
  approved_at: string | null;
  master?: MasterRow | null;
  empresa?: { id: string; nome_fantasia: string } | null;
};

const statusColors: Record<string, string> = {
  active: "#22c55e",
  trial: "#0ea5e9",
  past_due: "#eab308",
  suspended: "#f97316",
  canceled: "#ef4444",
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

const EmpresasAdminIsland: React.FC = () => {
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [masters, setMasters] = useState<MasterRow[]>([]);
  const [vinculosMaster, setVinculosMaster] = useState<MasterVinculo[]>([]);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingVinculos, setLoadingVinculos] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroVinculos, setErroVinculos] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [novoCadastro, setNovoCadastro] = useState({
    nome_empresa: "",
    nome_fantasia: "",
    cnpj: "",
    telefone: "",
    endereco: "",
    cidade: "",
    estado: "",
  });
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);
  const [novoVinculoMasterId, setNovoVinculoMasterId] = useState("");
  const [novoVinculoEmpresaId, setNovoVinculoEmpresaId] = useState("");
  const [novoVinculoStatus, setNovoVinculoStatus] = useState("approved");
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    carregarEmpresas();
    carregarMasters();
    carregarVinculos();
    carregarAdminId();
  }, []);

  async function carregarEmpresas() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("companies")
        .select(
          `
          id,
          nome_empresa,
          nome_fantasia,
          cnpj,
          cidade,
          estado,
          billing:company_billing (
            status,
            valor_mensal,
            ultimo_pagamento,
            proximo_vencimento
            ,plan:plans (nome)
          )
        `
        )
        .order("nome_fantasia", { ascending: true });

      if (error) throw error;

      setEmpresas(data as EmpresaRow[]);
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar lista de empresas.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarAdminId() {
    try {
      const { data } = await supabase.auth.getUser();
      setAdminId(data?.user?.id || null);
    } catch {
      setAdminId(null);
    }
  }

  async function carregarMasters() {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, nome_completo, email, user_types(name)")
        .order("nome_completo", { ascending: true });
      if (error) throw error;
      const lista = (data || []).filter((u: any) => {
        const tipo = String(u?.user_types?.name || "").toUpperCase();
        return tipo.includes("MASTER");
      });
      const mapped = lista.map((u: any) => ({
        id: u.id,
        nome_completo: u.nome_completo,
        email: u.email,
      }));
      setMasters(mapped);
    } catch (e) {
      console.error(e);
      setMasters([]);
    }
  }

  async function carregarVinculos() {
    try {
      setLoadingVinculos(true);
      setErroVinculos(null);

      const { data, error } = await supabase
        .from("master_empresas")
        .select("id, master_id, company_id, status, created_at, approved_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data || []) as MasterVinculo[];
      const masterIds = Array.from(new Set(rows.map((r) => r.master_id).filter(Boolean)));
      const companyIds = Array.from(new Set(rows.map((r) => r.company_id).filter(Boolean)));

      let mastersMap: Record<string, MasterRow> = {};
      if (masterIds.length > 0) {
        const { data: mastersData } = await supabase
          .from("users")
          .select("id, nome_completo, email, user_types(name)")
          .in("id", masterIds);
        (mastersData || []).forEach((u: any) => {
          mastersMap[u.id] = {
            id: u.id,
            nome_completo: u.nome_completo,
            email: u.email,
          };
        });
      }

      let empresasMap: Record<string, { id: string; nome_fantasia: string }> = {};
      if (companyIds.length > 0) {
        const { data: empresasData } = await supabase
          .from("companies")
          .select("id, nome_fantasia")
          .in("id", companyIds);
        (empresasData || []).forEach((e: any) => {
          empresasMap[e.id] = { id: e.id, nome_fantasia: e.nome_fantasia };
        });
      }

      const mapped = rows.map((r) => ({
        ...r,
        master: mastersMap[r.master_id] || null,
        empresa: empresasMap[r.company_id] || null,
      }));
      setVinculosMaster(mapped);
    } catch (e) {
      console.error(e);
      setErroVinculos("Erro ao carregar vínculos Master.");
      setVinculosMaster([]);
    } finally {
      setLoadingVinculos(false);
    }
  }

  async function atualizarVinculo(id: string, status: string) {
    try {
      const payload: Record<string, any> = { status };
      if (status === "approved" || status === "rejected") {
        payload.approved_at = new Date().toISOString();
        payload.approved_by = adminId || null;
      }
      const { error } = await supabase
        .from("master_empresas")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
      await carregarVinculos();
      showToast("Vínculo atualizado.", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao atualizar vínculo.", "error");
    }
  }

  async function removerVinculoMaster(id: string) {
    try {
      const { error } = await supabase.from("master_empresas").delete().eq("id", id);
      if (error) throw error;
      await carregarVinculos();
      showToast("Vínculo removido.", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao remover vínculo.", "error");
    }
  }

  async function criarVinculoMaster() {
    if (!novoVinculoMasterId || !novoVinculoEmpresaId) {
      showToast("Selecione a empresa e o master.", "error");
      return;
    }
    try {
      const payload: Record<string, any> = {
        master_id: novoVinculoMasterId,
        company_id: novoVinculoEmpresaId,
        status: novoVinculoStatus,
      };
      if (novoVinculoStatus === "approved") {
        payload.approved_at = new Date().toISOString();
        payload.approved_by = adminId || null;
      }
      const { error } = await supabase.from("master_empresas").insert(payload);
      if (error) throw error;
      setNovoVinculoMasterId("");
      setNovoVinculoEmpresaId("");
      setNovoVinculoStatus("approved");
      await carregarVinculos();
      showToast("Vínculo criado com sucesso.", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao criar vínculo.", "error");
    }
  }

  function abrirModalNovaEmpresa() {
    setNovoCadastro({
      nome_empresa: "",
      nome_fantasia: "",
      cnpj: "",
      telefone: "",
      endereco: "",
      cidade: "",
      estado: "",
    });
    setErroCadastro(null);
    setCreateModalOpen(true);
  }

  async function salvarEmpresa() {
    const nomeEmpresa = novoCadastro.nome_empresa.trim();
    const cnpjLimpo = novoCadastro.cnpj.replace(/\D/g, "");
    if (!nomeEmpresa) {
      setErroCadastro("Informe o nome da empresa.");
      return;
    }
    if (!cnpjLimpo || cnpjLimpo.length !== 14) {
      setErroCadastro("Informe um CNPJ válido.");
      return;
    }
    try {
      setSalvandoEmpresa(true);
      setErroCadastro(null);
      const payload = {
        nome_empresa: nomeEmpresa,
        nome_fantasia: novoCadastro.nome_fantasia.trim() || nomeEmpresa,
        cnpj: cnpjLimpo,
        telefone: novoCadastro.telefone.trim() || null,
        endereco: novoCadastro.endereco.trim() || null,
        cidade: novoCadastro.cidade.trim() || null,
        estado: novoCadastro.estado.trim().toUpperCase().slice(0, 2) || null,
      };
      const { error } = await supabase.from("companies").insert(payload).select("id").single();
      if (error) throw error;
      showToast("Empresa cadastrada com sucesso!", "success");
      setCreateModalOpen(false);
      setNovoCadastro({
        nome_empresa: "",
        nome_fantasia: "",
        cnpj: "",
        telefone: "",
        endereco: "",
        cidade: "",
        estado: "",
      });
      await carregarEmpresas();
    } catch (e: any) {
      console.error(e);
      setErroCadastro("Erro ao cadastrar empresa.");
    } finally {
      setSalvandoEmpresa(false);
    }
  }

  async function atualizarStatus(id: string, novoStatus: string) {
    try {
      const { error } = await supabase
        .from("company_billing")
        .update({ status: novoStatus })
        .eq("company_id", id);

      if (error) throw error;

      await carregarEmpresas();
    } catch (e: any) {
      showToast("Erro ao atualizar status.", "error");
    }
  }

  return (
    <div className="mt-6 admin-page admin-empresas-page">
      <div className="card-base card-blue mb-3 list-toolbar-sticky">
        <div
          className="form-row mobile-stack"
          style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
        >
          <div className="form-group">
            <h3 className="page-title">🏢 Empresas cadastradas</h3>
            <p className="page-subtitle">Gestão de contas e status de cobrança.</p>
          </div>
          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <button className="btn btn-primary w-full sm:w-auto" onClick={abrirModalNovaEmpresa}>
              Nova empresa
            </button>
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
          <table className="table-default table-header-blue table-mobile-cards min-w-[960px]">
            <thead>
              <tr>
                <th>Nome Fantasia</th>
                <th>CNPJ</th>
                <th>Cidade/Estado</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Ult. Pagamento</th>
                <th>Próx. Vencimento</th>
                <th>Valor</th>
                <th className="th-actions">Ações</th>
              </tr>
            </thead>

            <tbody>
              {empresas.map((e) => (
                <tr key={e.id}>
                  <td data-label="Nome Fantasia">{e.nome_fantasia}</td>
                  <td data-label="CNPJ">{formatCnpj(e.cnpj || "")}</td>
                  <td data-label="Cidade/Estado">{[e.cidade, e.estado].filter(Boolean).join("/") || "—"}</td>
                  <td data-label="Plano">{e.billing?.plan?.nome || "—"}</td>
                  <td data-label="Status">
                    <span
                      className="font-bold capitalize"
                      style={{ color: statusColors[e?.billing?.status || "canceled"] }}
                    >
                      {e.billing?.status || "—"}
                    </span>
                  </td>
                  <td data-label="Ult. Pagamento">
                    {e.billing?.ultimo_pagamento
                      ? formatDateBR(e.billing.ultimo_pagamento)
                      : "—"}
                  </td>
                  <td data-label="Próx. Vencimento">
                    {e.billing?.proximo_vencimento
                      ? formatDateBR(e.billing.proximo_vencimento)
                      : "—"}
                  </td>
                  <td data-label="Valor">
                    {e.billing?.valor_mensal
                      ? `R$ ${e.billing.valor_mensal.toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="th-actions" data-label="Ações">
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="btn-icon icon-action-btn"
                        onClick={() => atualizarStatus(e.id, "active")}
                        title="Ativar"
                        aria-label="Ativar"
                      >
                        <span aria-hidden="true">&#10003;</span>
                        <span className="sr-only">Ativar</span>
                      </button>
                      <button
                        type="button"
                        className="btn-icon icon-action-btn"
                        onClick={() => atualizarStatus(e.id, "past_due")}
                        title="Atraso"
                        aria-label="Atraso"
                      >
                        <span aria-hidden="true">&#9203;</span>
                        <span className="sr-only">Atraso</span>
                      </button>
                      <button
                        type="button"
                        className="btn-icon icon-action-btn"
                        onClick={() => atualizarStatus(e.id, "suspended")}
                        title="Suspender"
                        aria-label="Suspender"
                      >
                        <span aria-hidden="true">&#9208;</span>
                        <span className="sr-only">Suspender</span>
                      </button>
                      <button
                        type="button"
                        className="btn-icon icon-action-btn danger"
                        onClick={() => atualizarStatus(e.id, "canceled")}
                        title="Cancelar"
                        aria-label="Cancelar"
                      >
                        <span aria-hidden="true">&#10007;</span>
                        <span className="sr-only">Cancelar</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-base card-config mt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="mb-1">Vínculos Master</h4>
            <p style={{ opacity: 0.7 }}>
              Aprovação de portfólio e atribuições de empresas ao Master.
            </p>
          </div>
        </div>

        {erroVinculos && (
          <div className="mt-3">
            <AlertMessage variant="error">{erroVinculos}</AlertMessage>
          </div>
        )}

        <div className="form-row mobile-stack mt-3">
          <div className="form-group">
            <label className="form-label">Master</label>
            <select
              className="form-select"
              value={novoVinculoMasterId}
              onChange={(e) => setNovoVinculoMasterId(e.target.value)}
            >
              <option value="">Selecione</option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome_completo} {m.email ? `(${m.email})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Empresa</label>
            <select
              className="form-select"
              value={novoVinculoEmpresaId}
              onChange={(e) => setNovoVinculoEmpresaId(e.target.value)}
            >
              <option value="">Selecione</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_fantasia}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={novoVinculoStatus}
              onChange={(e) => setNovoVinculoStatus(e.target.value)}
            >
              <option value="approved">Aprovado</option>
              <option value="pending">Pendente</option>
              <option value="rejected">Rejeitado</option>
            </select>
          </div>
          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <button className="btn btn-primary w-full sm:w-auto" onClick={criarVinculoMaster}>
              Adicionar vínculo
            </button>
          </div>
        </div>

        {loadingVinculos ? (
          <p className="mt-3">Carregando vínculos...</p>
        ) : (
          <div className="table-container overflow-x-auto mt-4">
            <table className="table-default table-header-blue table-mobile-cards min-w-[980px]">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Master</th>
                  <th>Status</th>
                  <th>Solicitado</th>
                  <th>Aprovado</th>
                  <th className="th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {vinculosMaster.length === 0 && (
                  <tr>
                    <td colSpan={6}>Nenhum vínculo cadastrado.</td>
                  </tr>
                )}
                {vinculosMaster.map((v) => (
                  <tr key={v.id}>
                    <td data-label="Empresa">{v.empresa?.nome_fantasia || v.company_id}</td>
                    <td data-label="Master">
                      {v.master?.nome_completo || v.master_id}
                      {v.master?.email ? ` (${v.master.email})` : ""}
                    </td>
                    <td data-label="Status">{v.status}</td>
                    <td data-label="Solicitado">
                      {v.created_at ? formatDateBR(v.created_at) : "—"}
                    </td>
                    <td data-label="Aprovado">
                      {v.approved_at ? formatDateBR(v.approved_at) : "—"}
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-icon icon-action-btn"
                          onClick={() => atualizarVinculo(v.id, "approved")}
                          title="Aprovar"
                          aria-label="Aprovar"
                        >
                          <span aria-hidden="true">&#10003;</span>
                          <span className="sr-only">Aprovar</span>
                        </button>
                        <button
                          type="button"
                          className="btn-icon icon-action-btn"
                          onClick={() => atualizarVinculo(v.id, "rejected")}
                          title="Rejeitar"
                          aria-label="Rejeitar"
                        >
                          <span aria-hidden="true">&#10007;</span>
                          <span className="sr-only">Rejeitar</span>
                        </button>
                        <button
                          type="button"
                          className="btn-icon icon-action-btn danger"
                          onClick={() => removerVinculoMaster(v.id)}
                          title="Remover"
                          aria-label="Remover"
                        >
                          <span aria-hidden="true">&#128465;</span>
                          <span className="sr-only">Remover</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form
            className="modal-panel"
            style={{ maxWidth: 720, width: "95vw", background: "#f8fafc" }}
            onSubmit={(e) => {
              e.preventDefault();
              salvarEmpresa();
            }}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ color: "#1d4ed8", fontWeight: 800 }}>
                Cadastro de empresa
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setCreateModalOpen(false)}
                disabled={salvandoEmpresa}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {erroCadastro && (
                <div className="mb-3">
                  <AlertMessage variant="error">{erroCadastro}</AlertMessage>
                </div>
              )}

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Nome da empresa</label>
                  <input
                    className="form-input"
                    value={novoCadastro.nome_empresa}
                    onChange={(e) => {
                      setNovoCadastro((prev) => ({ ...prev, nome_empresa: e.target.value }));
                      setErroCadastro(null);
                    }}
                    placeholder="Razão social"
                    disabled={salvandoEmpresa}
                    required
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Nome fantasia</label>
                  <input
                    className="form-input"
                    value={novoCadastro.nome_fantasia}
                    onChange={(e) => {
                      setNovoCadastro((prev) => ({ ...prev, nome_fantasia: e.target.value }));
                      setErroCadastro(null);
                    }}
                    placeholder="Nome fantasia"
                    disabled={salvandoEmpresa}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">CNPJ</label>
                  <input
                    className="form-input"
                    value={formatCnpj(novoCadastro.cnpj)}
                    onChange={(e) => {
                      setNovoCadastro((prev) => ({ ...prev, cnpj: formatCnpj(e.target.value) }));
                      setErroCadastro(null);
                    }}
                    placeholder="00.000.000/0000-00"
                    disabled={salvandoEmpresa}
                    required
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Telefone</label>
                  <input
                    className="form-input"
                    value={novoCadastro.telefone}
                    onChange={(e) => {
                      setNovoCadastro((prev) => ({ ...prev, telefone: e.target.value }));
                      setErroCadastro(null);
                    }}
                    placeholder="(00) 00000-0000"
                    disabled={salvandoEmpresa}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Endereço</label>
                <input
                  className="form-input"
                  value={novoCadastro.endereco}
                  onChange={(e) => {
                    setNovoCadastro((prev) => ({ ...prev, endereco: e.target.value }));
                    setErroCadastro(null);
                  }}
                  placeholder="Rua, número, complemento"
                  disabled={salvandoEmpresa}
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Cidade</label>
                  <input
                    className="form-input"
                    value={novoCadastro.cidade}
                    onChange={(e) => {
                      setNovoCadastro((prev) => ({ ...prev, cidade: e.target.value }));
                      setErroCadastro(null);
                    }}
                    disabled={salvandoEmpresa}
                  />
                </div>
                <div className="form-group" style={{ maxWidth: 120 }}>
                  <label className="form-label">Estado</label>
                  <input
                    className="form-input"
                    value={novoCadastro.estado}
                    onChange={(e) => {
                      setNovoCadastro((prev) => ({ ...prev, estado: e.target.value }));
                      setErroCadastro(null);
                    }}
                    maxLength={2}
                    placeholder="UF"
                    disabled={salvandoEmpresa}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer mobile-stack-buttons">
              <button type="submit" className="btn btn-primary" disabled={salvandoEmpresa}>
                {salvandoEmpresa ? "Salvando..." : "Salvar empresa"}
              </button>
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setCreateModalOpen(false)}
                disabled={salvandoEmpresa}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default EmpresasAdminIsland;

