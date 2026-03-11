import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { AlertTriangle } from "lucide-react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { normalizeText } from "../../lib/normalizeText";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { useCrudResource } from "../../lib/useCrudResource";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppNoticeDialog from "../ui/primer/AppNoticeDialog";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type TipoPacote = {
  id: string;
  nome: string;
  rule_id?: string | null;
  fix_meta_nao_atingida?: number | null;
  fix_meta_atingida?: number | null;
  fix_super_meta?: number | null;
  ativo: boolean;
};

type Regra = {
  id: string;
  nome: string;
  tipo: string;
};

export default function TipoPacotesIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Parametros");
  const podeCriar = can("Parametros", "create");
  const podeEditar = can("Parametros", "edit");
  const podeExcluir = can("Parametros", "admin");
  const modoSomenteLeitura = !podeCriar && !podeEditar;

  const {
    items: tiposPacote,
    loading: loadingTipos,
    saving: salvando,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load,
    create,
    update,
    remove,
  } = useCrudResource<TipoPacote>({
    table: "tipo_pacotes",
    select: "*",
  });

  const [regras, setRegras] = useState<Regra[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tipoParaExcluir, setTipoParaExcluir] = useState<TipoPacote | null>(null);
  const [form, setForm] = useState({ nome: "", ativo: true });
  const [regraSelecionada, setRegraSelecionada] = useState<string>("");
  const [fixMetaNao, setFixMetaNao] = useState<string>("");
  const [fixMetaAtingida, setFixMetaAtingida] = useState<string>("");
  const [fixSuperMeta, setFixSuperMeta] = useState<string>("");
  const [modalDuplicado, setModalDuplicado] = useState<{ entity: "Tipo de Pacote" } | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  function iniciarNovo() {
    setForm({ nome: "", ativo: true });
    setRegraSelecionada("");
    setFixMetaNao("");
    setFixMetaAtingida("");
    setFixSuperMeta("");
    setEditandoId(null);
    setErro(null);
    setModalDuplicado(null);
  }

  function abrirFormulario() {
    iniciarNovo();
    setMostrarFormulario(true);
  }

  function fecharFormulario() {
    iniciarNovo();
    setMostrarFormulario(false);
  }

  function iniciarEdicao(item: TipoPacote) {
    setEditandoId(item.id);
    setForm({
      nome: item.nome || "",
      ativo: item.ativo,
    });
    setRegraSelecionada(item.rule_id || "");
    setFixMetaNao(item.fix_meta_nao_atingida != null ? String(item.fix_meta_nao_atingida) : "");
    setFixMetaAtingida(item.fix_meta_atingida != null ? String(item.fix_meta_atingida) : "");
    setFixSuperMeta(item.fix_super_meta != null ? String(item.fix_super_meta) : "");
    setMostrarFormulario(true);
    setErro(null);
  }

  async function carregar() {
    setLoadingExtras(true);
    setErro(null);
    try {
      const [loadRes, regrasRes] = await Promise.all([
        load({
          order: { column: "nome", ascending: true },
          errorMessage: "Erro ao carregar tipos de pacote.",
        }),
        supabase.from("commission_rule").select("id, nome, tipo").eq("ativo", true).order("nome"),
      ]);

      if (loadRes.error) return;
      setRegras((regrasRes.data as Regra[]) || []);
    } catch (error) {
      console.error(error);
      setErro("Erro ao carregar tipos de pacote.");
    } finally {
      setLoadingExtras(false);
    }
  }

  useEffect(() => {
    if (!loadingPerm && podeVer) carregar();
  }, [loadingPerm, podeVer]);

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    if (modoSomenteLeitura) {
      setErro("Voce nao tem permissao para salvar tipos de pacote.");
      return;
    }

    const nome = titleCaseWithExceptions(form.nome.trim());
    if (!nome) {
      setErro("Nome e obrigatorio.");
      return;
    }

    const normalizedNome = normalizeText(nome).trim();
    const existeDuplicado = tiposPacote.some(
      (tipo) => tipo.id !== editandoId && normalizeText(tipo.nome || "").trim() === normalizedNome
    );
    if (existeDuplicado) {
      setModalDuplicado({ entity: "Tipo de Pacote" });
      return;
    }

    const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
    const payload = {
      nome,
      ativo: form.ativo,
      rule_id: regraSelecionada || null,
      fix_meta_nao_atingida: toNumberOrNull(fixMetaNao),
      fix_meta_atingida: toNumberOrNull(fixMetaAtingida),
      fix_super_meta: toNumberOrNull(fixSuperMeta),
    };

    try {
      setErro(null);
      if (editandoId) {
        const result = await update(editandoId, payload, {
          errorMessage: "Erro ao salvar tipo de pacote.",
        });
        if (result.error) return;
      } else {
        const result = await create(payload, {
          errorMessage: "Erro ao salvar tipo de pacote.",
        });
        if (result.error) return;
      }
      fecharFormulario();
      await carregar();
      showToast("Tipo de pacote salvo.", "success");
    } catch (error) {
      console.error(error);
      setErro("Erro ao salvar tipo de pacote.");
    }
  }

  async function excluir(id: string) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir tipos de pacote.", "error");
      return;
    }
    try {
      const result = await remove(id, {
        errorMessage: "Erro ao excluir tipo de pacote. Talvez esteja vinculado a vendas/recibos.",
      });
      if (result.error) return;
      await carregar();
      showToast("Tipo de pacote excluido.", "success");
    } catch (error) {
      console.error(error);
      setErro("Erro ao excluir tipo de pacote.");
    }
  }

  function solicitarExclusao(item: TipoPacote) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir tipos de pacote.", "error");
      return;
    }
    setTipoParaExcluir(item);
  }

  async function confirmarExclusao() {
    if (!tipoParaExcluir) return;
    await excluir(tipoParaExcluir.id);
    setTipoParaExcluir(null);
  }

  const tiposFiltrados = useMemo(() => {
    if (!busca.trim()) return tiposPacote;
    const termo = normalizeText(busca);
    return tiposPacote.filter((item) => normalizeText(item.nome || "").includes(termo));
  }, [busca, tiposPacote]);

  const resumoLista = busca.trim()
    ? `${tiposFiltrados.length} tipo(s) encontrados para a busca atual.`
    : `${tiposFiltrados.length} tipo(s) de pacote cadastrados.`;

  const regrasMap = useMemo(() => {
    const map = new Map<string, Regra>();
    regras.forEach((regra) => map.set(regra.id, regra));
    return map;
  }, [regras]);

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Voce nao possui acesso ao modulo de Parametros.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="produtos-page tipo-pacotes-page">
        {mostrarFormulario && (
          <AppCard
            className="form-card mb-3"
            title={editandoId ? "Editar tipo de pacote" : "Novo tipo de pacote"}
            subtitle="Defina regras e percentuais base para os pacotes usados nas vendas e comissoes."
            tone="info"
          >
            <form onSubmit={salvar}>
              <div className="vtur-form-grid vtur-form-grid-2">
                <AppField
                  label="Nome *"
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                  onBlur={(e) =>
                    setForm((prev) => ({ ...prev, nome: titleCaseWithExceptions(e.target.value) }))
                  }
                  disabled={modoSomenteLeitura}
                  validation={!form.nome.trim() && erro ? "Nome e obrigatorio." : undefined}
                />
                <AppField
                  as="select"
                  label="Ativo?"
                  value={form.ativo ? "1" : "0"}
                  onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.value === "1" }))}
                  disabled={modoSomenteLeitura}
                  options={[
                    { value: "1", label: "Sim" },
                    { value: "0", label: "Nao" },
                  ]}
                />
              </div>

              <div className="vtur-form-grid vtur-form-grid-4" style={{ marginTop: 12 }}>
                <AppField
                  as="select"
                  label="Regra de Comissao"
                  value={regraSelecionada}
                  onChange={(e) => setRegraSelecionada(e.target.value)}
                  disabled={modoSomenteLeitura}
                  options={[
                    { value: "", label: "Usar comissao fixa" },
                    ...regras.map((regra) => ({
                      value: regra.id,
                      label: `${regra.nome} (${regra.tipo})`,
                    })),
                  ]}
                />
                <AppField
                  label="Meta nao atingida %"
                  type="number"
                  step="0.01"
                  value={fixMetaNao}
                  onChange={(e) => setFixMetaNao(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
                <AppField
                  label="Meta atingida %"
                  type="number"
                  step="0.01"
                  value={fixMetaAtingida}
                  onChange={(e) => setFixMetaAtingida(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
                <AppField
                  label="Super meta %"
                  type="number"
                  step="0.01"
                  value={fixSuperMeta}
                  onChange={(e) => setFixSuperMeta(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
              </div>

              {!modoSomenteLeitura && (
                <div className="vtur-form-actions mobile-stack-buttons" style={{ marginTop: 12 }}>
                  <AppButton type="submit" variant="primary" loading={salvando}>
                    {editandoId ? "Salvar alteracoes" : "Salvar tipo"}
                  </AppButton>
                  <AppButton type="button" variant="secondary" onClick={fecharFormulario}>
                    Cancelar
                  </AppButton>
                </div>
              )}
            </form>
          </AppCard>
        )}

        <AppToolbar
          sticky
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Tipos de pacote"
          subtitle={resumoLista}
          actions={
            !modoSomenteLeitura ? (
              <AppButton type="button" variant="primary" onClick={abrirFormulario}>
                Novo tipo
              </AppButton>
            ) : null
          }
        >
          <div className="vtur-toolbar-grid">
            <AppField
              label="Buscar tipo de pacote"
              placeholder="Digite o nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </AppToolbar>

        {erro && (
          <div className="mb-3">
            <AlertMessage variant="error">{erro}</AlertMessage>
          </div>
        )}

        <DataTable
          shellClassName="mb-3"
          className="table-default table-header-blue table-mobile-cards min-w-[780px]"
          colSpan={6}
          headers={
            <tr>
              <th>Tipo de Pacote</th>
              <th>Regra</th>
              <th>Meta nao</th>
              <th>Meta</th>
              <th>Super</th>
              <th className="th-actions">Ações</th>
            </tr>
          }
          loading={loadingTipos || loadingExtras}
          loadingMessage="Carregando tipos de pacote..."
          empty={tiposFiltrados.length === 0}
          emptyMessage={
            <EmptyState
              title="Nenhum tipo de pacote encontrado"
              description={
                busca.trim()
                  ? "Tente ajustar a busca ou cadastre um novo tipo de pacote."
                  : "Cadastre um tipo de pacote para comecar."
              }
            />
          }
        >
          {tiposFiltrados.map((item) => {
            const regra = item.rule_id ? regrasMap.get(item.rule_id) : null;
            const regraLabel = regra ? `${regra.nome} (${regra.tipo})` : "Fixa";
            return (
              <tr key={item.id}>
                <td data-label="Tipo">{item.nome}</td>
                <td data-label="Regra">{regraLabel}</td>
                <td data-label="Meta nao">{item.fix_meta_nao_atingida ?? "-"}</td>
                <td data-label="Meta">{item.fix_meta_atingida ?? "-"}</td>
                <td data-label="Super">{item.fix_super_meta ?? "-"}</td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    onEdit={podeEditar ? () => iniciarEdicao(item) : undefined}
                    onDelete={podeExcluir ? () => solicitarExclusao(item) : undefined}
                    editDisabled={!podeEditar}
                    deleteDisabled={excluindoId === item.id}
                  />
                </td>
              </tr>
            );
          })}
        </DataTable>

        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <ConfirmDialog
          open={Boolean(tipoParaExcluir)}
          title="Excluir tipo de pacote"
          message="Tem certeza que deseja excluir este tipo de pacote?"
          confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(excluindoId)}
          onCancel={() => setTipoParaExcluir(null)}
          onConfirm={confirmarExclusao}
        />
        <AppNoticeDialog
          open={Boolean(modalDuplicado)}
          title="ATENCAO"
          icon={<AlertTriangle size={20} strokeWidth={2} />}
          message={modalDuplicado ? `${modalDuplicado.entity} ja cadastrado.` : ""}
          onClose={() => setModalDuplicado(null)}
        />
      </div>
    </AppPrimerProvider>
  );
}
