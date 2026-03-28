import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useCrudResource } from "../../lib/useCrudResource";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import ConfirmDialog from "../ui/ConfirmDialog";
import { registrarLog } from "../../lib/logs";
import { formatDateTimeBR, formatNumberBR } from "../../lib/format";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import { toISODateLocal } from "../../lib/dateTime";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

const MOEDA_SUGESTOES = ["R$", "USD", "EUR"];

type CambioRecord = {
  id: string;
  moeda: string;
  data: string;
  valor: number | null;
  created_at: string | null;
  owner_user_id: string | null;
  owner_user?: {
    nome_completo: string | null;
  };
};

type FormState = {
  moeda: string;
  data: string;
  valor: string;
};

const agoraData = () => toISODateLocal(new Date());
const buildInitialForm = (): FormState => ({ moeda: "USD", data: agoraData(), valor: "" });

function parseDecimal(value: string) {
  if (!value || typeof value !== "string") return null;
  const cleaned = value.replace(/\./g, "").replace(",", ".").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatValorNumber(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return formatNumberBR(value, 6);
}

export default function ParametrosCambiosIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Cambios") || can("Parametros");
  const podeEscrever = can("Cambios", "create") || can("Parametros", "create");
  const podeExcluir = can("Cambios", "edit") || can("Parametros", "edit");
  const {
    items: cambios,
    setItems: setCambios,
    loading: loadingCambios,
    saving: salvando,
    error: erro,
    setError: setErro,
    load: loadCambios,
    create,
    update,
    remove,
  } = useCrudResource<CambioRecord>({
    table: "parametros_cambios",
    select:
      "id, moeda, data, valor, created_at, owner_user_id, owner_user:owner_user_id (nome_completo)",
  });
  const [form, setForm] = useState<FormState>(buildInitialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [cambioParaExcluir, setCambioParaExcluir] = useState<CambioRecord | null>(null);

  const loading = loadingCambios || loadingAuth;

  const resetForm = useCallback(() => {
    setForm(buildInitialForm());
    setEditingId(null);
  }, []);

  const abrirFormulario = useCallback(() => {
    resetForm();
    setErro(null);
    setSucesso(null);
    setMostrarFormulario(true);
  }, [resetForm]);

  const fecharFormulario = useCallback(() => {
    resetForm();
    setErro(null);
    setSucesso(null);
    setMostrarFormulario(false);
  }, [resetForm]);

  const carregar = useCallback(async () => {
    setErro(null);
    setSucesso(null);
    setLoadingAuth(true);
    try {
      const { data: session } = await supabase.auth.getUser();
      const currentUserId = session?.user?.id || null;
      setUserId(currentUserId);

      if (!currentUserId) {
        setErro("Usuário não autenticado.");
        setCompanyId(null);
        setCambios([]);
        return;
      }

      const { data: usuario, error: usuarioErr } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", currentUserId)
        .maybeSingle();

      if (usuarioErr) throw usuarioErr;

      const companyValue = usuario?.company_id || null;
      setCompanyId(companyValue);

      if (!companyValue) {
        setErro("Usuário não está vinculado a uma empresa.");
        setCambios([]);
        return;
      }

      const { error } = await loadCambios({
        filter: (query) =>
          query
            .eq("company_id", companyValue)
            .order("data", { ascending: false })
            .order("created_at", { ascending: false }),
        errorMessage: "Não foi possível carregar os câmbios.",
      });
      if (error) return;
    } catch (err) {
      console.error(err);
      setErro("Não foi possível carregar os câmbios.");
    } finally {
      setLoadingAuth(false);
    }
  }, [loadCambios, setCambios, setErro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleFormChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!podeEscrever || !companyId) return;
    setErro(null);
    setSucesso(null);

    const valorNumero = parseDecimal(form.valor);
    const moeda = form.moeda.trim();

    if (!moeda) {
      setErro("Informe a moeda.");
      return;
    }

    if (!form.data) {
      setErro("Informe a data.");
      return;
    }

    if (valorNumero == null) {
      setErro("Informe um valor válido para o câmbio.");
      return;
    }

    try {
      const payload = {
        company_id: companyId,
        owner_user_id: userId,
        moeda,
        data: form.data,
        valor: valorNumero,
      };
      const { error } = editingId
        ? await update(editingId, payload, {
            errorMessage: "Não foi possível salvar o câmbio.",
          })
        : await create(payload, {
            errorMessage: "Não foi possível salvar o câmbio.",
          });
      if (error) return;

      setSucesso(editingId ? "Câmbio atualizado com sucesso." : "Câmbio salvo com sucesso.");
      resetForm();
      setMostrarFormulario(false);
      await carregar();
      await registrarLog({
        user_id: userId,
        acao: editingId ? "parametros_cambios_atualizacao" : "parametros_cambios_cadastro",
        modulo: "Parametros",
        detalhes: {
          id: editingId || null,
          moeda,
          data: form.data,
          valor: valorNumero
        }
      });
    } catch (err) {
      console.error(err);
      setErro("Não foi possível salvar o câmbio.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!podeExcluir) return;
    setErro(null);
    setSucesso(null);
    try {
      const { error } = await remove(id, {
        errorMessage: "Não foi possível excluir o câmbio.",
      });
      if (error) return;
      setSucesso("Câmbio excluído.");
      await carregar();
      await registrarLog({
        user_id: userId,
        acao: "parametros_cambios_exclusao",
        modulo: "Parametros",
        detalhes: { id }
      });
    } catch (err) {
      console.error(err);
      setErro("Não foi possível excluir o câmbio.");
    }
  };

  const solicitarExclusao = (cambio: CambioRecord) => {
    if (!podeExcluir) return;
    setCambioParaExcluir(cambio);
  };

  const confirmarExclusao = async () => {
    if (!cambioParaExcluir) return;
    await handleDelete(cambioParaExcluir.id);
    setCambioParaExcluir(null);
  };

  const handleEdit = (cambio: CambioRecord) => {
    setEditingId(cambio.id);
    setForm({
      moeda: cambio.moeda,
      data: cambio.data,
      valor: cambio.valor != null ? cambio.valor.toFixed(2) : "",
    });
    setSucesso(null);
    setErro(null);
    setMostrarFormulario(true);
  };

  const tituloTabela = useMemo(() => {
    if (!cambios.length) return "Nenhum câmbio cadastrado.";
    return `${cambios.length} câmbio(s) registrado(s).`;
  }, [cambios]);

  if (loading || loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return <AppCard tone="config">Acesso ao modulo de Parametros bloqueado.</AppCard>;
  }

  const cambiosExibidos = cambios.slice(0, 5);

  return (
    <section className="cambios-page">
      <AppCard
        tone="config"
        className="mb-3"
        title="Cambios"
        subtitle="Cadastre o valor de cambio aplicado em cada dia."
      />

      {!mostrarFormulario && (
        <AppCard tone="config">
          {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
          {sucesso && <AlertMessage variant="success">{sucesso}</AlertMessage>}

          {podeEscrever && (
            <div className="mb-3">
              <AppButton
                type="button"
                variant="primary"
                onClick={abrirFormulario}
                disabled={!companyId}
              >
                Adicionar cambio
              </AppButton>
            </div>
          )}

          {!companyId && (
            <AlertMessage variant="error">
              Voce precisa estar vinculado a uma empresa para cadastrar cambios.
            </AlertMessage>
          )}
          {!podeEscrever && (
            <div className="vtur-warning-note">
              Voce nao tem permissao para cadastrar ou remover cambios. Solicite acesso ao
              administrador.
            </div>
          )}

          <div className="mt-6 vtur-scroll-y-65">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
              <strong>{tituloTabela}</strong>
              <AppButton
                type="button"
                variant="secondary"
                onClick={carregar}
                disabled={loading}
              >
                Recarregar
              </AppButton>
            </div>
            {cambiosExibidos.length === 0 ? (
              <EmptyState title="Nenhum cambio cadastrado ainda" />
            ) : (
              <DataTable
                className="table-header-blue table-mobile-cards min-w-[600px]"
                headers={
                  <tr>
                    <th>Data</th>
                    <th>Moeda</th>
                    <th>Valor (R$)</th>
                    <th>Cadastrado por</th>
                    <th>Criado em</th>
                    {podeExcluir && <th className="th-actions">Ações</th>}
                  </tr>
                }
                colSpan={podeExcluir ? 6 : 5}
              >
                {cambiosExibidos.map((cambio) => (
                  <tr key={cambio.id}>
                    <td data-label="Data">{cambio.data}</td>
                    <td data-label="Moeda">{cambio.moeda}</td>
                    <td data-label="Valor (R$)">{formatValorNumber(cambio.valor)}</td>
                    <td data-label="Cadastrado por">
                      {cambio.owner_user?.nome_completo || cambio.owner_user_id || "—"}
                    </td>
                    <td data-label="Criado em">
                      {cambio.created_at
                        ? formatDateTimeBR(cambio.created_at)
                        : "—"}
                    </td>
                    {podeExcluir && (
                      <td className="th-actions" data-label="Ações">
                        <div className="action-buttons vtur-table-actions">
                          {podeEscrever && (
                            <AppButton
                              type="button"
                              variant="ghost"
                              className="vtur-table-action"
                              title="Editar cambio"
                              aria-label="Editar câmbio"
                              onClick={() => handleEdit(cambio)}
                            >
                              <i className="pi pi-pencil" aria-hidden="true" />
                            </AppButton>
                          )}
                          <AppButton
                            type="button"
                            variant="danger"
                            className="vtur-table-action"
                            title="Excluir cambio"
                            aria-label="Excluir câmbio"
                            onClick={() => solicitarExclusao(cambio)}
                          >
                            <i className="pi pi-trash" aria-hidden="true" />
                          </AppButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        </AppCard>
      )}

      {mostrarFormulario && (
        <AppCard tone="config">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-row">
              <AppField
                as="input"
                type="text"
                wrapperClassName="form-group"
                label="Moeda"
                list="moeda-sugestoes"
                value={form.moeda}
                onChange={(event) => handleFormChange("moeda", event.target.value)}
                disabled={!podeEscrever}
              />
              <datalist id="moeda-sugestoes">
                {MOEDA_SUGESTOES.map((moeda) => (
                  <option key={moeda} value={moeda} />
                ))}
              </datalist>

              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group"
                label="Data"
                value={form.data}
                onFocus={selectAllInputOnFocus}
                onChange={(event) => handleFormChange("data", event.target.value)}
                disabled={!podeEscrever}
              />

              <AppField
                as="input"
                type="text"
                wrapperClassName="form-group"
                label="Valor (R$)"
                inputMode="decimal"
                placeholder="Ex: 6,50"
                value={form.valor}
                onChange={(event) => handleFormChange("valor", event.target.value)}
                disabled={!podeEscrever}
              />
            </div>

            <div className="mobile-stack-buttons" style={{ marginTop: 8 }}>
              <AppButton
                type="submit"
                variant="primary"
                disabled={!podeEscrever || salvando || !companyId}
              >
                {salvando ? "Salvando..." : "Salvar cambio"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={fecharFormulario}
                disabled={salvando}
              >
                Cancelar
              </AppButton>
            </div>

            {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
            {sucesso && <AlertMessage variant="success">{sucesso}</AlertMessage>}

            {!companyId && (
              <AlertMessage variant="error">
                Voce precisa estar vinculado a uma empresa para cadastrar cambios.
              </AlertMessage>
            )}
            {!podeEscrever && (
              <div className="vtur-warning-note">
                Voce nao tem permissao para cadastrar ou remover cambios. Solicite acesso ao
                administrador.
              </div>
            )}
          </form>
        </AppCard>
      )}
      <ConfirmDialog
        open={Boolean(cambioParaExcluir)}
        title="Excluir cambio"
        message="Deseja excluir este cambio?"
        confirmLabel="Excluir"
        confirmVariant="danger"
        onCancel={() => setCambioParaExcluir(null)}
        onConfirm={confirmarExclusao}
      />
    </section>
  );
}
