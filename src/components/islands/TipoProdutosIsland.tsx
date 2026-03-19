import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
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

type TipoProduto = {
  id: string;
  nome: string | null;
  tipo: string;
  regra_comissionamento: string;
  soma_na_meta: boolean;
  ativo: boolean;
  created_at: string | null;
  usa_meta_produto?: boolean | null;
  meta_produto_valor?: number | null;
  comissao_produto_meta_pct?: number | null;
  descontar_meta_geral?: boolean | null;
  exibe_kpi_comissao?: boolean | null;
};

type Regra = {
  id: string;
  nome: string;
  tipo: string;
};

type TipoPacote = {
  id: string;
  nome: string;
  rule_id?: string | null;
  fix_meta_nao_atingida?: number | null;
  fix_meta_atingida?: number | null;
  fix_super_meta?: number | null;
  ativo?: boolean | null;
};

type ComissaoProduto = {
  rule_id?: string;
  fix_meta_nao_atingida?: number | null;
  fix_meta_atingida?: number | null;
  fix_super_meta?: number | null;
};

type ComissaoPacote = {
  tipo_pacote: string;
  tipo_pacote_id?: string;
  rule_id?: string;
  fix_meta_nao_atingida?: number | null;
  fix_meta_atingida?: number | null;
  fix_super_meta?: number | null;
};

