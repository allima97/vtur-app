import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { registrarLog } from "../../lib/logs";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type Rule = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: "GERAL" | "ESCALONAVEL";
  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;
  ativo: boolean;
  commission_tier?: Tier[];
};

type Tier = {
  id?: string;
  faixa: "PRE" | "POS";
  de_pct: number;
  ate_pct: number;
  inc_pct_meta: number;
  inc_pct_comissao: number;
};

const emptyRule = {
  id: "",
  nome: "",
  descricao: "",
  tipo: "GERAL" as "GERAL" | "ESCALONAVEL",
  meta_nao_atingida: 0,
  meta_atingida: 0,
  super_meta: 0,
  ativo: true,
  tiers: [] as Tier[],
};

function parseNumberOrZero(value: string) {
  return value === "" ? 0 : Number(value);
}

export default function CommissionRulesIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Parametros");
  const podeEditar = can("Parametros", "edit");

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRule);
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [regraParaInativar, setRegraParaInativar] = useState<Rule | null>(null);
  const [regraParaExcluir, setRegraParaExcluir] = useState<Rule | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      setErro(null);
      const { data, error } = await supabase
        .from("commission_rule")
        .select("*, commission_tier(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRules((data || []) as any);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar regras de comissão.");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(campo: string, valor: any) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function addTier(faixa: "PRE" | "POS") {
    setForm((prev) => ({
      ...prev,
      tiers: [
        ...(prev.tiers || []),
        { faixa, de_pct: 0, ate_pct: 0, inc_pct_meta: 0, inc_pct_comissao: 0 },
      ],
    }));
  }

  function updateTier(idx: number, campo: string, valor: any) {
    setForm((prev) => {
      const list = [...(prev.tiers || [])];
      (list[idx] as any)[campo] = valor;
      return { ...prev, tiers: list };
    });
  }

  function removeTier(idx: number) {
    setForm((prev) => ({
      ...prev,
      tiers: (prev.tiers || []).filter((_, i) => i !== idx),
    }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEditar) return;
    setErroValidacao(null);
    if (!form.nome.trim()) {
      setErro("Informe o nome da regra.");
      return;
    }
    if (form.tipo === "ESCALONAVEL") {
      if (!form.tiers || form.tiers.length === 0) {
        setErroValidacao("Adicione pelo menos uma faixa PRE ou POS.");
        return;
      }
      for (const t of form.tiers) {
        if (t.de_pct > t.ate_pct) {
          setErroValidacao("Em uma faixa, o valor inicial não pode ser maior que o final.");
          return;
        }
      }
      const faixas = ["PRE", "POS"] as const;
      for (const faixa of faixas) {
        const lista = (form.tiers || [])
          .filter((t) => t.faixa === faixa)
          .sort((a, b) => a.de_pct - b.de_pct);
        for (let i = 1; i < lista.length; i++) {
          const prev = lista[i - 1];
          const curr = lista[i];
          if (prev.ate_pct > curr.de_pct) {
            setErroValidacao(
              `Faixas ${faixa} sobrepostas: finalize a faixa anterior em ${prev.ate_pct}% antes de iniciar ${curr.de_pct}%.`,
            );
            return;
          }
        }
      }
    }
    try {
      setSalvando(true);
      setErro(null);
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao || null,
        tipo: form.tipo,
        meta_nao_atingida: form.meta_nao_atingida ?? 0,
        meta_atingida: form.meta_atingida ?? 0,
        super_meta: form.super_meta ?? 0,
        ativo: form.ativo,
      };

      let regraId = editId;
      if (editId) {
        const { error } = await supabase
          .from("commission_rule")
          .update(payload)
          .eq("id", editId);
        if (error) throw error;
        regraId = editId;
      } else {
        const { data, error } = await supabase
          .from("commission_rule")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        regraId = data?.id;
      }

      if (regraId) {
        await supabase.from("commission_tier").delete().eq("rule_id", regraId);
        if (form.tiers && form.tiers.length > 0) {
          const tiers = form.tiers.map((t) => ({
            rule_id: regraId,
            faixa: t.faixa,
            de_pct: Number(t.de_pct) || 0,
            ate_pct: Number(t.ate_pct) || 0,
            inc_pct_meta: Number(t.inc_pct_meta) || 0,
            inc_pct_comissao: Number(t.inc_pct_comissao) || 0,
            ativo: true,
          }));
          const { error: tierErr } = await supabase.from("commission_tier").insert(tiers);
          if (tierErr) throw tierErr;
        }
      }

      await registrarLog({
        user_id: (await supabase.auth.getUser()).data.user?.id || null,
        acao: editId ? "commission_rule_editada" : "commission_rule_criada",
        modulo: "Parametros",
        detalhes: payload,
      });

      setForm(emptyRule);
      setEditId(null);
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar regra.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirFormularioRegra() {
    setForm(emptyRule);
    setEditId(null);
    setErro(null);
    setErroValidacao(null);
    setMostrarFormulario(true);
  }

  function fecharFormularioRegra() {
    setForm(emptyRule);
    setEditId(null);
    setErro(null);
    setErroValidacao(null);
    setMostrarFormulario(false);
  }

  async function inativar(id: string) {
    if (!podeEditar) return;
    const { error } = await supabase
      .from("commission_rule")
      .update({ ativo: false })
      .eq("id", id);
    if (!error) carregar();
  }

  async function excluirRegra(id: string) {
    if (!podeEditar) return;
    const { error: tierErr } = await supabase.from("commission_tier").delete().eq("rule_id", id);
    if (tierErr) {
      setErro("Erro ao excluir faixas da regra.");
      return;
    }
    const { error } = await supabase.from("commission_rule").delete().eq("id", id);
    if (error) {
      setErro("Erro ao excluir regra.");
      return;
    }
    await registrarLog({
      user_id: (await supabase.auth.getUser()).data.user?.id || null,
      acao: "commission_rule_excluida",
      modulo: "Parametros",
      detalhes: { id },
    });
    carregar();
  }

  function solicitarInativacao(regra: Rule) {
    if (!podeEditar) return;
    setRegraParaInativar(regra);
  }

  function solicitarExclusao(regra: Rule) {
    if (!podeEditar) return;
    setRegraParaExcluir(regra);
  }

  function editar(regra: Rule) {
    setEditId(regra.id);
    setForm({
      id: regra.id,
      nome: regra.nome,
      descricao: regra.descricao || "",
      tipo: regra.tipo,
      meta_nao_atingida: regra.meta_nao_atingida ?? 0,
      meta_atingida: regra.meta_atingida ?? 0,
      super_meta: regra.super_meta ?? 0,
      ativo: regra.ativo,
      tiers:
        regra.tipo === "ESCALONAVEL"
          ? regra.commission_tier?.map((t) => ({
              faixa: t.faixa as "PRE" | "POS",
              de_pct: t.de_pct,
              ate_pct: t.ate_pct,
              inc_pct_meta: t.inc_pct_meta,
              inc_pct_comissao: t.inc_pct_comissao,
            })) || []
          : [],
    });
    setMostrarFormulario(true);
    setErro(null);
    setErroValidacao(null);
  }

  if (loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Acesso negado ao modulo de Parametros.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  const regrasExibidas = rules.slice(0, 5);
  const resumoLista = `${rules.length} regra(s) cadastrada(s). Exibindo ${regrasExibidas.length} item(ns) na listagem principal.`;

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap regras-comissao-page">
        {!mostrarFormulario && (
          <AppToolbar
            sticky
            tone="config"
            className="mb-4 list-toolbar-sticky"
            title="Regras de comissao"
            subtitle={resumoLista}
            actions={
              podeEditar ? (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={abrirFormularioRegra}
                  disabled={mostrarFormulario}
                >
                  Adicionar regra
                </AppButton>
              ) : undefined
            }
          />
        )}

        {!mostrarFormulario && erro && (
          <AlertMessage variant="error" className="mb-3">
            <strong>{erro}</strong>
          </AlertMessage>
        )}
        {mostrarFormulario && erro && (
          <AlertMessage variant="error" className="mb-3">
            <strong>{erro}</strong>
          </AlertMessage>
        )}
        {mostrarFormulario && erroValidacao && (
          <AlertMessage variant="error" className="mb-3">
            <strong>{erroValidacao}</strong>
          </AlertMessage>
        )}

        {mostrarFormulario && (
          <AppCard
            tone="info"
            title={editId ? "Editar regra de comissao" : "Nova regra de comissao"}
            subtitle="Defina percentuais fixos ou faixas escalonaveis para padronizar o calculo comercial."
          >
            <form onSubmit={salvar}>
              <div className="vtur-form-grid vtur-form-grid-4" style={{ marginTop: 12 }}>
                <AppField
                  label="Nome *"
                  value={form.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  required
                  disabled={!podeEditar}
                  wrapperClassName="md:col-span-2"
                />
                <AppField
                  as="select"
                  label="Tipo"
                  value={form.tipo}
                  onChange={(e) =>
                    handleChange("tipo", e.target.value === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL")
                  }
                  disabled={!podeEditar}
                  options={[
                    { value: "GERAL", label: "Geral (percentuais fixos)" },
                    { value: "ESCALONAVEL", label: "Escalonavel (faixas)" },
                  ]}
                />
                <AppField
                  type="number"
                  step="0.01"
                  label="Meta nao atingida (%)"
                  value={form.meta_nao_atingida}
                  onChange={(e) => handleChange("meta_nao_atingida", parseNumberOrZero(e.target.value))}
                  disabled={!podeEditar}
                />
                <AppField
                  type="number"
                  step="0.01"
                  label="Meta atingida (%)"
                  value={form.meta_atingida}
                  onChange={(e) => handleChange("meta_atingida", parseNumberOrZero(e.target.value))}
                  disabled={!podeEditar}
                />
                <AppField
                  type="number"
                  step="0.01"
                  label="Super meta (%)"
                  value={form.super_meta}
                  onChange={(e) => handleChange("super_meta", parseNumberOrZero(e.target.value))}
                  disabled={!podeEditar}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <AppField
                  as="textarea"
                  label="Descricao"
                  rows={3}
                  value={form.descricao || ""}
                  onChange={(e) => handleChange("descricao", e.target.value)}
                  disabled={!podeEditar}
                />
              </div>

              {form.tipo === "ESCALONAVEL" && (
                <AppCard
                  className="vtur-sales-embedded-card"
                  tone="config"
                  title="Faixas escalonaveis"
                  subtitle="Monte faixas PRE e POS sem sobreposicao de intervalos."
                  actions={
                    <div className="vtur-form-actions" style={{ marginTop: 0 }}>
                      <AppButton
                        type="button"
                        variant="primary"
                        onClick={() => addTier("PRE")}
                        disabled={!podeEditar}
                      >
                        + Faixa PRE
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="primary"
                        onClick={() => addTier("POS")}
                        disabled={!podeEditar}
                      >
                        + Faixa POS
                      </AppButton>
                    </div>
                  }
                >
                  <DataTable
                    className="table-mobile-cards min-w-[800px]"
                    headers={
                      <tr>
                        <th>Faixa</th>
                        <th>De (%)</th>
                        <th>Ate (%)</th>
                        <th>Inc. Meta (%)</th>
                        <th>Inc. Comissao (%)</th>
                        <th>Ações</th>
                      </tr>
                    }
                    loading={false}
                    empty={!form.tiers || form.tiers.length === 0}
                    emptyMessage={
                      <EmptyState
                        title="Nenhuma faixa adicionada"
                        description="Adicione ao menos uma faixa PRE ou POS para regras escalonaveis."
                      />
                    }
                    colSpan={6}
                  >
                    {form.tiers?.map((t, idx) => (
                      <tr key={idx}>
                        <td data-label="Faixa">{t.faixa}</td>
                        <td data-label="De (%)">
                          <AppField
                            label="De (%)"
                            type="number"
                            step="0.01"
                            value={t.de_pct}
                            onChange={(e) => updateTier(idx, "de_pct", parseNumberOrZero(e.target.value))}
                            disabled={!podeEditar}
                            wrapperClassName="mb-0"
                          />
                        </td>
                        <td data-label="Ate (%)">
                          <AppField
                            label="Ate (%)"
                            type="number"
                            step="0.01"
                            value={t.ate_pct}
                            onChange={(e) => updateTier(idx, "ate_pct", parseNumberOrZero(e.target.value))}
                            disabled={!podeEditar}
                            wrapperClassName="mb-0"
                          />
                        </td>
                        <td data-label="Inc. Meta (%)">
                          <AppField
                            label="Inc. Meta (%)"
                            type="number"
                            step="0.01"
                            value={t.inc_pct_meta}
                            onChange={(e) => updateTier(idx, "inc_pct_meta", parseNumberOrZero(e.target.value))}
                            disabled={!podeEditar}
                            wrapperClassName="mb-0"
                          />
                        </td>
                        <td data-label="Inc. Comissao (%)">
                          <AppField
                            label="Inc. Comissao (%)"
                            type="number"
                            step="0.01"
                            value={t.inc_pct_comissao}
                            onChange={(e) => updateTier(idx, "inc_pct_comissao", parseNumberOrZero(e.target.value))}
                            disabled={!podeEditar}
                            wrapperClassName="mb-0"
                          />
                        </td>
                        <td className="th-actions" data-label="Ações">
                          <TableActions
                            show={podeEditar}
                            actions={[
                              {
                                key: `remove-${idx}`,
                                label: "Excluir faixa",
                                onClick: () => removeTier(idx),
                                variant: "danger",
                                disabled: !podeEditar,
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </AppCard>
              )}

              <div className="vtur-form-actions mt-2">
                <AppButton type="submit" variant="primary" disabled={!podeEditar || salvando}>
                  {salvando ? "Salvando..." : editId ? "Salvar alteracoes" : "Salvar regra"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={fecharFormularioRegra}
                  disabled={salvando}
                >
                  Cancelar
                </AppButton>
              </div>
            </form>
          </AppCard>
        )}

        {!mostrarFormulario && (
          <AppCard
            tone="config"
            title="Regras cadastradas"
            subtitle="Consulte, revise e mantenha as regras gerais e escalonaveis ativas para a operacao."
          >
            <DataTable
              className="table-mobile-cards min-w-[900px]"
              containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
              headers={
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Ativo</th>
                  <th>Faixas</th>
                  <th>Ações</th>
                </tr>
              }
              loading={loading}
              loadingMessage="Carregando regras..."
              empty={!loading && regrasExibidas.length === 0}
              emptyMessage={
                <EmptyState
                  title="Nenhuma regra cadastrada"
                  description="Crie a primeira regra para estruturar percentuais fixos e faixas escalonaveis."
                  action={
                    podeEditar ? (
                      <AppButton type="button" variant="primary" onClick={abrirFormularioRegra}>
                        Adicionar regra
                      </AppButton>
                    ) : undefined
                  }
                />
              }
              colSpan={5}
            >
              {regrasExibidas.map((r) => (
                <tr key={r.id}>
                  <td data-label="Nome">{r.nome}</td>
                  <td data-label="Tipo">{r.tipo}</td>
                  <td data-label="Ativo">{r.ativo ? "Sim" : "Nao"}</td>
                  <td data-label="Faixas">{r.commission_tier?.length || 0}</td>
                  <td className="th-actions" data-label="Ações">
                    <TableActions
                      actions={[
                        {
                          key: `edit-${r.id}`,
                          label: "Editar",
                          onClick: () => editar(r),
                          variant: "ghost",
                        },
                        {
                          key: `pause-${r.id}`,
                          label: "Inativar",
                          onClick: () => solicitarInativacao(r),
                          variant: "danger",
                          disabled: !podeEditar,
                        },
                        {
                          key: `delete-${r.id}`,
                          label: "Excluir",
                          onClick: () => solicitarExclusao(r),
                          variant: "danger",
                          disabled: !podeEditar,
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </AppCard>
        )}
        <ConfirmDialog
          open={Boolean(regraParaInativar)}
          title="Inativar regra"
          message={`Inativar ${regraParaInativar?.nome || "esta regra"}?`}
          confirmLabel="Inativar"
          confirmVariant="danger"
          onCancel={() => setRegraParaInativar(null)}
          onConfirm={async () => {
            if (!regraParaInativar) return;
            await inativar(regraParaInativar.id);
            setRegraParaInativar(null);
          }}
        />
        <ConfirmDialog
          open={Boolean(regraParaExcluir)}
          title="Excluir regra"
          message={`Excluir permanentemente ${regraParaExcluir?.nome || "esta regra"}?`}
          confirmLabel="Excluir"
          confirmVariant="danger"
          onCancel={() => setRegraParaExcluir(null)}
          onConfirm={async () => {
            if (!regraParaExcluir) return;
            await excluirRegra(regraParaExcluir.id);
            setRegraParaExcluir(null);
          }}
        />
      </div>
    </AppPrimerProvider>
  );
}
