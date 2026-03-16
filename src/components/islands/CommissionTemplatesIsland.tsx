import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { registrarLog } from "../../lib/logs";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type Template = {
  id: string;
  nome: string;
  descricao: string | null;
  modo: "FIXO" | "ESCALONAVEL";

  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;

  esc_ativado: boolean;
  esc_inicial_pct: number | null;
  esc_final_pct: number | null;
  esc_incremento_pct_meta: number | null;
  esc_incremento_pct_comissao: number | null;

  esc2_ativado: boolean;
  esc2_inicial_pct: number | null;
  esc2_final_pct: number | null;
  esc2_incremento_pct_meta: number | null;
  esc2_incremento_pct_comissao: number | null;

  ativo: boolean;
};

const initialForm: Template = {
  id: "",
  nome: "",
  descricao: "",
  modo: "FIXO",

  meta_nao_atingida: null,
  meta_atingida: null,
  super_meta: null,

  esc_ativado: false,
  esc_inicial_pct: null,
  esc_final_pct: null,
  esc_incremento_pct_meta: null,
  esc_incremento_pct_comissao: null,

  esc2_ativado: false,
  esc2_inicial_pct: null,
  esc2_final_pct: null,
  esc2_incremento_pct_meta: null,
  esc2_incremento_pct_comissao: null,

  ativo: true,
};

function parseNumberOrNull(value: string) {
  return value === "" ? null : Number(value);
}

