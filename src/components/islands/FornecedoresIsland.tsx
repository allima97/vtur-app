import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useCrudResource } from "../../lib/useCrudResource";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type Fornecedor = {
  id: string;
  nome_completo: string | null;
  nome_fantasia: string | null;
  localizacao: "brasil" | "exterior";
  cnpj: string | null;
  cep: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  whatsapp: string | null;
  telefone_emergencia: string | null;
  responsavel: string | null;
  tipo_faturamento: string | null;
  principais_servicos: string | null;
  created_at: string | null;
};

type FornecedorForm = Omit<Fornecedor, "id" | "created_at">;

type CidadeBusca = {
  id: string;
  nome: string;
  subdivisao_nome: string | null;
  pais_nome?: string | null;
  subdivisao_id?: string | null;
};

const LOCALIZACAO_OPCOES = [
  { value: "brasil", label: "Brasil" },
  { value: "exterior", label: "Exterior" },
];

const TIPO_FATURAMENTO_OPCOES = [
  { value: "pre_pago", label: "Pré-Pago" },
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
];

const INITIAL_FORM: FornecedorForm = {
  nome_completo: "",
  nome_fantasia: "",
  localizacao: "brasil",
  cnpj: "",
  cep: "",
  cidade: "",
  estado: "",
  telefone: "",
  whatsapp: "",
  telefone_emergencia: "",
  responsavel: "",
  tipo_faturamento: "pre_pago",
  principais_servicos: "",
};

function formatFaturamento(value: string | null) {
  const option = TIPO_FATURAMENTO_OPCOES.find((opt) => opt.value === value);
  return option ? option.label : value || "-";
}

function formatLocalizacao(value: string | null) {
  if (value === "brasil") return "Brasil";
  if (value === "exterior") return "Exterior";
  return value || "-";
}

