import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
import { useCrudResource } from "../../lib/useCrudResource";
import { fetchReferenceData } from "../../lib/referenceData";
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
};

type Subdivisao = {
  id: string;
  nome: string;
  pais_id: string;
  codigo_admin1: string;
  tipo: string | null;
  created_at: string | null;
};

type FormState = {
  nome: string;
  pais_id: string;
  codigo_admin1: string;
  tipo: string;
};

const initialForm: FormState = {
  nome: "",
  pais_id: "",
  codigo_admin1: "",
  tipo: "",
};

export default function SubdivisoesIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Subdivisoes");
  const podeCriar = can("Subdivisoes", "create");
  const podeEditar = can("Subdivisoes", "edit");
  const podeExcluir = can("Subdivisoes", "admin");
  const modoSomenteLeitura = !podeCriar && !podeEditar;

  const {
    items: subdivisoes,
    loading: loadingSubdivisoes,
    saving: salvando,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load: loadSubdivisoes,
    create,
    update,
    remove,
  } = useCrudResource<Subdivisao>({
    table: "subdivisoes",
    select: "id, nome, pais_id, codigo_admin1, tipo, created_at",
  });

  const [paises, setPaises] = useState<Pais[]>([]);
  const [loadingPaises, setLoadingPaises] = useState(false);

  const [form, setForm] = useState<FormState>(initialForm);
  const [busca, setBusca] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [subdivisaoParaExcluir, setSubdivisaoParaExcluir] = useState<Subdivisao | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const loading = loadingSubdivisoes || loadingPaises;

  async function carregarDados(todos = false, forceRefresh = false) {
    setErro(null);

    setLoadingPaises(true);
    try {
      const payload = await fetchReferenceData({
        include: ["paises", "subdivisoes"],
        noCache: forceRefresh,
      });
      const paisesData = (payload.paises || []) as Pais[];
      setPaises(paisesData);

      const subdivisoesData = (payload.subdivisoes || []) as Subdivisao[];
      const sorted = [...subdivisoesData].sort((a, b) => {
        if (todos) {
          return String(a.nome || "").localeCompare(String(b.nome || ""));
        }
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      const sliced = todos ? sorted : sorted.slice(0, 5);

      const subdivisoesResult = await loadSubdivisoes({
        fetcher: async () => sliced,
        errorMessage: "Erro ao carregar subdivisoes.",
      });

      if (subdivisoesResult.error) {
        setErro("Erro ao carregar subdivisoes.");
        return;
      }
    } catch (err) {
      console.error(err);
      setErro("Erro ao carregar subdivisoes.");
      return;
    } finally {
      setLoadingPaises(false);
    }

    setCarregouTodos(todos);
  }

  useEffect(() => {
    carregarDados(false);
  }, []);

  useEffect(() => {
    if (busca.trim() && !carregouTodos) {
      carregarDados(true);
    } else if (!busca.trim() && carregouTodos) {
      carregarDados(false);
    }
  }, [busca, carregouTodos]);

  const subdivisoesEnriquecidas = useMemo(() => {
    const paisMap = new Map(paises.map((p) => [p.id, p.nome]));
    return subdivisoes.map((s) => ({
      ...s,
      pais_nome: paisMap.get(s.pais_id) || "",
    }));
  }, [subdivisoes, paises]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return subdivisoesEnriquecidas;
    const termo = normalizeText(busca);
    return subdivisoesEnriquecidas.filter(
      (s) =>
        normalizeText(s.nome).includes(termo) ||
        normalizeText(s.pais_nome).includes(termo) ||
        normalizeText(s.codigo_admin1).includes(termo)
    );
  }, [busca, subdivisoesEnriquecidas]);
  const resumoLista = busca.trim()
    ? `${filtrados.length} subdivisao(oes) encontradas para a busca atual.`
    : carregouTodos
      ? `${filtrados.length} subdivisao(oes) carregadas para consulta completa.`
      : "Ultimas 5 subdivisoes cadastradas. Digite na busca para consultar todas.";

  function handleChange<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function iniciarNovo() {
    setForm(initialForm);
    setEditandoId(null);
    setErro(null);
  }

  function iniciarEdicao(subdivisao: Subdivisao) {
    setEditandoId(subdivisao.id);
    setForm({
      nome: subdivisao.nome,
      pais_id: subdivisao.pais_id,
      codigo_admin1: subdivisao.codigo_admin1,
      tipo: subdivisao.tipo || "",
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
      setErro("Voce nao tem permissao para salvar subdivisoes.");
      return;
    }
    if (!form.nome.trim() || !form.pais_id || !form.codigo_admin1.trim()) {
      setErro("Preencha nome, codigo e pais.");
      return;
    }

    setErro(null);

    const payload = {
      nome: titleCaseWithExceptions(form.nome),
      pais_id: form.pais_id,
      codigo_admin1: form.codigo_admin1.trim(),
      tipo: form.tipo.trim() || null,
    };

    const result = editandoId
      ? await update(editandoId, payload, { errorMessage: "Erro ao salvar subdivisao." })
      : await create(payload, { errorMessage: "Erro ao salvar subdivisao." });

    if (result.error) return;

    await carregarDados(carregouTodos, true);
    fecharFormulario();
  }

  async function excluir(id: string) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir subdivisoes.", "error");
      return;
    }

    setErro(null);

    const result = await remove(id, {
      errorMessage: "Erro ao excluir subdivisao. Verifique se nao existem cidades vinculadas.",
    });

    if (result.error) return;

    await carregarDados(carregouTodos, true);
  }

  function solicitarExclusao(subdivisao: Subdivisao) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir subdivisoes.", "error");
      return;
    }
    setSubdivisaoParaExcluir(subdivisao);
  }

  async function confirmarExclusao() {
    if (!subdivisaoParaExcluir) return;
    await excluir(subdivisaoParaExcluir.id);
    setSubdivisaoParaExcluir(null);
  }

  if (loadingPerm) {
    return (
      <div className="paises-page page-content-wrap">
        <LoadingUsuarioContext />
      </div>
    );
  }
  if (!podeVer) return <div className="paises-page">Voce nao possui acesso ao modulo de Cadastros.</div>;

  return (
    <AppPrimerProvider>
      <div className="paises-page">
      {!mostrarFormulario && (
        <AppCard
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Consulta de estados e provincias"
          subtitle={resumoLista}
          actions={
            !modoSomenteLeitura ? (
              <AppButton
                type="button"
                variant="primary"
                onClick={abrirFormulario}
                disabled={mostrarFormulario}
              >
                Adicionar estado/provincia
              </AppButton>
            ) : null
          }
        >
          <div className="vtur-toolbar-grid">
            <AppField
              label="Buscar subdivisao"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Nome, pais ou codigo..."
            />
          </div>
        </AppCard>
      )}

      {mostrarFormulario && (
        <AppCard
          className="form-card mb-3"
          title={editandoId ? "Editar subdivisao" : "Nova subdivisao"}
          subtitle="Padronize estados e provincias usados em cidades, destinos e operacoes do CRM."
          tone="info"
        >
          <form onSubmit={salvar}>
            <div className="vtur-form-grid vtur-form-grid-2">
              <AppField
                label="Nome da subdivisao *"
                value={form.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                placeholder="Ex: Sao Paulo, California..."
                validation={!form.nome.trim() && erro ? "Preencha o nome." : undefined}
              />
              <AppField
                label="Codigo admin1 *"
                value={form.codigo_admin1}
                onChange={(e) => handleChange("codigo_admin1", e.target.value)}
                placeholder="Ex: SP, CA, NY..."
                validation={!form.codigo_admin1.trim() && erro ? "Preencha o codigo." : undefined}
              />
            </div>

            <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 12 }}>
              <AppField
                label="Tipo"
                value={form.tipo}
                onChange={(e) => handleChange("tipo", e.target.value)}
                placeholder="Ex: Estado, Provincia, Regiao..."
              />
              <AppField
                as="select"
                label="Pais *"
                value={form.pais_id}
                onChange={(e) => handleChange("pais_id", e.target.value)}
                validation={!form.pais_id && erro ? "Selecione o pais." : undefined}
                options={[
                  { value: "", label: "Selecione" },
                  ...paises.map((p) => ({ value: p.id, label: p.nome })),
                ]}
              />
            </div>

            <div className="vtur-form-actions mobile-stack-buttons" style={{ marginTop: 12 }}>
              <AppButton
                type="submit"
                variant="primary"
                disabled={salvando || modoSomenteLeitura}
                loading={salvando}
              >
                {salvando ? "Salvando..." : "Salvar estado/provincia"}
              </AppButton>
              <AppButton type="button" variant="secondary" onClick={fecharFormulario} disabled={salvando}>
                Cancelar
              </AppButton>
            </div>
          </form>
        </AppCard>
      )}

      {!mostrarFormulario && !carregouTodos && (
        <AlertMessage variant="info" className="mb-3">
          Ultimas subdivisoes cadastradas (5). Digite na busca para consultar todas.
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
          className="table-default table-header-blue table-mobile-cards min-w-[720px]"
          containerClassName="vtur-scroll-y-65"
          headers={
            <tr>
              <th>Subdivisao</th>
              <th>Codigo</th>
              <th>Pais</th>
              <th>Tipo</th>
              <th>Criado em</th>
              <th className="th-actions">Ações</th>
            </tr>
          }
          loading={loading}
          loadingMessage="Carregando subdivisoes..."
          empty={!loading && filtrados.length === 0}
          emptyMessage={
            <EmptyState
              title="Nenhuma subdivisão encontrada"
              description={
                busca.trim()
                  ? "Tente ajustar a busca ou cadastre uma subdivisao."
                  : "Cadastre uma subdivisao para comecar."
              }
            />
          }
          colSpan={6}
        >
          {filtrados.map((s) => (
            <tr key={s.id}>
              <td data-label="Subdivisao">{s.nome}</td>
              <td data-label="Codigo">{s.codigo_admin1}</td>
              <td data-label="Pais">{(s as any).pais_nome || "-"}</td>
              <td data-label="Tipo">{s.tipo || "-"}</td>
              <td data-label="Criado em">
                {s.created_at ? formatDateBR(s.created_at) : "-"}
              </td>
              <td className="th-actions" data-label="Ações">
                <TableActions
                  show={!modoSomenteLeitura}
                  actions={[
                    {
                      key: "edit",
                      label: "Editar",
                      onClick: () => iniciarEdicao(s),
                    },
                    ...(podeExcluir
                      ? [
                          {
                            key: "delete",
                            label: "Excluir",
                            onClick: () => solicitarExclusao(s),
                            variant: "danger" as const,
                            disabled: excluindoId === s.id,
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
        open={Boolean(subdivisaoParaExcluir)}
        title="Excluir subdivisão"
        message={`Excluir ${subdivisaoParaExcluir?.nome || "esta subdivisão"}?`}
        confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
        confirmVariant="danger"
        confirmDisabled={Boolean(excluindoId)}
        onCancel={() => setSubdivisaoParaExcluir(null)}
        onConfirm={confirmarExclusao}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
