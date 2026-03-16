import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
import { useCrudResource } from "../../lib/useCrudResource";
import { formatDateBR } from "../../lib/format";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import EmptyState from "../ui/EmptyState";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type Pais = {
  id: string;
  nome: string;
  codigo_iso: string | null;
  continente: string | null;
  created_at: string | null;
};

type FormState = {
  nome: string;
  codigo_iso: string;
  continente: string;
};

const initialForm: FormState = {
  nome: "",
  codigo_iso: "",
  continente: ""
};

export default function PaisesIsland() {
  const {
    items: paises,
    loading,
    saving: salvando,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load,
    create,
    update,
    remove,
  } = useCrudResource<Pais>({
    table: "paises",
    select: "id, nome, codigo_iso, continente, created_at",
  });
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Paises");
  const podeCriar = can("Paises", "create");
  const podeEditar = can("Paises", "edit");
  const podeExcluir = can("Paises", "admin");
  const modoSomenteLeitura = !podeCriar && !podeEditar;
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [paisParaExcluir, setPaisParaExcluir] = useState<Pais | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  async function carregarPaises(todos = false) {
    const result = await load({
      order: {
        column: todos ? "nome" : "created_at",
        ascending: todos,
      },
      limit: todos ? undefined : 5,
      errorMessage:
        "Erro ao carregar países. Verifique se a tabela 'paises' existe e se as colunas estão corretas.",
    });

    if (!result.error) {
      setCarregouTodos(todos || false);
    }
  }

  useEffect(() => {
    carregarPaises(false);
  }, []);

  useEffect(() => {
    if (busca.trim() && !carregouTodos) {
      carregarPaises(true);
    } else if (!busca.trim() && carregouTodos) {
      carregarPaises(false);
    }
  }, [busca, carregouTodos]);

  const paisesFiltrados = useMemo(() => {
    if (!busca.trim()) return paises;
    const termo = normalizeText(busca);
    return paises.filter((p) => normalizeText(p.nome).includes(termo));
  }, [busca, paises]);
  const resumoLista = busca.trim()
    ? `${paisesFiltrados.length} pais(es) encontrados para a busca atual.`
    : carregouTodos
      ? `${paisesFiltrados.length} pais(es) carregados para consulta completa.`
      : "Ultimos 5 paises cadastrados. Digite na busca para consultar todos.";

  function handleChange(campo: keyof FormState, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function iniciarNovo() {
    setForm(initialForm);
    setEditandoId(null);
    setErro(null);
  }

  function iniciarEdicao(pais: Pais) {
    setEditandoId(pais.id);
    setForm({
      nome: pais.nome,
      codigo_iso: pais.codigo_iso || "",
      continente: pais.continente || ""
    });
    setMostrarFormulario(true);
  }

  function abrirFormulario() {
    iniciarNovo();
    setMostrarFormulario(true);
  }

  function fecharFormulario() {
    iniciarNovo();
    setMostrarFormulario(false);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (modoSomenteLeitura) {
      setErro("Você não tem permissão para salvar países.");
      return;
    }

    if (!form.nome.trim()) {
      setErro("Nome é obrigatório.");
      return;
    }

    setErro(null);

    const payload = {
      nome: titleCaseWithExceptions(form.nome),
      codigo_iso: form.codigo_iso.trim() || null,
      continente: form.continente.trim() || null,
    };

    const result = editandoId
      ? await update(editandoId, payload, {
          errorMessage: "Erro ao salvar país. Verifique se o nome é único.",
        })
      : await create(payload, {
          errorMessage: "Erro ao salvar país. Verifique se o nome é único.",
        });

    if (result.error) return;

    await carregarPaises(carregouTodos);
    fecharFormulario();
  }

  async function excluir(id: string) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir países.", "error");
      return;
    }

    setErro(null);

    const result = await remove(id, {
      errorMessage:
        "Não foi possível excluir o país. Verifique se não existem destinos vinculados.",
    });

    if (result.error) return;

    await carregarPaises(carregouTodos);
  }

  function solicitarExclusao(pais: Pais) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir países.", "error");
      return;
    }
    setPaisParaExcluir(pais);
  }

  async function confirmarExclusao() {
    if (!paisParaExcluir) return;
    await excluir(paisParaExcluir.id);
    setPaisParaExcluir(null);
  }

  if (loadingPerm) {
    return (
      <div className="paises-page">
        <LoadingUsuarioContext />
      </div>
    );
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <div className="paises-page">
          <AppCard tone="config">Você não possui acesso ao módulo de Cadastros.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="paises-page">
        {!mostrarFormulario && (
          <AppCard
            tone="config"
            className="mb-3 list-toolbar-sticky"
            title="Consulta de paises"
            subtitle={resumoLista}
            actions={
              !modoSomenteLeitura ? (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={abrirFormulario}
                  disabled={mostrarFormulario}
                >
                  Adicionar pais
                </AppButton>
              ) : null
            }
          >
            <div className="vtur-toolbar-grid">
              <AppField
                label="Buscar pais"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Digite parte do nome..."
              />
            </div>
          </AppCard>
        )}

        {mostrarFormulario && (
          <AppCard
            className="form-card mb-3"
            title={editandoId ? "Editar pais" : "Novo pais"}
            subtitle="Mantenha o cadastro de paises padronizado para rotas, destinos e operacoes do CRM."
            tone="info"
          >
            <form onSubmit={salvar}>
              <div className="vtur-form-grid vtur-form-grid-3">
                <AppField
                label="Nome do pais *"
                value={form.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                placeholder="Ex: Brasil, Estados Unidos, Franca..."
                validation={!form.nome.trim() && erro ? "Nome e obrigatorio." : undefined}
                />
                <AppField
                label="Codigo ISO"
                value={form.codigo_iso}
                onChange={(e) => handleChange("codigo_iso", e.target.value)}
                placeholder="Ex: BR, US, FR..."
                />
                <AppField
                label="Continente"
                value={form.continente}
                onChange={(e) => handleChange("continente", e.target.value)}
                placeholder="Ex: America do Sul, Europa..."
                />
              </div>

              <div className="vtur-form-actions mt-2 mobile-stack-buttons">
                <AppButton
                  type="submit"
                  variant="primary"
                  disabled={salvando || modoSomenteLeitura}
                  loading={salvando}
                >
                  {salvando ? "Salvando..." : "Salvar pais"}
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
            </form>
          </AppCard>
        )}

        {!mostrarFormulario && !carregouTodos && (
          <AlertMessage variant="info" className="mb-3">
            Ultimos paises cadastrados (5). Digite na busca para consultar todos.
          </AlertMessage>
        )}

        {!mostrarFormulario && erro && (
          <div className="mb-3">
            <AlertMessage variant="error">{erro}</AlertMessage>
          </div>
        )}

        {!mostrarFormulario && (
          <DataTable
            shellClassName="mb-3"
            className="table-default table-header-blue table-mobile-cards min-w-[520px]"
            containerClassName="vtur-scroll-y-65"
            headers={
              <tr>
                <th>Nome</th>
                <th>Código ISO</th>
                <th>Continente</th>
                <th>Criado em</th>
                <th className="th-actions">Ações</th>
              </tr>
            }
            loading={loading}
            loadingMessage="Carregando paises..."
            empty={!loading && paisesFiltrados.length === 0}
            emptyMessage={
              <EmptyState
                title="Nenhum pais encontrado"
                description={
                  busca.trim()
                    ? "Tente ajustar a busca ou cadastre um novo pais."
                    : "Cadastre um novo pais para comecar."
                }
              />
            }
            colSpan={5}
          >
            {paisesFiltrados.map((p) => (
              <tr key={p.id}>
                <td data-label="Nome">{p.nome}</td>
                <td data-label="Código ISO">{p.codigo_iso || "-"}</td>
                <td data-label="Continente">{p.continente || "-"}</td>
                <td data-label="Criado em">
                  {p.created_at ? formatDateBR(p.created_at) : "-"}
                </td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    show={!modoSomenteLeitura}
                    actions={[
                      {
                        key: "edit",
                        label: "Editar",
                        onClick: () => iniciarEdicao(p),
                      },
                      ...(podeExcluir
                        ? [
                            {
                              key: "delete",
                              label: "Excluir",
                              onClick: () => solicitarExclusao(p),
                              variant: "danger" as const,
                              disabled: excluindoId === p.id,
                            },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        )}

        <ConfirmDialog
          open={Boolean(paisParaExcluir)}
          title="Excluir país"
          message={`Tem certeza que deseja excluir ${paisParaExcluir?.nome || "este país"}?`}
          confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(excluindoId)}
          onCancel={() => setPaisParaExcluir(null)}
          onConfirm={confirmarExclusao}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