function normalizeSearchValue(value?: string | null) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatTelefoneValue(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatCidadeLabel(cidade: CidadeBusca) {
  return cidade.subdivisao_nome ? `${cidade.nome} (${cidade.subdivisao_nome})` : cidade.nome;
}

export default function FornecedoresIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Fornecedores");
  const podeCriar = can("Fornecedores", "create");
  const podeEditar = can("Fornecedores", "edit");
  const podeExcluir = can("Fornecedores", "admin");
  const {
    items: fornecedores,
    loading,
    saving: salvando,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load: loadFornecedores,
    create,
    update,
    remove,
  } = useCrudResource<Fornecedor>({
    table: "fornecedores",
    select:
      "id, nome_completo, nome_fantasia, localizacao, cidade, estado, telefone, whatsapp, telefone_emergencia, responsavel, tipo_faturamento, principais_servicos, created_at",
  });
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState<FornecedorForm>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [fornecedorParaExcluir, setFornecedorParaExcluir] = useState<Fornecedor | null>(null);
  const [busca, setBusca] = useState("");
  const [cidadeBusca, setCidadeBusca] = useState("");
  const [resultadosCidade, setResultadosCidade] = useState<CidadeBusca[]>([]);
  const [mostrarSugestoesCidade, setMostrarSugestoesCidade] = useState(false);
  const [buscandoCidade, setBuscandoCidade] = useState(false);
  const [erroCidadeBusca, setErroCidadeBusca] = useState<string | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    let isMounted = true;

    async function resolveCompany() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;
        const user =
          sessionUser || (await supabase.auth.getUser()).data?.user || null;
        if (!user || !isMounted) return;

        const { data, error } = await supabase
          .from("users")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        if (!isMounted) return;
        if (error) {
          console.error("Erro ao buscar company_id dos fornecedores:", error);
          return;
        }
        setCompanyId(data?.company_id || null);
      } catch (error) {
        console.error("Erro ao determinar company_id dos fornecedores:", error);
      }
    }

    resolveCompany();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    carregarFornecedores();
  }, [companyId]);

  async function carregarFornecedores() {
    if (!companyId) return;
    const { error } = await loadFornecedores({
      filter: (query) => query.eq("company_id", companyId),
      order: { column: "created_at", ascending: false },
      errorMessage: "Erro ao carregar fornecedores.",
    });
    if (error) return;
  }

  function validarFormulario() {
    if (!form.nome_completo.trim()) return "Informe o nome completo.";
    if (!form.nome_fantasia.trim()) return "Informe o nome fantasia.";
    if (!form.cidade.trim()) return "Informe a cidade.";
    if (!form.estado.trim()) return "Informe o estado.";
    if (!form.telefone.trim()) return "Informe o telefone.";
    if (!form.whatsapp.trim()) return "Informe o WhatsApp.";
    if (!form.telefone_emergencia.trim()) return "Informe o telefone de emergência.";
    if (!form.responsavel.trim()) return "Informe o responsável.";
    if (!form.tipo_faturamento) return "Escolha o tipo de faturamento.";
    if (!form.principais_servicos.trim()) return "Descreva os principais serviços.";
    if (form.localizacao === "brasil" && !form.cnpj.trim()) return "Informe o CNPJ.";
    if (form.localizacao === "brasil" && !form.cep.trim()) return "Informe o CEP.";
    return null;
  }

  function abrirFormularioFornecedor() {
    setForm(INITIAL_FORM);
    setFormError(null);
    setEditandoId(null);
    setCidadeBusca("");
    setResultadosCidade([]);
    setMostrarSugestoesCidade(false);
    setErroCidadeBusca(null);
    setMostrarFormulario(true);
  }

  function fecharFormularioFornecedor() {
    setForm(INITIAL_FORM);
    setFormError(null);
    setEditandoId(null);
    setCidadeBusca("");
    setResultadosCidade([]);
    setMostrarSugestoesCidade(false);
    setErroCidadeBusca(null);
    setMostrarFormulario(false);
  }

  function iniciarEdicaoFornecedor(fornecedor: Fornecedor) {
    setForm({
      nome_completo: fornecedor.nome_completo || "",
      nome_fantasia: fornecedor.nome_fantasia || "",
      localizacao: fornecedor.localizacao || "brasil",
      cnpj: fornecedor.cnpj || "",
      cep: fornecedor.cep || "",
      cidade: fornecedor.cidade || "",
      estado: fornecedor.estado || "",
      telefone: fornecedor.telefone || "",
      whatsapp: fornecedor.whatsapp || "",
      telefone_emergencia: fornecedor.telefone_emergencia || "",
      responsavel: fornecedor.responsavel || "",
      tipo_faturamento: fornecedor.tipo_faturamento || "pre_pago",
      principais_servicos: fornecedor.principais_servicos || "",
    });
    setFormError(null);
    setEditandoId(fornecedor.id);
    setCidadeBusca(
      fornecedor.cidade
        ? fornecedor.estado
          ? `${fornecedor.cidade} (${fornecedor.estado})`
          : fornecedor.cidade
        : ""
    );
    setResultadosCidade([]);
    setMostrarSugestoesCidade(false);
    setErroCidadeBusca(null);
    setMostrarFormulario(true);
  }

  const podeSalvar = podeCriar || podeEditar;
  const termosBusca = normalizeSearchValue(busca);
  const fornecedoresFiltrados = useMemo(() => {
    if (!termosBusca) return fornecedores;
    return fornecedores.filter((f) => {
      const alvo = `${f.nome_fantasia || ""} ${f.nome_completo || ""}`.trim();
      return normalizeSearchValue(alvo).includes(termosBusca);
    });
  }, [fornecedores, termosBusca]);
  const fornecedoresExibidos = useMemo(() => {
    return busca.trim() ? fornecedoresFiltrados : fornecedoresFiltrados.slice(0, 5);
  }, [fornecedoresFiltrados, busca]);
  const resumoLista = busca.trim()
    ? `${fornecedoresFiltrados.length} fornecedor(es) encontrados para a busca atual.`
    : `${fornecedores.length} fornecedor(es) cadastrados. Exibindo ${fornecedoresExibidos.length} item(ns) na listagem inicial.`;

  useEffect(() => {
    if (!mostrarSugestoesCidade) return;
    if (cidadeBusca.trim().length < 2) {
      setResultadosCidade([]);
      setErroCidadeBusca(null);
      setBuscandoCidade(false);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        setBuscandoCidade(true);
        const { data, error } = await supabase.rpc("buscar_cidades", {
          q: cidadeBusca.trim(),
          limite: 10,
        });
        if (controller.signal.aborted) return;
        if (error) {
          console.error("Erro ao buscar cidades:", error);
          setErroCidadeBusca("Erro ao buscar cidades (RPC). Tentando fallback...");
          const { data: dataFallback, error: errorFallback } = await supabase
            .from("cidades")
            .select("id, nome, subdivisao_nome")
            .ilike("nome", `%${cidadeBusca.trim()}%`)
            .order("nome");
          if (errorFallback) {
            console.error("Erro no fallback de cidades:", errorFallback);
            setErroCidadeBusca("Erro ao buscar cidades.");
          } else {
            setResultadosCidade((dataFallback as CidadeBusca[]) || []);
            setErroCidadeBusca(null);
          }
        } else {
          setResultadosCidade((data as CidadeBusca[]) || []);
          setErroCidadeBusca(null);
        }
      } finally {
        if (!controller.signal.aborted) setBuscandoCidade(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [cidadeBusca, mostrarSugestoesCidade]);

  function selecionarCidade(cidade: CidadeBusca) {
    setForm((prev) => ({
      ...prev,
      cidade: cidade.nome || "",
      estado: cidade.subdivisao_nome || "",
    }));
    setCidadeBusca(formatCidadeLabel(cidade));
    setMostrarSugestoesCidade(false);
    setResultadosCidade([]);
    setErroCidadeBusca(null);
  }

  function handleCidadeChange(valor: string) {
    setCidadeBusca(valor);
    setMostrarSugestoesCidade(true);
    if (form.cidade || form.estado) {
      setForm((prev) => ({ ...prev, cidade: "", estado: "" }));
    }
  }

  function handleCidadeBlur() {
    setTimeout(() => {
      setMostrarSugestoesCidade(false);
      const texto = normalizeSearchValue(cidadeBusca);
      const atual = form.cidade
        ? form.estado
          ? `${form.cidade} (${form.estado})`
          : form.cidade
        : "";
      if (texto && normalizeSearchValue(atual) === texto) {
        setErroCidadeBusca(null);
        return;
      }
      const match = resultadosCidade.find((cidade) => {
        const label = formatCidadeLabel(cidade);
        return (
          normalizeSearchValue(label) === texto ||
          normalizeSearchValue(cidade.nome) === texto
        );
      });
      if (match) {
        selecionarCidade(match);
        return;
      }
      if (texto) {
        setErroCidadeBusca("Selecione uma cidade da lista.");
      } else {
        setErroCidadeBusca(null);
      }
      setForm((prev) => ({ ...prev, cidade: "", estado: "" }));
    }, 150);
  }

  async function salvarFornecedor() {
    if (!companyId) {
      setFormError("Não foi possível determinar sua empresa.");
      return;
    }
    if (!podeSalvar) {
      setFormError("Sua permissão não permite salvar fornecedores.");
      return;
    }
    const erroValidacao = validarFormulario();
    if (erroValidacao) {
      setFormError(erroValidacao);
      return;
    }
    try {
      setErro(null);
      setFormError(null);
      const payload = {
        ...form,
        company_id: companyId,
        tipo_faturamento: form.tipo_faturamento,
        principais_servicos: form.principais_servicos.trim(),
      };
      const { error } = editandoId
        ? await update(editandoId, payload, {
            errorMessage: "Erro ao atualizar fornecedor.",
          })
        : await create(payload, {
            errorMessage: "Erro ao criar fornecedor.",
          });
      if (error) {
        setFormError(editandoId ? "Erro ao atualizar fornecedor." : "Erro ao criar fornecedor.");
        return;
      }
      setForm(INITIAL_FORM);
      await carregarFornecedores();
      fecharFormularioFornecedor();
    } catch (error) {
      console.error(error);
      setFormError(editandoId ? "Erro ao atualizar fornecedor." : "Erro ao criar fornecedor.");
    }
  }

  async function excluirFornecedor(fornecedor: Fornecedor) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir fornecedores.", "error");
      return;
    }

    try {
      setErro(null);

      const { count, error: countError } = await supabase
        .from("produtos")
        .select("id", { count: "exact", head: true })
        .eq("fornecedor_id", fornecedor.id);
      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        setErro("Não é possível excluir fornecedor com produtos vinculados.");
        return;
      }

      const { error } = await remove(fornecedor.id, {
        errorMessage: "Nao foi possivel excluir o fornecedor.",
      });
      if (error) return;

      await carregarFornecedores();
    } catch (error) {
      console.error(error);
      setErro("Nao foi possivel excluir o fornecedor.");
    }
  }

  function solicitarExclusao(fornecedor: Fornecedor) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir fornecedores.", "error");
      return;
    }
    setFornecedorParaExcluir(fornecedor);
  }

  async function confirmarExclusaoFornecedor() {
    if (!fornecedorParaExcluir) return;
    await excluirFornecedor(fornecedorParaExcluir);
    setFornecedorParaExcluir(null);
  }

  if (loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Voce nao possui acesso ao modulo de Cadastros.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap fornecedores-page">
        {!mostrarFormulario && (
          <AppToolbar
            sticky
            tone="config"
            className="mb-3 list-toolbar-sticky"
            title="Fornecedores"
            subtitle={resumoLista}
            actions={
              podeSalvar ? (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={abrirFormularioFornecedor}
                  disabled={mostrarFormulario}
                >
                  Adicionar fornecedor
                </AppButton>
              ) : undefined
            }
          >
            <div className="vtur-form-grid vtur-form-grid-2">
              <AppField
                label="Buscar fornecedor"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome fantasia ou contato..."
                caption="Consulte parceiros comerciais por nome completo, fantasia ou responsavel."
              />
            </div>
          </AppToolbar>
        )}

        {mostrarFormulario && (
          <AppCard
            className="mb-3"
            tone="info"
            title={editandoId ? "Editar fornecedor" : "Novo fornecedor"}
            subtitle="Centralize contato, faturamento, localizacao e servicos do parceiro em um unico cadastro."
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void salvarFornecedor();
              }}
            >
              <div className="vtur-choice-grid">
                {LOCALIZACAO_OPCOES.map((opcao) => (
                  <AppButton
                    key={opcao.value}
                    type="button"
                    variant={form.localizacao === opcao.value ? "primary" : "secondary"}
                    className="vtur-choice-button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        localizacao: opcao.value as "brasil" | "exterior",
                      }))
                    }
                    disabled={!podeSalvar}
                  >
                    <span className="vtur-choice-button-content">
                      <span className="vtur-choice-button-title">{opcao.label}</span>
                      <span className="vtur-choice-button-caption">
                        {opcao.value === "brasil"
                          ? "Usa CNPJ, CEP e cidade vinculada ao cadastro nacional."
                          : "Permite cadastro internacional sem obrigar documentos brasileiros."}
                      </span>
                    </span>
                  </AppButton>
                ))}
              </div>

              <div className="vtur-inline-note">
                Defina a abrangencia do parceiro para orientar os campos obrigatorios do cadastro.
              </div>

              <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                <AppField
                  label="Nome completo"
                  value={form.nome_completo}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome_completo: e.target.value }))}
                  disabled={!podeSalvar}
                  placeholder="Razao social"
                />
                <AppField
                  label="Nome fantasia"
                  value={form.nome_fantasia}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome_fantasia: e.target.value }))}
                  disabled={!podeSalvar}
                  placeholder="Nome comercial"
                />
              </div>

              {form.localizacao === "brasil" && (
                <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                  <AppField
                    label="CNPJ"
                    value={form.cnpj}
                    onChange={(e) => setForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                    disabled={!podeSalvar}
                    placeholder="00.000.000/0000-00"
                  />
                  <AppField
                    label="CEP"
                    value={form.cep}
                    onChange={(e) => setForm((prev) => ({ ...prev, cep: e.target.value }))}
                    disabled={!podeSalvar}
                    placeholder="00000-000"
                  />
                </div>
              )}

              <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                <div className="vtur-city-picker">
                  <AppField
                    label="Cidade"
                    value={cidadeBusca}
                    onChange={(e) => handleCidadeChange(e.target.value)}
                    onFocus={() => setMostrarSugestoesCidade(true)}
                    onBlur={handleCidadeBlur}
                    disabled={!podeSalvar}
                    placeholder="Buscar cidade..."
                    caption={
                      buscandoCidade
                        ? "Buscando cidades..."
                        : erroCidadeBusca || "Selecione uma cidade valida para preencher a subdivisao automaticamente."
                    }
                    validation={erroCidadeBusca && !buscandoCidade ? erroCidadeBusca : undefined}
                  />
                  {mostrarSugestoesCidade && (
                    <div className="vtur-city-dropdown">
                      {resultadosCidade.length === 0 && !buscandoCidade && cidadeBusca.trim().length >= 2 && (
                        <div className="vtur-city-helper">Nenhuma cidade encontrada.</div>
                      )}
                      {resultadosCidade.map((cidade) => {
                        const label = formatCidadeLabel(cidade);
                        return (
                          <AppButton
                            key={cidade.id}
                            type="button"
                            variant={form.cidade === cidade.nome ? "primary" : "secondary"}
                            className="vtur-city-option"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selecionarCidade(cidade);
                            }}
                          >
                            <span className="vtur-choice-button-content">
                              <span className="vtur-choice-button-title">{label}</span>
                              {cidade.pais_nome ? (
                                <span className="vtur-choice-button-caption">{cidade.pais_nome}</span>
                              ) : null}
                            </span>
                          </AppButton>
                        );
                      })}
                    </div>
                  )}
                </div>
                <AppField
                  label="Estado"
                  value={form.estado}
                  readOnly
                  disabled
                  placeholder="UF / regiao"
                  caption="Preenchido automaticamente a partir da cidade selecionada."
                />
              </div>

              <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 16 }}>
                <AppField
                  label="Telefone"
                  value={form.telefone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, telefone: formatTelefoneValue(e.target.value) }))
                  }
                  disabled={!podeSalvar}
                  placeholder="(00) 0000-0000"
                />
                <AppField
                  label="WhatsApp"
                  value={form.whatsapp}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, whatsapp: formatTelefoneValue(e.target.value) }))
                  }
                  disabled={!podeSalvar}
                  placeholder="+55 00 00000-0000"
                />
                <AppField
                  label="Telefone emergencia"
                  value={form.telefone_emergencia}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      telefone_emergencia: formatTelefoneValue(e.target.value),
                    }))
                  }
                  disabled={!podeSalvar}
                  placeholder="Contato alternativo"
                />
              </div>

              <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                <AppField
                  label="Responsavel"
                  value={form.responsavel}
                  onChange={(e) => setForm((prev) => ({ ...prev, responsavel: e.target.value }))}
                  disabled={!podeSalvar}
                  placeholder="Pessoa de contato"
                />
                <AppField
                  as="select"
                  label="Tipo de faturamento"
                  value={form.tipo_faturamento}
                  onChange={(e) => setForm((prev) => ({ ...prev, tipo_faturamento: e.target.value }))}
                  disabled={!podeSalvar}
                  options={TIPO_FATURAMENTO_OPCOES}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <AppField
                  as="textarea"
                  label="Principais servicos"
                  value={form.principais_servicos}
                  onChange={(e) => setForm((prev) => ({ ...prev, principais_servicos: e.target.value }))}
                  disabled={!podeSalvar}
                  placeholder="Descreva servicos, especialidades, janelas de atendimento e observacoes relevantes"
                  rows={4}
                />
              </div>

              {formError && (
                <AlertMessage variant="error" className="mt-3">
                  {formError}
                </AlertMessage>
              )}

              <div className="vtur-form-actions">
                <AppButton
                  type="submit"
                  variant="primary"
                  disabled={salvando || !podeSalvar}
                  loading={salvando}
                >
                  {salvando ? "Salvando..." : editandoId ? "Salvar alteracoes" : "Salvar fornecedor"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={fecharFormularioFornecedor}
                  disabled={salvando}
                >
                  Cancelar
                </AppButton>
              </div>
            </form>
          </AppCard>
        )}

        {!mostrarFormulario && (
          <>
            {erro && (
              <AlertMessage variant="error" className="mb-3">
                {erro}
              </AlertMessage>
            )}
            <AppCard
              tone="config"
              title="Base de fornecedores"
              subtitle="Acompanhe parceiros comerciais, contatos e condicoes operacionais com leitura rapida."
            >
              <DataTable
                className="fornecedores-table table-mobile-cards"
                containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
                headers={
                  <tr>
                    <th>Nome fantasia</th>
                    <th>Local</th>
                    <th>Faturamento</th>
                    <th>Telefone</th>
                    <th>WhatsApp</th>
                    <th>Telefone emergencia</th>
                    <th>Servicos</th>
                    <th className="th-actions" style={{ textAlign: "center" }}>Ações</th>
                  </tr>
                }
                loading={loading}
                loadingMessage="Carregando fornecedores..."
                empty={!loading && fornecedoresExibidos.length === 0}
                emptyMessage={
                  <EmptyState
                    title="Nenhum fornecedor encontrado"
                    description={
                      busca.trim()
                        ? "Ajuste os filtros para localizar parceiros ja cadastrados."
                        : "Comece adicionando o primeiro fornecedor para organizar a rede operacional."
                    }
                    action={
                      podeSalvar ? (
                        <AppButton type="button" variant="primary" onClick={abrirFormularioFornecedor}>
                          Adicionar fornecedor
                        </AppButton>
                      ) : undefined
                    }
                  />
                }
                colSpan={8}
              >
                {fornecedoresExibidos.map((fornecedor) => (
                  <tr key={fornecedor.id}>
                    <td data-label="Nome fantasia">
                      {fornecedor.nome_fantasia || fornecedor.nome_completo || "-"}
                    </td>
                    <td data-label="Local">
                      {formatLocalizacao(fornecedor.localizacao)}
                      {fornecedor.cidade ? ` - ${fornecedor.cidade}` : ""}
                      {fornecedor.estado ? `/${fornecedor.estado}` : ""}
                    </td>
                    <td data-label="Faturamento">
                      {formatFaturamento(fornecedor.tipo_faturamento)}
                    </td>
                    <td data-label="Telefone">{fornecedor.telefone || "-"}</td>
                    <td data-label="WhatsApp">{fornecedor.whatsapp || "-"}</td>
                    <td data-label="Telefone emergência">{fornecedor.telefone_emergencia || "-"}</td>
                    <td data-label="Serviços" style={{ maxWidth: 240, whiteSpace: "normal" }}>
                      {fornecedor.principais_servicos
                        ? fornecedor.principais_servicos.length > 80
                          ? `${fornecedor.principais_servicos.slice(0, 80)}...`
                          : fornecedor.principais_servicos
                        : "-"}
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <TableActions
                        show={podeSalvar || podeExcluir}
                        actions={[
                          ...(podeSalvar
                            ? [
                                {
                                  key: "edit",
                                  label: "Editar",
                                  onClick: () => iniciarEdicaoFornecedor(fornecedor),
                                  variant: "ghost" as const,
                                },
                              ]
                            : []),
                          ...(podeExcluir
                            ? [
                                {
                                  key: "delete",
                                  label: excluindoId === fornecedor.id ? "Excluindo..." : "Excluir",
                                  onClick: () => solicitarExclusao(fornecedor),
                                  variant: "danger" as const,
                                  disabled: excluindoId === fornecedor.id,
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
          </>
        )}
        <ConfirmDialog
          open={Boolean(fornecedorParaExcluir)}
          title="Excluir fornecedor"
          message={`Tem certeza que deseja excluir ${fornecedorParaExcluir?.nome_fantasia || fornecedorParaExcluir?.nome_completo || "este fornecedor"}?`}
          confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(excluindoId)}
          onCancel={() => setFornecedorParaExcluir(null)}
          onConfirm={confirmarExclusaoFornecedor}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