export default function CommissionTemplatesIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Parametros");

  const [form, setForm] = useState<Template>(initialForm);
  const [editId, setEditId] = useState<string | null>(null);

  const [lista, setLista] = useState<Template[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [templateParaExcluir, setTemplateParaExcluir] = useState<Template | null>(null);

  // ============================================================
  // LOADING INICIAL
  // ============================================================
  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);
      setSucesso(null);

      const { data, error } = await supabase
        .from("commission_templates")
        .select(
          "id, nome, descricao, modo, meta_nao_atingida, meta_atingida, super_meta, esc_ativado, esc_inicial_pct, esc_final_pct, esc_incremento_pct_meta, esc_incremento_pct_comissao, esc2_ativado, esc2_inicial_pct, esc2_final_pct, esc2_incremento_pct_meta, esc2_incremento_pct_comissao, ativo"
        )
        .order("nome", { ascending: true });

      if (error) throw error;

      setLista(data as Template[]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar templates.");
    } finally {
      setCarregando(false);
    }
  }

  // ============================================================
  // FILTRO
  // ============================================================
  const filtrados = useMemo(() => {
    if (!busca.trim()) return lista;
    const t = busca.toLowerCase();
    return lista.filter(
      (x) =>
        x.nome.toLowerCase().includes(t) ||
        (x.descricao || "").toLowerCase().includes(t)
    );
  }, [lista, busca]);
  const resumoLista = busca.trim()
    ? `${filtrados.length} template(s) encontrados para a busca atual.`
    : `${lista.length} template(s) cadastrados na biblioteca de comissionamento.`;

  // ============================================================
  // FORM CHANGE
  // ============================================================
  function handleChange<K extends keyof Template>(campo: K, valor: Template[K]) {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  // ============================================================
  // CRUD
  // ============================================================
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!form.nome.trim()) {
      setErro("Nome é obrigatório.");
      return;
    }

    if (form.modo === "FIXO") {
      if (!form.meta_nao_atingida && !form.meta_atingida && !form.super_meta) {
        setErro("Informe ao menos um percentual no modo Fixo.");
        return;
      }
    }

    try {
      setSalvando(true);

      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao?.trim() || null,
        modo: form.modo,

        meta_nao_atingida: form.meta_nao_atingida,
        meta_atingida: form.meta_atingida,
        super_meta: form.super_meta,

        esc_ativado: form.esc_ativado,
        esc_inicial_pct: form.esc_inicial_pct,
        esc_final_pct: form.esc_final_pct,
        esc_incremento_pct_meta: form.esc_incremento_pct_meta,
        esc_incremento_pct_comissao: form.esc_incremento_pct_comissao,

        esc2_ativado: form.esc2_ativado,
        esc2_inicial_pct: form.esc2_inicial_pct,
        esc2_final_pct: form.esc2_final_pct,
        esc2_incremento_pct_meta: form.esc2_incremento_pct_meta,
        esc2_incremento_pct_comissao: form.esc2_incremento_pct_comissao,

        ativo: form.ativo,
      };

      if (editId) {
        const { error } = await supabase
          .from("commission_templates")
          .update(payload)
          .eq("id", editId);

        if (error) throw error;

        await registrarLog({
          user_id: (await supabase.auth.getUser()).data.user?.id || null,
          acao: "template_comissao_atualizado",
          modulo: "Parametros",
          detalhes: { id: editId, payload },
        });
      } else {
        const { error } = await supabase
          .from("commission_templates")
          .insert(payload);

        if (error) throw error;

        await registrarLog({
          user_id: (await supabase.auth.getUser()).data.user?.id || null,
          acao: "template_comissao_criado",
          modulo: "Parametros",
          detalhes: { payload },
        });
      }

      await carregar();
      iniciarNovo();
      setSucesso("Template salvo com sucesso.");
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar template.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarNovo() {
    setEditId(null);
    setForm(initialForm);
  }

  function iniciarEdicao(t: Template) {
    setEditId(t.id);
    setForm(t);
    setSucesso(null);
    setErro(null);
  }

  async function excluir(id: string) {
    try {
      const { error } = await supabase
        .from("commission_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await registrarLog({
        user_id: (await supabase.auth.getUser()).data.user?.id || null,
        acao: "template_comissao_excluido",
        modulo: "Parametros",
        detalhes: { id },
      });

      await carregar();
    } catch (e) {
      setErro("Erro ao excluir template.");
    }
  }

  function solicitarExclusao(template: Template) {
    setTemplateParaExcluir(template);
  }

  async function confirmarExclusao() {
    if (!templateParaExcluir) return;
    await excluir(templateParaExcluir.id);
    setTemplateParaExcluir(null);
  }

  // ============================================================
  // UI
  // ============================================================

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Acesso bloqueado ao modulo Parametros.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="commission-templates-page">
        <AppCard
          className="mb-3"
          tone="info"
          title={editId ? "Editar template de comissao" : "Novo template de comissao"}
          subtitle="Defina regras fixas ou escalonaveis para acelerar configuracoes comerciais da franquia."
        >
          <form onSubmit={salvar}>
            <div className="vtur-form-grid vtur-form-grid-3">
              <AppField
                label="Nome *"
                value={form.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
              />
              <AppField
                as="select"
                label="Modo *"
                value={form.modo}
                onChange={(e) => handleChange("modo", e.target.value as "FIXO" | "ESCALONAVEL")}
                options={[
                  { value: "FIXO", label: "Fixo" },
                  { value: "ESCALONAVEL", label: "Escalonavel" },
                ]}
              />
              <AppField
                as="select"
                label="Ativo"
                value={form.ativo ? "true" : "false"}
                onChange={(e) => handleChange("ativo", e.target.value === "true")}
                options={[
                  { value: "true", label: "Sim" },
                  { value: "false", label: "Nao" },
                ]}
              />
            </div>

            {form.modo === "FIXO" && (
              <AppCard
                className="vtur-sales-embedded-card"
                tone="config"
                title="Percentuais fixos"
                subtitle="Defina comissao para meta nao atingida, atingida e super meta."
              >
                <div className="vtur-form-grid vtur-form-grid-3">
                  <AppField
                    type="number"
                    label="% Nao atingida"
                    value={form.meta_nao_atingida ?? ""}
                    min={0}
                    step="0.1"
                    onChange={(e) => handleChange("meta_nao_atingida", parseNumberOrNull(e.target.value))}
                  />
                  <AppField
                    type="number"
                    label="% Atingida"
                    value={form.meta_atingida ?? ""}
                    min={0}
                    step="0.1"
                    onChange={(e) => handleChange("meta_atingida", parseNumberOrNull(e.target.value))}
                  />
                  <AppField
                    type="number"
                    label="% Super meta"
                    value={form.super_meta ?? ""}
                    min={0}
                    step="0.1"
                    onChange={(e) => handleChange("super_meta", parseNumberOrNull(e.target.value))}
                  />
                </div>
              </AppCard>
            )}

            {form.modo === "ESCALONAVEL" && (
              <>
                <AppCard
                  className="vtur-sales-embedded-card"
                  tone="config"
                  title="Escalonamento 1"
                  subtitle="Primeira faixa de progressao entre percentual de meta e percentual de comissao."
                >
                  <div className="vtur-form-grid vtur-form-grid-3">
                    <AppField
                      as="select"
                      label="Ativado?"
                      value={form.esc_ativado ? "true" : "false"}
                      onChange={(e) => handleChange("esc_ativado", e.target.value === "true")}
                      options={[
                        { value: "true", label: "Sim" },
                        { value: "false", label: "Nao" },
                      ]}
                    />
                    <AppField
                      type="number"
                      label="Inicial %"
                      value={form.esc_inicial_pct ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) => handleChange("esc_inicial_pct", parseNumberOrNull(e.target.value))}
                    />
                    <AppField
                      type="number"
                      label="Final %"
                      value={form.esc_final_pct ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) => handleChange("esc_final_pct", parseNumberOrNull(e.target.value))}
                    />
                  </div>
                  <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                    <AppField
                      type="number"
                      label="Incremento % Meta"
                      value={form.esc_incremento_pct_meta ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) =>
                        handleChange("esc_incremento_pct_meta", parseNumberOrNull(e.target.value))
                      }
                    />
                    <AppField
                      type="number"
                      label="Incremento % Comissao"
                      value={form.esc_incremento_pct_comissao ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) =>
                        handleChange("esc_incremento_pct_comissao", parseNumberOrNull(e.target.value))
                      }
                    />
                  </div>
                </AppCard>

                <AppCard
                  className="vtur-sales-embedded-card"
                  tone="config"
                  title="Escalonamento 2"
                  subtitle="Faixa adicional para modelos de crescimento comercial mais agressivos."
                >
                  <div className="vtur-form-grid vtur-form-grid-3">
                    <AppField
                      as="select"
                      label="Ativado?"
                      value={form.esc2_ativado ? "true" : "false"}
                      onChange={(e) => handleChange("esc2_ativado", e.target.value === "true")}
                      options={[
                        { value: "true", label: "Sim" },
                        { value: "false", label: "Nao" },
                      ]}
                    />
                    <AppField
                      type="number"
                      label="Inicial %"
                      value={form.esc2_inicial_pct ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) => handleChange("esc2_inicial_pct", parseNumberOrNull(e.target.value))}
                    />
                    <AppField
                      type="number"
                      label="Final %"
                      value={form.esc2_final_pct ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) => handleChange("esc2_final_pct", parseNumberOrNull(e.target.value))}
                    />
                  </div>
                  <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                    <AppField
                      type="number"
                      label="Incremento % Meta"
                      value={form.esc2_incremento_pct_meta ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) =>
                        handleChange("esc2_incremento_pct_meta", parseNumberOrNull(e.target.value))
                      }
                    />
                    <AppField
                      type="number"
                      label="Incremento % Comissao"
                      value={form.esc2_incremento_pct_comissao ?? ""}
                      min={0}
                      step="0.1"
                      onChange={(e) =>
                        handleChange("esc2_incremento_pct_comissao", parseNumberOrNull(e.target.value))
                      }
                    />
                  </div>
                </AppCard>
              </>
            )}

            <div style={{ marginTop: 16 }}>
              <AppField
                as="textarea"
                label="Descricao"
                rows={4}
                value={form.descricao || ""}
                onChange={(e) => handleChange("descricao", e.target.value)}
              />
            </div>

            {erro && (
              <AlertMessage variant="error" className="mt-3">
                <strong>Erro:</strong> {erro}
              </AlertMessage>
            )}
            {sucesso && (
              <AlertMessage variant="success" className="mt-3">
                {sucesso}
              </AlertMessage>
            )}

            <div className="vtur-form-actions">
              <AppButton type="submit" variant="primary" disabled={salvando} loading={salvando}>
                {salvando
                  ? "Salvando..."
                  : editId
                    ? "Salvar alteracoes"
                    : "Criar template"}
              </AppButton>
              {editId && (
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={iniciarNovo}
                >
                  Cancelar
                </AppButton>
              )}
            </div>
          </form>
        </AppCard>

        <AppCard
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Templates de comissao"
          subtitle={resumoLista}
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              label="Buscar template"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque por nome ou descricao..."
              caption="Use a busca para localizar rapidamente modelos fixos e escalonaveis."
            />
          </div>
        </AppCard>

        <AppCard
          tone="config"
          title="Biblioteca de templates"
          subtitle="Reutilize configuracoes comerciais padronizadas para metas, faixas e politicas de comissionamento."
        >
          <DataTable
            className="table-header-blue table-mobile-cards min-w-[820px]"
            containerClassName="vtur-scroll-y-65"
            headers={
              <tr>
                <th>Nome</th>
                <th>Modo</th>
                <th>Ativo</th>
                <th className="th-actions">Ações</th>
              </tr>
            }
            loading={carregando}
            loadingMessage="Carregando templates..."
            empty={!carregando && filtrados.length === 0}
            emptyMessage={
              <EmptyState
                title="Nenhum template encontrado"
                description={
                  busca.trim()
                    ? "Refine o termo pesquisado para localizar templates cadastrados."
                    : "Crie o primeiro template para padronizar o comissionamento das franquias."
                }
              />
            }
            colSpan={4}
          >
            {filtrados.map((t) => (
              <tr key={t.id}>
                <td data-label="Nome">{t.nome}</td>
                <td data-label="Modo">{t.modo}</td>
                <td data-label="Ativo">{t.ativo ? "Sim" : "Nao"}</td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    actions={[
                      {
                        key: "edit",
                        label: "Editar",
                        onClick: () => iniciarEdicao(t),
                        variant: "ghost",
                      },
                      {
                        key: "delete",
                        label: "Excluir",
                        onClick: () => solicitarExclusao(t),
                        variant: "danger",
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
        <ConfirmDialog
          open={Boolean(templateParaExcluir)}
          title="Excluir template"
          message={`Excluir ${templateParaExcluir?.nome || "este template"}?`}
          confirmLabel="Excluir"
          confirmVariant="danger"
          onCancel={() => setTemplateParaExcluir(null)}
          onConfirm={confirmarExclusao}
        />
      </div>
    </AppPrimerProvider>
  );
}
