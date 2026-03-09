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
import SearchInput from "../ui/SearchInput";
import EmptyState from "../ui/EmptyState";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";

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
      <div className="paises-page">
        Você não possui acesso ao módulo de Cadastros.
      </div>
    );
  }

  return (
    <div className="paises-page">
      {!mostrarFormulario && (
        <div
          className="card-base mb-3 list-toolbar-sticky"
          style={{ background: "#f5f3ff", borderColor: "#ddd6fe" }}
        >
          <div
            className="form-row mobile-stack"
            style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
          >
            <div style={{ flex: "1 1 320px" }}>
              <SearchInput
                label="Buscar país"
                value={busca}
                onChange={setBusca}
                placeholder="Digite parte do nome..."
              />
            </div>
            {!modoSomenteLeitura && (
              <div className="form-group" style={{ alignItems: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-primary w-full sm:w-auto"
                  onClick={abrirFormulario}
                  disabled={mostrarFormulario}
                >
                  Adicionar país
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {mostrarFormulario && (
        <div className="card-base card-blue form-card mb-3">
          <form onSubmit={salvar}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nome do país *</label>
                <input
                  className="form-input"
                  value={form.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                  placeholder="Ex: Brasil, Estados Unidos, França..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Código ISO</label>
                <input
                  className="form-input"
                  value={form.codigo_iso}
                  onChange={(e) => handleChange("codigo_iso", e.target.value)}
                  placeholder="Ex: BR, US, FR..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Continente</label>
                <input
                  className="form-input"
                  value={form.continente}
                  onChange={(e) => handleChange("continente", e.target.value)}
                  placeholder="Ex: América do Sul, Europa..."
                />
              </div>
            </div>

            <div className="mt-2 mobile-stack-buttons" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={salvando || modoSomenteLeitura}
              >
                {salvando ? "Salvando..." : "Salvar país"}
              </button>
              <button
                type="button"
                className="btn btn-light"
                onClick={fecharFormulario}
                disabled={salvando}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {!mostrarFormulario && !carregouTodos && (
        <div className="card-base card-config mb-3">
          Últimos Países Cadastrados (5). Digite na busca para consultar todos.
        </div>
      )}

      {!mostrarFormulario && erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {!mostrarFormulario && (
        <DataTable
          className="table-default table-header-blue table-mobile-cards min-w-[520px]"
          containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
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
          loadingMessage="Carregando países..."
          empty={!loading && paisesFiltrados.length === 0}
          emptyMessage={
            <EmptyState
              title="Nenhum país encontrado"
              description={
                busca.trim()
                  ? "Tente ajustar a busca ou cadastre um novo país."
                  : "Cadastre um novo país para começar."
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
                      icon: "✏️",
                    },
                    ...(podeExcluir
                      ? [
                          {
                            key: "delete",
                            label: "Excluir",
                            onClick: () => solicitarExclusao(p),
                            icon: excluindoId === p.id ? "..." : "🗑️",
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
  );
}