export default function TipoProdutosIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Parametros");
  const podeCriar = can("Parametros", "create");
  const podeEditar = can("Parametros", "edit");
  const podeExcluir = can("Parametros", "admin");
  const modoSomenteLeitura = !podeCriar && !podeEditar;

  const {
    items: tipos,
    loading: loadingTipos,
    saving: salvando,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load: loadTipos,
    create,
    update,
    remove,
  } = useCrudResource<TipoProduto>({
    table: "tipo_produtos",
    select: "*",
  });

  const [loadingExtras, setLoadingExtras] = useState(true);
  const loading = loadingTipos || loadingExtras;
  const [busca, setBusca] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tipoParaExcluir, setTipoParaExcluir] = useState<TipoProduto | null>(null);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [tiposPacote, setTiposPacote] = useState<TipoPacote[]>([]);
  const [produtoRegraMap, setProdutoRegraMap] = useState<Record<string, ComissaoProduto>>({});
  const [pacotesPorProduto, setPacotesPorProduto] = useState<Record<string, ComissaoPacote[]>>({});
  const [tiposPacoteSelecionados, setTiposPacoteSelecionados] = useState<string[]>([]);
  const [regraSelecionada, setRegraSelecionada] = useState<string>("");
  const [fixMetaNao, setFixMetaNao] = useState<string>("");
  const [fixMetaAtingida, setFixMetaAtingida] = useState<string>("");
  const [fixSuperMeta, setFixSuperMeta] = useState<string>("");
  const [usaMetaProduto, setUsaMetaProduto] = useState(false);
  const [metaProdutoValor, setMetaProdutoValor] = useState<string>("");
  const [comissaoProdutoMetaPct, setComissaoProdutoMetaPct] = useState<string>("");
  const [descontarMetaGeral, setDescontarMetaGeral] = useState(true);
  const [exibeKpiComissao, setExibeKpiComissao] = useState(true);
  const [suportaExibeKpi, setSuportaExibeKpi] = useState(true);
  const [form, setForm] = useState({
    nome: "",
    tipo: "",
    regra_comissionamento: "geral",
    soma_na_meta: true,
    ativo: true,
  });
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [modalDuplicado, setModalDuplicado] = useState<{ entity: "Tipo de Produto" } | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  function handleChange(campo: string, valor: string | boolean) {
    setForm((prev) => {
      if (campo === "nome") {
        const nomeVal = String(valor);
        return { ...prev, nome: nomeVal, tipo: prev.tipo || nomeVal };
      }
      return { ...prev, [campo]: valor };
    });
  }

  function toggleTipoPacoteSelection(id: string) {
    setTiposPacoteSelecionados((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }

  async function carregar() {
    setLoadingExtras(true);
    setErro(null);

    try {
      const [tiposResult, regrasData, mapData, pacotesData, tiposPacoteData, colExibeKpi] = await Promise.all([
        loadTipos({
          order: { column: "nome", ascending: true },
          errorMessage: "Erro ao carregar tipos de produto.",
        }),
        supabase.from("commission_rule").select("id, nome, tipo").eq("ativo", true).order("nome"),
        supabase
          .from("product_commission_rule")
          .select("produto_id, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta"),
        supabase
          .from("product_commission_rule_pacote")
          .select("produto_id, tipo_pacote, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta")
          .order("tipo_pacote", { ascending: true }),
        supabase
          .from("tipo_pacotes")
          .select("id, nome, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta, ativo")
          .eq("ativo", true)
          .order("nome"),
        supabase.from("tipo_produtos").select("exibe_kpi_comissao").limit(1),
      ]);

      if (tiposResult.error) return;

      setSuportaExibeKpi(!colExibeKpi.error);
      setRegras((regrasData.data as Regra[]) || []);

      const map: Record<string, ComissaoProduto> = {};
      ((mapData.data as any[]) || []).forEach((item: any) => {
        map[item.produto_id] = {
          rule_id: item.rule_id || "",
          fix_meta_nao_atingida: item.fix_meta_nao_atingida,
          fix_meta_atingida: item.fix_meta_atingida,
          fix_super_meta: item.fix_super_meta,
        };
      });
      setProdutoRegraMap(map);

      const tiposPacoteLista = ((tiposPacoteData.data as any[]) || []).map((item) => ({
        id: item.id,
        nome: item.nome || "",
        rule_id: item.rule_id || null,
        fix_meta_nao_atingida: item.fix_meta_nao_atingida,
        fix_meta_atingida: item.fix_meta_atingida,
        fix_super_meta: item.fix_super_meta,
        ativo: item.ativo,
      })) as TipoPacote[];
      setTiposPacote(tiposPacoteLista);

      const pacotesMap: Record<string, ComissaoPacote[]> = {};
      ((pacotesData.data as any[]) || []).forEach((item: any) => {
        if (!item.produto_id) return;
        const tipoPacoteId = tiposPacoteLista.find(
          (tipo) =>
            normalizeText(tipo.nome || "") ===
            normalizeText(item.tipo_pacote || "", { trim: true, collapseWhitespace: true })
        )?.id;
        const entry: ComissaoPacote = {
          tipo_pacote: item.tipo_pacote || "",
          tipo_pacote_id: tipoPacoteId || "",
          rule_id: item.rule_id || "",
          fix_meta_nao_atingida: item.fix_meta_nao_atingida,
          fix_meta_atingida: item.fix_meta_atingida,
          fix_super_meta: item.fix_super_meta,
        };
        if (!pacotesMap[item.produto_id]) pacotesMap[item.produto_id] = [];
        pacotesMap[item.produto_id].push(entry);
      });
      setPacotesPorProduto(pacotesMap);
    } catch (error) {
      console.error(error);
      setErro("Erro ao carregar tipos de produto.");
    } finally {
      setLoadingExtras(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function iniciarNovo() {
    setForm({
      nome: "",
      tipo: "",
      regra_comissionamento: "geral",
      soma_na_meta: true,
      ativo: true,
    });
    setUsaMetaProduto(false);
    setMetaProdutoValor("");
    setComissaoProdutoMetaPct("");
    setDescontarMetaGeral(true);
    setExibeKpiComissao(true);
    setRegraSelecionada("");
    setFixMetaNao("");
    setFixMetaAtingida("");
    setFixSuperMeta("");
    setTiposPacoteSelecionados([]);
    setEditandoId(null);
    setErro(null);
    setModalDuplicado(null);
  }

  function abrirFormularioTipo() {
    iniciarNovo();
    setMostrarFormulario(true);
    setErro(null);
  }

  function fecharFormularioTipo() {
    iniciarNovo();
    setMostrarFormulario(false);
    setErro(null);
  }

  function iniciarEdicao(tipoProd: TipoProduto) {
    setEditandoId(tipoProd.id);
    setForm({
      nome: tipoProd.nome || tipoProd.tipo,
      tipo: tipoProd.tipo || tipoProd.nome || "",
      regra_comissionamento: tipoProd.regra_comissionamento,
      soma_na_meta: tipoProd.soma_na_meta,
      ativo: tipoProd.ativo,
    });
    setUsaMetaProduto(Boolean(tipoProd.usa_meta_produto));
    setMetaProdutoValor(
      tipoProd.meta_produto_valor !== null && tipoProd.meta_produto_valor !== undefined
        ? String(tipoProd.meta_produto_valor)
        : ""
    );
    setComissaoProdutoMetaPct(
      tipoProd.comissao_produto_meta_pct !== null && tipoProd.comissao_produto_meta_pct !== undefined
        ? String(tipoProd.comissao_produto_meta_pct)
        : ""
    );
    setDescontarMetaGeral(
      tipoProd.descontar_meta_geral !== null && tipoProd.descontar_meta_geral !== undefined
        ? Boolean(tipoProd.descontar_meta_geral)
        : true
    );
    setExibeKpiComissao(
      tipoProd.exibe_kpi_comissao !== null && tipoProd.exibe_kpi_comissao !== undefined
        ? Boolean(tipoProd.exibe_kpi_comissao)
        : true
    );

    const comissao = produtoRegraMap[tipoProd.id] || {};
    setRegraSelecionada(comissao.rule_id || "");
    setFixMetaNao(
      comissao.fix_meta_nao_atingida !== null && comissao.fix_meta_nao_atingida !== undefined
        ? String(comissao.fix_meta_nao_atingida)
        : ""
    );
    setFixMetaAtingida(
      comissao.fix_meta_atingida !== null && comissao.fix_meta_atingida !== undefined
        ? String(comissao.fix_meta_atingida)
        : ""
    );
    setFixSuperMeta(
      comissao.fix_super_meta !== null && comissao.fix_super_meta !== undefined
        ? String(comissao.fix_super_meta)
        : ""
    );

    const tipoPacotesAtual = pacotesPorProduto[tipoProd.id] || [];
    const selecionados = tipoPacotesAtual
      .map((item) => {
        if (!item.tipo_pacote) return null;
        const encontrado = tiposPacote.find(
          (tipo) =>
            normalizeText(tipo.nome || "") ===
            normalizeText(item.tipo_pacote || "", { trim: true, collapseWhitespace: true })
        );
        return encontrado?.id || null;
      })
      .filter((id): id is string => Boolean(id));
    setTiposPacoteSelecionados(Array.from(new Set(selecionados)));
    setMostrarFormulario(true);
    setErro(null);
  }

  async function salvar(event: React.FormEvent) {
    event.preventDefault();

    if (modoSomenteLeitura) {
      setErro("Voce nao tem permissao para salvar tipos de produto.");
      return;
    }

    const nome = titleCaseWithExceptions(form.nome);
    const tipo = titleCaseWithExceptions(form.tipo || nome);
    if (!nome) {
      setErro("Nome e obrigatorio.");
      return;
    }

    const normalizedNome = normalizeText(nome).trim();
    const existeDuplicado = tipos.some(
      (item) => item.id !== editandoId && normalizeText(item.nome || item.tipo || "").trim() === normalizedNome
    );
    if (existeDuplicado) {
      setModalDuplicado({ entity: "Tipo de Produto" });
      return;
    }

    if (form.regra_comissionamento === "geral" && !regraSelecionada) {
      setErro("Selecione uma regra de comissao para produtos do tipo geral.");
      return;
    }

    const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
    const metaProdValor = toNumberOrNull(metaProdutoValor);
    const comissaoMetaPct = toNumberOrNull(comissaoProdutoMetaPct);

    if (form.regra_comissionamento === "diferenciado") {
      const fixNaoNum = toNumberOrNull(fixMetaNao);
      const fixAtNum = toNumberOrNull(fixMetaAtingida);
      const fixSupNum = toNumberOrNull(fixSuperMeta);
      const algumInvalido =
        fixNaoNum === null ||
        Number.isNaN(fixNaoNum) ||
        fixAtNum === null ||
        Number.isNaN(fixAtNum) ||
        fixSupNum === null ||
        Number.isNaN(fixSupNum);
      if (algumInvalido) {
        setErro("Preencha os percentuais fixos para meta nao atingida, meta e super meta.");
        return;
      }
    }

    try {
      setErro(null);
      const payload: Record<string, any> = {
        nome,
        tipo,
        regra_comissionamento: form.regra_comissionamento,
        soma_na_meta: form.soma_na_meta,
        ativo: form.ativo,
        usa_meta_produto: usaMetaProduto,
        meta_produto_valor: usaMetaProduto ? metaProdValor : null,
        comissao_produto_meta_pct: usaMetaProduto ? comissaoMetaPct : null,
        descontar_meta_geral: descontarMetaGeral,
      };
      if (suportaExibeKpi) {
        payload.exibe_kpi_comissao = exibeKpiComissao;
      }

      let tipoId = editandoId;
      if (editandoId) {
        const result = await update(editandoId, payload, {
          errorMessage: "Erro ao salvar tipo de produto.",
        });
        if (result.error) return;
      } else {
        const result = await create(payload, {
          errorMessage: "Erro ao salvar tipo de produto.",
          select: "id",
        });
        if (result.error) return;
        tipoId = (result.data as any)?.id || null;
      }

      if (tipoId) {
        async function garantirRegraFixa(): Promise<string> {
          const nomeRegra = "Comissao Fixa (auto)";
          const { data: regraExistente } = await supabase
            .from("commission_rule")
            .select("id")
            .eq("nome", nomeRegra)
            .maybeSingle();
          if ((regraExistente as any)?.id) return (regraExistente as any).id;

          const { data: regraNova, error: regraErr } = await supabase
            .from("commission_rule")
            .insert({
              nome: nomeRegra,
              descricao: "Gerada automaticamente para produtos diferenciados sem regra vinculada.",
              tipo: "GERAL",
              meta_nao_atingida: 0,
              meta_atingida: 0,
              super_meta: 0,
              ativo: true,
            })
            .select("id")
            .single();
          if (regraErr) throw regraErr;
          return (regraNova as any)?.id;
        }

        const fixNao = form.regra_comissionamento === "diferenciado" ? toNumberOrNull(fixMetaNao) : null;
        const fixAt =
          form.regra_comissionamento === "diferenciado" ? toNumberOrNull(fixMetaAtingida) : null;
        const fixSup =
          form.regra_comissionamento === "diferenciado" ? toNumberOrNull(fixSuperMeta) : null;

        let ruleIdToUse = regraSelecionada || produtoRegraMap[tipoId]?.rule_id || null;
        if (form.regra_comissionamento === "diferenciado" && !ruleIdToUse) {
          ruleIdToUse = await garantirRegraFixa();
        }

        if (regraSelecionada || form.regra_comissionamento === "diferenciado") {
          const { error: upsertErr } = await supabase.from("product_commission_rule").upsert(
            {
              produto_id: tipoId,
              rule_id: ruleIdToUse,
              ativo: true,
              fix_meta_nao_atingida: fixNao,
              fix_meta_atingida: fixAt,
              fix_super_meta: fixSup,
            },
            { onConflict: "produto_id" }
          );
          if (upsertErr) throw upsertErr;
        } else {
          await supabase.from("product_commission_rule").delete().eq("produto_id", tipoId);
        }
      }

      if (tipoId) {
        await supabase.from("product_commission_rule_pacote").delete().eq("produto_id", tipoId);
        const payloads = tiposPacoteSelecionadosInfo.map((tipoPacote) => ({
          produto_id: tipoId,
          tipo_pacote: tipoPacote.nome,
          rule_id: tipoPacote.rule_id || null,
          fix_meta_nao_atingida: tipoPacote.fix_meta_nao_atingida ?? null,
          fix_meta_atingida: tipoPacote.fix_meta_atingida ?? null,
          fix_super_meta: tipoPacote.fix_super_meta ?? null,
          ativo: true,
        }));
        if (payloads.length > 0) {
          const { error: pacoteErr } = await supabase
            .from("product_commission_rule_pacote")
            .insert(payloads);
          if (pacoteErr) throw pacoteErr;
        }
      }

      iniciarNovo();
      setMostrarFormulario(false);
      await carregar();
      showToast("Tipo de produto salvo.", "success");
    } catch (error) {
      console.error(error);
      setErro(
        error instanceof Error ? `Erro ao salvar tipo de produto: ${error.message}` : "Erro ao salvar tipo de produto."
      );
    }
  }

  async function excluir(id: string) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir tipos de produto.", "error");
      return;
    }

    try {
      const result = await remove(id, {
        errorMessage: "Erro ao excluir tipo de produto. Talvez esteja vinculado a vendas/recibos.",
      });
      if (result.error) return;

      await carregar();
      showToast("Tipo de produto excluido.", "success");
    } catch (error) {
      console.error(error);
      setErro("Erro ao excluir tipo de produto. Talvez esteja vinculado a vendas/recibos.");
    }
  }

  function solicitarExclusao(tipoProduto: TipoProduto) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir tipos de produto.", "error");
      return;
    }
    setTipoParaExcluir(tipoProduto);
  }

  async function confirmarExclusao() {
    if (!tipoParaExcluir) return;
    await excluir(tipoParaExcluir.id);
    setTipoParaExcluir(null);
  }

  const regrasMap = useMemo(() => {
    const map = new Map<string, Regra>();
    regras.forEach((regra) => map.set(regra.id, regra));
    return map;
  }, [regras]);

  const tiposPacoteSelecionadosUnicos = useMemo(
    () => Array.from(new Set(tiposPacoteSelecionados)),
    [tiposPacoteSelecionados]
  );

  const tiposPacoteSelecionadosInfo = useMemo(
    () =>
      tiposPacoteSelecionadosUnicos
        .map((id) => tiposPacote.find((tipo) => tipo.id === id))
        .filter((tipo): tipo is TipoPacote => Boolean(tipo)),
    [tiposPacoteSelecionadosUnicos, tiposPacote]
  );

  const tiposFiltrados = useMemo(() => {
    if (!busca.trim()) return tipos;
    const termo = normalizeText(busca);
    return tipos.filter((item) => normalizeText(item.nome || item.tipo || "").includes(termo));
  }, [busca, tipos]);

  const resumoLista = busca.trim()
    ? `${tiposFiltrados.length} tipo(s) encontrados para a busca atual.`
    : `${tiposFiltrados.length} tipo(s) de produto cadastrados.`;

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
      <div className="produtos-page page-content-wrap">
        {mostrarFormulario && (
          <AppCard
            className="form-card mb-3"
            title={editandoId ? "Editar tipo de produto" : "Novo tipo de produto"}
            subtitle="Configure comissao, meta e vinculos por pacote para o CRM comercial."
            tone="info"
          >
            <form onSubmit={salvar}>
              <div className="vtur-form-grid vtur-form-grid-2">
                <AppField
                  label="Nome *"
                  value={form.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                  disabled={modoSomenteLeitura}
                  validation={!form.nome.trim() && erro ? "Nome e obrigatorio." : undefined}
                />
                <AppField
                  as="select"
                  label="Modelo de comissao"
                  value={form.regra_comissionamento}
                  onChange={(e) => {
                    const value = e.target.value;
                    handleChange("regra_comissionamento", value);
                    if (value === "diferenciado") {
                      setRegraSelecionada("");
                    }
                  }}
                  disabled={modoSomenteLeitura}
                  options={[
                    { value: "geral", label: "Geral (usa regra cadastrada)" },
                    { value: "diferenciado", label: "Diferenciado (percentual fixo)" },
                  ]}
                />
              </div>

              <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 12 }}>
                <AppField
                  as="select"
                  label="Soma na meta?"
                  value={form.soma_na_meta ? "1" : "0"}
                  onChange={(e) => handleChange("soma_na_meta", e.target.value === "1")}
                  disabled={modoSomenteLeitura}
                  options={[
                    { value: "1", label: "Sim" },
                    { value: "0", label: "Nao" },
                  ]}
                />
                <AppField
                  as="select"
                  label="Ativo?"
                  value={form.ativo ? "1" : "0"}
                  onChange={(e) => handleChange("ativo", e.target.value === "1")}
                  disabled={modoSomenteLeitura}
                  options={[
                    { value: "1", label: "Sim" },
                    { value: "0", label: "Nao" },
                  ]}
                />
                <AppField
                  as="select"
                  label="Usa meta por produto?"
                  value={usaMetaProduto ? "1" : "0"}
                  onChange={(e) => setUsaMetaProduto(e.target.value === "1")}
                  disabled={modoSomenteLeitura}
                  options={[
                    { value: "1", label: "Sim" },
                    { value: "0", label: "Nao" },
                  ]}
                />
              </div>

              {form.regra_comissionamento === "geral" && (
                <div style={{ marginTop: 12 }}>
                  <AppField
                    as="select"
                    label="Regra de Comissao *"
                    value={regraSelecionada}
                    onChange={(e) => setRegraSelecionada(e.target.value)}
                    disabled={modoSomenteLeitura}
                    required
                    validation={!regraSelecionada && erro ? "Selecione uma regra de comissao." : undefined}
                    options={[
                      { value: "", label: "Selecione" },
                      ...regras.map((regra) => ({
                        value: regra.id,
                        label: `${regra.nome} (${regra.tipo})`,
                      })),
                    ]}
                  />
                </div>
              )}

              {form.regra_comissionamento === "diferenciado" && (
                <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 12 }}>
                  <AppField
                    label="Comissao fixa (meta nao atingida) %"
                    type="number"
                    step="0.01"
                    value={fixMetaNao}
                    onChange={(e) => setFixMetaNao(e.target.value)}
                    disabled={modoSomenteLeitura}
                  />
                  <AppField
                    label="Comissao fixa (meta atingida) %"
                    type="number"
                    step="0.01"
                    value={fixMetaAtingida}
                    onChange={(e) => setFixMetaAtingida(e.target.value)}
                    disabled={modoSomenteLeitura}
                  />
                  <AppField
                    label="Comissao fixa (super meta) %"
                    type="number"
                    step="0.01"
                    value={fixSuperMeta}
                    onChange={(e) => setFixSuperMeta(e.target.value)}
                    disabled={modoSomenteLeitura}
                  />
                </div>
              )}

              {usaMetaProduto && (
                <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 12 }}>
                  <AppField
                    label="Meta do produto"
                    type="number"
                    step="0.01"
                    value={metaProdutoValor}
                    onChange={(e) => setMetaProdutoValor(e.target.value)}
                    disabled={modoSomenteLeitura}
                  />
                  <AppField
                    label="Comissao por meta (%)"
                    type="number"
                    step="0.01"
                    value={comissaoProdutoMetaPct}
                    onChange={(e) => setComissaoProdutoMetaPct(e.target.value)}
                    disabled={modoSomenteLeitura}
                  />
                  <AppField
                    as="select"
                    label="Descontar da meta geral?"
                    value={descontarMetaGeral ? "1" : "0"}
                    onChange={(e) => setDescontarMetaGeral(e.target.value === "1")}
                    disabled={modoSomenteLeitura}
                    options={[
                      { value: "1", label: "Sim" },
                      { value: "0", label: "Nao" },
                    ]}
                  />
                </div>
              )}

              {suportaExibeKpi && (
                <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 12 }}>
                  <AppField
                    as="select"
                    label="Exibir KPI de comissao?"
                    value={exibeKpiComissao ? "1" : "0"}
                    onChange={(e) => setExibeKpiComissao(e.target.value === "1")}
                    disabled={modoSomenteLeitura}
                    options={[
                      { value: "1", label: "Sim" },
                      { value: "0", label: "Nao" },
                    ]}
                  />
                </div>
              )}

              <div className="vtur-app-card" style={{ marginTop: 12 }}>
                <div className="vtur-app-card-header">
                  <div className="vtur-app-card-copy">
                    <h3 className="vtur-app-card-title">Tipos de pacote vinculados</h3>
                    <p className="vtur-app-card-subtitle">
                      Selecione um ou mais tipos de pacote. O sistema aplica as regras cadastradas em parametros.
                    </p>
                  </div>
                </div>
                {tiposPacote.length === 0 ? (
                  <AlertMessage variant="info">
                    Cadastre tipos de pacote antes de vincular regras especificas a este produto.
                  </AlertMessage>
                ) : (
                  <div className="vtur-choice-grid">
                    {tiposPacote.map((tipoPacote) => {
                      const selected = tiposPacoteSelecionadosUnicos.includes(tipoPacote.id);
                      const regra = tipoPacote.rule_id ? regrasMap.get(tipoPacote.rule_id) : null;
                      const descricaoRegra = regra
                        ? `${regra.nome} (${regra.tipo})`
                        : tipoPacote.fix_meta_nao_atingida != null ||
                            tipoPacote.fix_meta_atingida != null ||
                            tipoPacote.fix_super_meta != null
                          ? "Comissao fixa"
                          : "Sem regra definida";
                      return (
                        <AppButton
                          key={tipoPacote.id}
                          type="button"
                          variant={selected ? "primary" : "secondary"}
                          className="vtur-choice-button"
                          onClick={() => toggleTipoPacoteSelection(tipoPacote.id)}
                          disabled={modoSomenteLeitura}
                        >
                          <span className="vtur-choice-button-content">
                            <span className="vtur-choice-button-title">{tipoPacote.nome}</span>
                            <span className="vtur-choice-button-caption">{descricaoRegra}</span>
                          </span>
                        </AppButton>
                      );
                    })}
                  </div>
                )}

                {tiposPacoteSelecionadosInfo.length > 0 && (
                  <div className="vtur-inline-note">
                    <strong>Regras aplicadas:</strong>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      {tiposPacoteSelecionadosInfo.map((tipoPacote) => {
                        const regra = tipoPacote.rule_id ? regrasMap.get(tipoPacote.rule_id) : null;
                        const fixPartes: string[] = [];
                        if (tipoPacote.fix_meta_nao_atingida != null) {
                          fixPartes.push(`Meta nao: ${tipoPacote.fix_meta_nao_atingida}%`);
                        }
                        if (tipoPacote.fix_meta_atingida != null) {
                          fixPartes.push(`Meta: ${tipoPacote.fix_meta_atingida}%`);
                        }
                        if (tipoPacote.fix_super_meta != null) {
                          fixPartes.push(`Super meta: ${tipoPacote.fix_super_meta}%`);
                        }
                        return (
                          <li key={tipoPacote.id}>
                            <strong>{tipoPacote.nome}</strong> -{" "}
                            {regra ? `${regra.nome} (${regra.tipo})` : "Comissao fixa"}
                            {fixPartes.length > 0 ? ` (${fixPartes.join(" | ")})` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {!modoSomenteLeitura && (
                <div className="vtur-form-actions mobile-stack-buttons" style={{ marginTop: 12 }}>
                  <AppButton type="submit" variant="primary" loading={salvando}>
                    {editandoId ? "Salvar alteracoes" : "Salvar tipo"}
                  </AppButton>
                  <AppButton type="button" variant="secondary" onClick={fecharFormularioTipo}>
                    Cancelar
                  </AppButton>
                </div>
              )}
            </form>
          </AppCard>
        )}

        {!mostrarFormulario && (
          <>
            <AppCard
              tone="config"
              className="mb-3 list-toolbar-sticky"
              title="Tipos de produto"
              subtitle={resumoLista}
              actions={
                !modoSomenteLeitura ? (
                  <AppButton type="button" variant="primary" onClick={abrirFormularioTipo}>
                    Novo produto
                  </AppButton>
                ) : null
              }
            >
              <div className="vtur-toolbar-grid">
                <AppField
                  label="Buscar tipo de produto"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite parte do nome..."
                />
              </div>
            </AppCard>

            {erro && (
              <div className="mb-3">
                <AlertMessage variant="error">{erro}</AlertMessage>
              </div>
            )}

            <DataTable
              shellClassName="mb-3"
              className="table-default table-header-blue table-mobile-cards min-w-[720px]"
              containerClassName="vtur-scroll-y-65"
              headers={
                <tr>
                  <th>Nome</th>
                  <th>Modelo</th>
                  <th>Regra vinculada</th>
                  <th>Soma meta</th>
                  <th>Ativo</th>
                  <th>Criado em</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              loading={loading}
              loadingMessage="Carregando tipos de produto..."
              empty={!loading && tiposFiltrados.length === 0}
              emptyMessage={
                <EmptyState
                  title="Nenhum tipo encontrado"
                  description={
                    busca.trim()
                      ? "Tente ajustar a busca ou cadastre um novo tipo de produto."
                      : "Cadastre um tipo de produto para comecar."
                  }
                />
              }
              colSpan={7}
            >
              {tiposFiltrados.map((tipoProduto) => {
                const comissao = produtoRegraMap[tipoProduto.id];
                const regra = comissao?.rule_id ? regrasMap.get(comissao.rule_id) : null;
                const possuiFixa =
                  comissao &&
                  [comissao.fix_meta_nao_atingida, comissao.fix_meta_atingida, comissao.fix_super_meta].some(
                    (value) => value !== null && value !== undefined
                  );
                return (
                  <tr key={tipoProduto.id}>
                    <td data-label="Nome">{tipoProduto.nome || tipoProduto.tipo}</td>
                    <td data-label="Modelo">{tipoProduto.regra_comissionamento}</td>
                    <td data-label="Regra vinculada">
                      {regra ? regra.nome : possuiFixa ? "Comissao fixa" : "-"}
                    </td>
                    <td data-label="Soma meta">{tipoProduto.soma_na_meta ? "Sim" : "Nao"}</td>
                    <td data-label="Ativo">{tipoProduto.ativo ? "Ativo" : "Inativo"}</td>
                    <td data-label="Criado em">
                      {tipoProduto.created_at
                        ? new Date(tipoProduto.created_at).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <TableActions
                        show={!modoSomenteLeitura}
                        actions={[
                          ...(!modoSomenteLeitura
                            ? [
                                {
                                  key: "edit",
                                  label: "Editar",
                                  onClick: () => iniciarEdicao(tipoProduto),
                                },
                              ]
                            : []),
                          ...(podeExcluir
                            ? [
                                {
                                  key: "delete",
                                  label: "Excluir",
                                  onClick: () => solicitarExclusao(tipoProduto),
                                  variant: "danger" as const,
                                  disabled: excluindoId === tipoProduto.id,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </>
        )}

        <ConfirmDialog
          open={Boolean(tipoParaExcluir)}
          title="Excluir tipo de produto"
          message={`Tem certeza que deseja excluir ${tipoParaExcluir?.nome || "este tipo"}?`}
          confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(excluindoId)}
          onCancel={() => setTipoParaExcluir(null)}
          onConfirm={confirmarExclusao}
        />
        <AppNoticeDialog
          open={Boolean(modalDuplicado)}
          title="ATENCAO"
          icon={<i className="pi pi-exclamation-triangle" aria-hidden="true" />}
          message={modalDuplicado ? `${modalDuplicado.entity} ja cadastrado.` : ""}
          onClose={() => setModalDuplicado(null)}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
