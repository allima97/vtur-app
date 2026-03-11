import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { useMasterScope } from "../../lib/useMasterScope";
import { normalizeText } from "../../lib/normalizeText";
import { matchesReciboSearch } from "../../lib/searchNormalization";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import TableActions from "../ui/TableActions";
import { exportTableToPDF } from "../../lib/pdf";
import { boundDateEndISO, selectAllInputOnFocus } from "../../lib/inputNormalization";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppToolbar from "../ui/primer/AppToolbar";

type SacRegistro = {
  id: string;
  company_id: string;
  recibo: string | null;
  tour: string | null;
  data_solicitacao: string | null;
  motivo: string | null;
  contratante_pax: string | null;
  ok_quando: string | null;
  status: string | null;
  responsavel: string | null;
  prazo: string | null;
  created_at: string;
  updated_at: string;
};

type SacInteracao = {
  id: string;
  sac_id: string;
  data_interacao: string | null;
  descricao: string | null;
  created_at: string;
};

const initialForm = {
  recibo: "",
  tour: "",
  data_solicitacao: "",
  motivo: "",
  contratante_pax: "",
  ok_quando: "",
  status: "aberto",
  responsavel: "",
  prazo: "",
};

const STATUS_OPCOES = [
  { value: "aberto", label: "Aberto" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

const STATUS_LABEL: Record<string, string> = STATUS_OPCOES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {} as Record<string, string>);

export default function ControleSacIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Controle de SAC") || can("Operacao");
  const podeCriar =
    can("Controle de SAC", "create") ||
    can("Controle de SAC", "edit") ||
    can("Operacao", "create") ||
    can("Operacao", "edit");
  const podeEditar = can("Controle de SAC", "edit") || can("Operacao", "edit");
  const podeExcluir = can("Controle de SAC", "delete") || can("Operacao", "delete");

  const isMaster = /MASTER/i.test(String(userType || ""));
  const masterScope = useMasterScope(Boolean(isMaster && ready));

  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyNome, setCompanyNome] = useState<string | null>(null);

  const [registros, setRegistros] = useState<SacRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formRequested, setFormRequested] = useState(false);
  const [editing, setEditing] = useState<SacRegistro | null>(null);
  const [form, setForm] = useState(() => ({ ...initialForm }));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [exportErro, setExportErro] = useState<string | null>(null);

  const [historicoSac, setHistoricoSac] = useState<SacRegistro | null>(null);
  const [historicoItens, setHistoricoItens] = useState<SacInteracao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const [interacaoSac, setInteracaoSac] = useState<SacRegistro | null>(null);
  const [interacaoData, setInteracaoData] = useState("");
  const [interacaoTexto, setInteracaoTexto] = useState("");
  const [savingInteracao, setSavingInteracao] = useState(false);
  const [interacaoErro, setInteracaoErro] = useState<string | null>(null);
  const [visualizacaoSac, setVisualizacaoSac] = useState<SacRegistro | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  useEffect(() => {
    if (loadingPerm) return;
    let mounted = true;
    async function loadUser() {
      try {
        setErro(null);
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setErro("Usuário não autenticado.");
          return;
        }
        if (!mounted) return;
        setUserId(auth.user.id);
        const { data: usuarioDb, error: usuarioErr } = await supabase
          .from("users")
          .select("id, company_id, companies(nome_fantasia)")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (usuarioErr) throw usuarioErr;
        if (!mounted) return;
        setCompanyId(usuarioDb?.company_id || null);
        setCompanyNome(usuarioDb?.companies?.nome_fantasia || null);
      } catch (e) {
        console.error(e);
        if (mounted) setErro("Erro ao carregar contexto do usuário.");
      }
    }
    loadUser();
    return () => {
      mounted = false;
    };
  }, [loadingPerm]);

  useEffect(() => {
    if (!isMaster) return;
    if (masterScope.empresaSelecionada !== "all") {
      setCompanyId(masterScope.empresaSelecionada);
      const empresa = masterScope.empresasAprovadas.find(
        (e) => e.id === masterScope.empresaSelecionada
      );
      setCompanyNome(empresa?.nome_fantasia || null);
    } else {
      setCompanyId(null);
      setCompanyNome(null);
    }
  }, [isMaster, masterScope.empresaSelecionada, masterScope.empresasAprovadas]);

  useEffect(() => {
    if (!companyId) {
      setRegistros([]);
      return;
    }
    let mounted = true;
    async function loadSac() {
      try {
        setLoading(true);
        setErro(null);
        const { data, error } = await supabase
          .from("sac_controle")
          .select(
            "id, company_id, recibo, tour, data_solicitacao, motivo, contratante_pax, ok_quando, status, responsavel, prazo, created_at, updated_at"
          )
          .eq("company_id", companyId)
          .order("data_solicitacao", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (mounted) setRegistros((data || []) as SacRegistro[]);
      } catch (e) {
        console.error(e);
        if (mounted) setErro("Erro ao carregar registros de SAC.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadSac();
    return () => {
      mounted = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (showForm && !formRequested) {
      setShowForm(false);
    }
  }, [showForm, formRequested]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => {
      if (!formRequested && showForm && window.innerWidth <= 768) {
        setShowForm(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [formRequested, showForm]);

  const registrosFiltrados = useMemo(() => {
    const termoRaw = busca.trim();
    const termo = normalizeText(termoRaw);
    const filtrarStatus = statusFiltro && statusFiltro !== "all";
    const filtrarData = Boolean(dataInicio || dataFim);
    return registros.filter((r) => {
      if (filtrarStatus && (r.status || "aberto") !== statusFiltro) return false;
      if (filtrarData) {
        const data = r.data_solicitacao || "";
        if (dataInicio && (!data || data < dataInicio)) return false;
        if (dataFim && (!data || data > dataFim)) return false;
      }
      if (!termo) return true;
      const haystack = normalizeText(
        [
          r.recibo,
          r.tour,
          r.motivo,
          r.contratante_pax,
          r.ok_quando,
          r.responsavel,
          r.status,
          r.data_solicitacao,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(termo) || matchesReciboSearch(r.recibo, termoRaw);
    });
  }, [registros, busca, statusFiltro, dataInicio, dataFim]);

  function aplicarBusca() {
    setBusca(buscaInput.trim());
  }

  function abrirFormularioNovo() {
    setEditing(null);
    setForm({ ...initialForm });
    setFormError(null);
    setFormRequested(true);
    setShowForm(true);
  }

  function abrirEditar(row: SacRegistro) {
    setEditing(row);
    setForm({
      recibo: row.recibo || "",
      tour: row.tour || "",
      data_solicitacao: row.data_solicitacao || "",
      motivo: row.motivo || "",
      contratante_pax: row.contratante_pax || "",
      ok_quando: row.ok_quando || "",
      status: row.status || "aberto",
      responsavel: row.responsavel || "",
      prazo: row.prazo || "",
    });
    setFormError(null);
    setFormRequested(true);
    setShowForm(true);
  }

  function fecharFormulario() {
    setFormRequested(false);
    setShowForm(false);
    setEditing(null);
    setForm({ ...initialForm });
    setFormError(null);
  }

  async function salvarSac() {
    if (!companyId || !userId) return;
    if (!form.data_solicitacao || !form.motivo.trim()) {
      setFormError("Preencha ao menos data da solicitação e motivo.");
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      if (editing) {
        const payload = {
          recibo: form.recibo.trim() || null,
          tour: form.tour.trim() || null,
          data_solicitacao: form.data_solicitacao || null,
          motivo: form.motivo.trim() || null,
          contratante_pax: form.contratante_pax.trim() || null,
          ok_quando: form.ok_quando.trim() || null,
          status: form.status || "aberto",
          responsavel: form.responsavel.trim() || null,
          prazo: form.prazo || null,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("sac_controle")
          .update(payload)
          .eq("id", editing.id)
          .select(
            "id, company_id, recibo, tour, data_solicitacao, motivo, contratante_pax, ok_quando, status, responsavel, prazo, created_at, updated_at"
          )
          .single();
        if (error) throw error;
        const registro = data as SacRegistro;
        setRegistros((prev) =>
          prev.map((r) => (r.id === registro.id ? registro : r))
        );
      } else {
        const payload = {
          company_id: companyId,
          recibo: form.recibo.trim() || null,
          tour: form.tour.trim() || null,
          data_solicitacao: form.data_solicitacao || null,
          motivo: form.motivo.trim() || null,
          contratante_pax: form.contratante_pax.trim() || null,
          ok_quando: form.ok_quando.trim() || null,
          status: form.status || "aberto",
          responsavel: form.responsavel.trim() || null,
          prazo: form.prazo || null,
          created_by: userId,
          updated_by: userId,
        };
        const { data, error } = await supabase
          .from("sac_controle")
          .insert(payload)
          .select(
            "id, company_id, recibo, tour, data_solicitacao, motivo, contratante_pax, ok_quando, status, responsavel, prazo, created_at, updated_at"
          )
          .single();
        if (error) throw error;
        const registro = data as SacRegistro;
        setRegistros((prev) => [registro, ...prev]);
      }
      fecharFormulario();
    } catch (e) {
      console.error(e);
      setFormError("Erro ao salvar SAC.");
    } finally {
      setSaving(false);
    }
  }

  async function abrirHistorico(row: SacRegistro) {
    setHistoricoSac(row);
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from("sac_interacoes")
        .select("id, sac_id, data_interacao, descricao, created_at")
        .eq("sac_id", row.id)
        .order("data_interacao", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setHistoricoItens((data || []) as SacInteracao[]);
    } catch (e) {
      console.error(e);
      setHistoricoItens([]);
    } finally {
      setLoadingHistorico(false);
    }
  }

  function fecharHistorico() {
    setHistoricoSac(null);
    setHistoricoItens([]);
  }

  function abrirInteracao(row: SacRegistro) {
    setInteracaoSac(row);
    setInteracaoData(new Date().toISOString().slice(0, 10));
    setInteracaoTexto("");
    setInteracaoErro(null);
  }

  function fecharInteracao() {
    setInteracaoSac(null);
    setInteracaoData("");
    setInteracaoTexto("");
    setInteracaoErro(null);
  }

  async function salvarInteracao() {
    if (!interacaoSac || !userId) return;
    if (!interacaoTexto.trim()) {
      setInteracaoErro("Descreva a interação.");
      return;
    }
    try {
      setSavingInteracao(true);
      setInteracaoErro(null);
      const payload = {
        sac_id: interacaoSac.id,
        data_interacao: interacaoData || null,
        descricao: interacaoTexto.trim(),
        created_by: userId,
      };
      const { data, error } = await supabase
        .from("sac_interacoes")
        .insert(payload)
        .select("id, sac_id, data_interacao, descricao, created_at")
        .single();
      if (error) throw error;
      if (historicoSac?.id === interacaoSac.id && data) {
        setHistoricoItens((prev) => [data as SacInteracao, ...prev]);
      }
      fecharInteracao();
    } catch (e) {
      console.error(e);
      setInteracaoErro("Erro ao registrar interação.");
    } finally {
      setSavingInteracao(false);
    }
  }

  function abrirVisualizacao(row: SacRegistro) {
    setVisualizacaoSac(row);
  }

  function fecharVisualizacao() {
    setVisualizacaoSac(null);
  }

  async function excluirSac(row: SacRegistro) {
    if (typeof window !== "undefined") {
      const confirmExclusao = window.confirm(
        "Confirma a exclusão deste SAC? Essa ação não pode ser desfeita."
      );
      if (!confirmExclusao) return;
    }
    try {
      setExcluindoId(row.id);
      const { error } = await supabase.from("sac_controle").delete().eq("id", row.id);
      if (error) throw error;
      setRegistros((prev) => prev.filter((registro) => registro.id !== row.id));
    } catch (e) {
      console.error(e);
      setErro("Não foi possível excluir o SAC.");
    } finally {
      setExcluindoId(null);
    }
  }

  function formatDateISO(value?: string | null) {
    if (!value) return "";
    return value.slice(0, 10);
  }

  function buildExportRows(rows: SacRegistro[]) {
    return rows.map((r) => ({
      Recibo: r.recibo || "",
      Tour: r.tour || "",
      "Data da solicitação": formatDateISO(r.data_solicitacao),
      Motivo: r.motivo || "",
      "Contratante / PAX": r.contratante_pax || "",
      "Ok? Quando?": r.ok_quando || "",
      Status: STATUS_LABEL[r.status || "aberto"] || r.status || "Aberto",
      Responsável: r.responsavel || "",
      Prazo: formatDateISO(r.prazo),
    }));
  }

  async function exportarExcel() {
    setExportErro(null);
    if (registrosFiltrados.length === 0) {
      setExportErro("Não há dados para exportar.");
      return;
    }
    try {
      const module = await import("xlsx");
      const XLSX = (module as any).default ?? module;
      const data = buildExportRows(registrosFiltrados);
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "SAC");
      const ts = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
      XLSX.writeFile(wb, `controle-sac-${ts}.xlsx`);
    } catch (e) {
      console.error("Erro ao exportar Excel:", e);
      setExportErro("Não foi possível exportar Excel. Recarregue a página e tente novamente.");
    }
  }

  async function exportarPDF() {
    setExportErro(null);
    if (registrosFiltrados.length === 0) {
      setExportErro("Não há dados para exportar.");
      return;
    }
    const headers = [
      "Recibo",
      "Tour",
      "Data da solicitação",
      "Motivo",
      "Contratante / PAX",
      "Ok? Quando?",
      "Status",
      "Responsável",
      "Prazo",
    ];
    const rows = registrosFiltrados.map((r) => [
      r.recibo || "",
      r.tour || "",
      formatDateISO(r.data_solicitacao),
      r.motivo || "",
      r.contratante_pax || "",
      r.ok_quando || "",
      STATUS_LABEL[r.status || "aberto"] || r.status || "Aberto",
      r.responsavel || "",
      formatDateISO(r.prazo),
    ]);
    try {
      await exportTableToPDF({
        title: "Controle de SAC",
        subtitle: companyNome ? `Filial: ${companyNome}` : undefined,
        headers,
        rows,
        orientation: "landscape",
      });
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      setExportErro("Não foi possível exportar PDF. Recarregue a página e tente novamente.");
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppCard tone="config">
        Você não possui acesso ao módulo de Operação.
      </AppCard>
    );
  }

  const precisaFiltroMaster = isMaster && !companyId;

  return (
    <div className="sac-page">
      <AppToolbar
        tone="config"
        sticky
        className="list-toolbar-sticky"
        title="Controle de SAC"
        subtitle={companyNome ? `Filial: ${companyNome}` : "Gestao de atendimentos e ocorrencias."}
      >
        {isMaster && (
          <div className="form-row mobile-stack" style={{ gap: 12 }}>
            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Filial"
              value={masterScope.empresaSelecionada}
              onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)}
              options={[
                { value: "all", label: "Selecione" },
                ...masterScope.empresasAprovadas.map((empresa) => ({
                  value: empresa.id,
                  label: empresa.nome_fantasia,
                })),
              ]}
            />
          </div>
        )}
      </AppToolbar>

      {precisaFiltroMaster && (
        <AppCard tone="config" className="mb-3">
          <EmptyState
            title="Selecione uma filial"
            description="Escolha uma empresa para visualizar o controle de SAC."
          />
        </AppCard>
      )}

      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}

      {!precisaFiltroMaster && showForm && (
        <AppCard tone="info" className="mb-3" title={editing ? "Editar SAC" : "Adicionar SAC"}>
          <div className="form-row mobile-stack">
            <AppField
              wrapperClassName="form-group"
              label="Recibo"
              value={form.recibo}
              onChange={(e) => setForm((prev) => ({ ...prev, recibo: e.target.value }))}
            />
            <AppField
              wrapperClassName="form-group"
              label="Tour"
              value={form.tour}
              onChange={(e) => setForm((prev) => ({ ...prev, tour: e.target.value }))}
            />
            <AppField
              as="input"
              type="date"
              wrapperClassName="form-group"
              label="Data da solicitacao"
              value={form.data_solicitacao}
              onFocus={selectAllInputOnFocus}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, data_solicitacao: e.target.value }))
              }
            />
            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Status"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              options={STATUS_OPCOES.map((op) => ({ value: op.value, label: op.label }))}
            />
            <AppField
              wrapperClassName="form-group"
              label="Contratante / PAX"
              value={form.contratante_pax}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, contratante_pax: e.target.value }))
              }
            />
            <AppField
              wrapperClassName="form-group"
              label="Responsavel"
              value={form.responsavel}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, responsavel: e.target.value }))
              }
            />
            <AppField
              as="input"
              type="date"
              wrapperClassName="form-group"
              label="Prazo"
              value={form.prazo}
              onFocus={selectAllInputOnFocus}
              onChange={(e) => setForm((prev) => ({ ...prev, prazo: e.target.value }))}
            />
          </div>
          <AppField
            as="textarea"
            rows={3}
            wrapperClassName="form-group"
            label="Motivo"
            value={form.motivo}
            onChange={(e) => setForm((prev) => ({ ...prev, motivo: e.target.value }))}
          />
          <AppField
            wrapperClassName="form-group"
            label="Ok? Quando?"
            value={form.ok_quando}
            onChange={(e) => setForm((prev) => ({ ...prev, ok_quando: e.target.value }))}
          />
          <div className="mobile-stack-buttons" style={{ marginTop: 12 }}>
            <AppButton
              type="button"
              variant="primary"
              onClick={salvarSac}
              disabled={saving}
            >
              {saving ? "Salvando..." : "Salvar"}
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              onClick={fecharFormulario}
              disabled={saving}
            >
              Cancelar
            </AppButton>
          </div>
          {formError && <AlertMessage variant="error">{formError}</AlertMessage>}
        </AppCard>
      )}

      {!precisaFiltroMaster && !showForm && (
        <AppToolbar tone="info" sticky className="list-toolbar-sticky" title="Filtros">
          <div className="sac-toolbar-grid">
            <AppField
              wrapperClassName="form-group sac-toolbar-search"
              label="Buscar"
              placeholder="Recibo, tour, contratante, motivo..."
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
            />
            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Status"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              options={[
                { value: "all", label: "Todos" },
                ...STATUS_OPCOES.map((op) => ({ value: op.value, label: op.label })),
              ]}
            />
            <AppField
              as="input"
              type="date"
              wrapperClassName="form-group"
              label="De"
              value={dataInicio}
              onFocus={selectAllInputOnFocus}
              onChange={(e) => {
                const next = e.target.value;
                setDataInicio(next);
                setDataFim((prev) => boundDateEndISO(next, prev));
              }}
            />
            <AppField
              as="input"
              type="date"
              wrapperClassName="form-group"
              label="Ate"
              value={dataFim}
              min={dataInicio || undefined}
              onFocus={selectAllInputOnFocus}
              onChange={(e) => setDataFim(boundDateEndISO(dataInicio, e.target.value))}
            />
            <div className="form-group">
              <label className="form-label" style={{ visibility: "hidden" }}>
                Ações
              </label>
              <div className="sac-toolbar-actions mobile-stack-buttons">
                <AppButton type="button" variant="secondary" onClick={aplicarBusca}>
                  Buscar
                </AppButton>
                {podeCriar && (
                  <AppButton type="button" variant="primary" onClick={abrirFormularioNovo}>
                    Adicionar SAC
                  </AppButton>
                )}
                <AppButton type="button" variant="secondary" onClick={exportarExcel}>
                  Exportar Excel
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={exportarPDF}>
                  Exportar PDF
                </AppButton>
              </div>
            </div>
          </div>
        </AppToolbar>
      )}

      {!precisaFiltroMaster && loading && (
        <AppCard tone="config" className="mb-3">
          Carregando SAC...
        </AppCard>
      )}

      {!precisaFiltroMaster && !loading && registrosFiltrados.length === 0 && (
        <AppCard tone="config" className="mb-3">
          <EmptyState title="Nenhum registro encontrado" />
        </AppCard>
      )}

      {!precisaFiltroMaster && !loading && registrosFiltrados.length > 0 && (
        <AppCard
          tone="info"
          className="sac-card"
          title={`Controle de SAC${companyNome ? ` - ${companyNome}` : ""}`}
        >
          {exportErro && <AlertMessage variant="error">{exportErro}</AlertMessage>}
          <DataTable
            className="table-header-blue table-mobile-cards min-w-[1180px]"
            headers={
              <tr>
                <th className="min-w-[120px]">Recibo</th>
                <th className="min-w-[140px]">Tour</th>
                <th className="min-w-[150px]">Data da solicitacao</th>
                <th className="min-w-[220px]">Motivo</th>
                <th className="min-w-[200px]">Contratante / PAX</th>
                <th className="min-w-[140px]">Ok? Quando?</th>
                <th className="min-w-[120px]">Status</th>
                <th className="min-w-[140px]">Responsavel</th>
                <th className="min-w-[120px]">Prazo</th>
                <th className="th-actions">Ações</th>
              </tr>
            }
            colSpan={10}
          >
            {registrosFiltrados.map((row) => (
              <tr key={row.id}>
                <td data-label="Recibo">{row.recibo || "-"}</td>
                <td data-label="Tour">{row.tour || "-"}</td>
                <td data-label="Data da solicitacao">
                  {row.data_solicitacao
                    ? formatarDataParaExibicao(row.data_solicitacao)
                    : "-"}
                </td>
                <td data-label="Motivo">{row.motivo || "-"}</td>
                <td data-label="Contratante / PAX">{row.contratante_pax || "-"}</td>
                <td data-label="Ok? Quando?">{row.ok_quando || "-"}</td>
                <td data-label="Status">
                  {STATUS_LABEL[row.status || "aberto"] || row.status || "Aberto"}
                </td>
                <td data-label="Responsavel">{row.responsavel || "-"}</td>
                <td data-label="Prazo">
                  {row.prazo ? formatarDataParaExibicao(row.prazo) : "-"}
                </td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    className="sac-action-buttons"
                    actions={[
                      {
                        key: "view",
                        label: "Ver",
                        onClick: () => abrirVisualizacao(row),
                        icon: <i className="pi pi-eye" aria-hidden="true" />,
                      },
                      {
                        key: "history",
                        label: "Historico",
                        onClick: () => abrirHistorico(row),
                        icon: <i className="pi pi-folder-open" aria-hidden="true" />,
                      },
                      {
                        key: "interacao",
                        label: "Registrar interacao",
                        onClick: () => abrirInteracao(row),
                        icon: <i className="pi pi-file-edit" aria-hidden="true" />,
                      },
                      ...(podeEditar
                        ? [
                            {
                              key: "edit",
                              label: "Editar",
                              onClick: () => abrirEditar(row),
                              icon: <i className="pi pi-pencil" aria-hidden="true" />,
                            },
                          ]
                        : []),
                      ...(podeExcluir
                        ? [
                            {
                              key: "delete",
                              label: "Excluir",
                              onClick: () => excluirSac(row),
                              icon: <i className="pi pi-trash" aria-hidden="true" />,
                              variant: "danger",
                              disabled: excluindoId === row.id,
                            },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
      )}

      {historicoSac && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: 720, width: "92vw" }}>
            <div className="modal-header">
              <div className="modal-title">Historico SAC</div>
              <AppButton type="button" variant="secondary" onClick={fecharHistorico}>
                Fechar
              </AppButton>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 8, fontWeight: 700 }}>
                {historicoSac.contratante_pax || "Registro"} •{" "}
                {historicoSac.recibo || "Sem recibo"}
              </div>
              <DataTable
                className="table-mobile-cards"
                headers={
                  <tr>
                    <th>Data</th>
                    <th>Descricao</th>
                  </tr>
                }
                loading={loadingHistorico}
                loadingMessage="Carregando historico..."
                empty={!loadingHistorico && historicoItens.length === 0}
                emptyMessage="Nenhuma interacao registrada."
                colSpan={2}
              >
                {historicoItens.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Data">
                      {item.data_interacao
                        ? formatarDataParaExibicao(item.data_interacao)
                        : "-"}
                    </td>
                    <td data-label="Descricao">{item.descricao || "-"}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </div>
        </div>
      )}

      {interacaoSac && (
        <div className="modal-backdrop">
          <div className="modal-panel interacao-modal" style={{ maxWidth: 640, width: "92vw" }}>
            <div className="modal-header">
              <div className="modal-title">Registrar interacao</div>
              <AppButton type="button" variant="secondary" onClick={fecharInteracao}>
                Fechar
              </AppButton>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 8, fontWeight: 700 }}>
                {interacaoSac.contratante_pax || "Registro"} •{" "}
                {interacaoSac.recibo || "Sem recibo"}
              </div>
              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group"
                label="Data"
                value={interacaoData}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => setInteracaoData(e.target.value)}
              />
              <AppField
                as="textarea"
                rows={4}
                wrapperClassName="form-group"
                label="Descricao"
                value={interacaoTexto}
                onChange={(e) => setInteracaoTexto(e.target.value)}
              />
              {interacaoErro && <AlertMessage variant="error">{interacaoErro}</AlertMessage>}
            </div>
            <div className="modal-footer">
              <AppButton type="button" variant="secondary" onClick={fecharInteracao}>
                Cancelar
              </AppButton>
              <AppButton
                type="button"
                variant="primary"
                onClick={salvarInteracao}
                disabled={savingInteracao}
              >
                {savingInteracao ? "Salvando..." : "Salvar"}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {visualizacaoSac && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: 660, width: "92vw" }}>
            <div className="modal-header">
              <div className="modal-title">Detalhes do SAC</div>
              <AppButton type="button" variant="secondary" onClick={fecharVisualizacao}>
                Fechar
              </AppButton>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 8, fontWeight: 700 }}>
                {visualizacaoSac.contratante_pax || "Registro"} •{" "}
                {visualizacaoSac.recibo || "Sem recibo"}
              </div>
              <div
                className="form-row"
                style={{ gap: 12, marginBottom: 12, flexWrap: "wrap" }}
              >
                <div className="form-group">
                  <label className="form-label">Recibo</label>
                  <div>{visualizacaoSac.recibo || "-"}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tour</label>
                  <div>{visualizacaoSac.tour || "-"}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Data da solicitacao</label>
                  <div>
                    {visualizacaoSac.data_solicitacao
                      ? formatarDataParaExibicao(visualizacaoSac.data_solicitacao)
                      : "-"}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <div>
                    {STATUS_LABEL[visualizacaoSac.status || "aberto"] ||
                      visualizacaoSac.status ||
                      "Aberto"}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Responsavel</label>
                  <div>{visualizacaoSac.responsavel || "-"}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Prazo</label>
                  <div>
                    {visualizacaoSac.prazo
                      ? formatarDataParaExibicao(visualizacaoSac.prazo)
                      : "-"}
                  </div>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Contratante / PAX</label>
                <div>{visualizacaoSac.contratante_pax || "-"}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Motivo</label>
                <div>{visualizacaoSac.motivo || "-"}</div>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Ok? Quando?</label>
                <div>{visualizacaoSac.ok_quando || "-"}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
