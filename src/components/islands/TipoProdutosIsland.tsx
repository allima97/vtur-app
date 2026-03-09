import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { AlertTriangle } from "lucide-react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
import { useCrudResource } from "../../lib/useCrudResource";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";

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

  function handleChange(campo: string, valor: any) {
    setForm((prev) => {
      if (campo === "nome") {
        const nomeVal = String(valor);
        return { ...prev, nome: nomeVal, tipo: prev.tipo || nomeVal };
      }
      return { ...prev, [campo]: valor };
    });
  }

  function handleTipoPacoteSelection(event: React.ChangeEvent<HTMLSelectElement>) {
    const selected = Array.from(event.target.selectedOptions, (option) => option.value);
    setTiposPacoteSelecionados(Array.from(new Set(selected)));
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
        supabase
          .from("commission_rule")
          .select("id, nome, tipo")
          .eq("ativo", true)
          .order("nome"),
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

      const suporta = !colExibeKpi.error;
      setSuportaExibeKpi(suporta);
      setRegras((regrasData.data as any) || []);
      const map: Record<string, ComissaoProduto> = {};
      (mapData.data as any)?.forEach((r: any) => {
        map[r.produto_id] = {
          rule_id: r.rule_id || "",
          fix_meta_nao_atingida: r.fix_meta_nao_atingida,
          fix_meta_atingida: r.fix_meta_atingida,
          fix_super_meta: r.fix_super_meta,
        };
      });
      setProdutoRegraMap(map);

      const tiposPacoteLista = (tiposPacoteData.data as any[] | undefined) || [];
      setTiposPacote(
        tiposPacoteLista.map((p) => ({
          id: p.id,
          nome: p.nome || "",
          rule_id: p.rule_id || null,
          fix_meta_nao_atingida: p.fix_meta_nao_atingida,
          fix_meta_atingida: p.fix_meta_atingida,
          fix_super_meta: p.fix_super_meta,
          ativo: p.ativo,
        }))
      );

      const pacotesMap: Record<string, ComissaoPacote[]> = {};
      (pacotesData.data as any)?.forEach((r: any) => {
        if (!r.produto_id) return;
        const tipoPacoteId = tiposPacoteLista.find(
          (p) =>
            normalizeText(p.nome || "") ===
            normalizeText(r.tipo_pacote || "", { trim: true, collapseWhitespace: true })
        )?.id;
        const entry: ComissaoPacote = {
          tipo_pacote: r.tipo_pacote || "",
          tipo_pacote_id: tipoPacoteId || "",
          rule_id: r.rule_id || "",
          fix_meta_nao_atingida: r.fix_meta_nao_atingida,
          fix_meta_atingida: r.fix_meta_atingida,
          fix_super_meta: r.fix_super_meta,
        };
        if (!pacotesMap[r.produto_id]) pacotesMap[r.produto_id] = [];
        pacotesMap[r.produto_id].push(entry);
      });
      setPacotesPorProduto(pacotesMap);
    } catch (e) {
      console.error(e);
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
    setUsaMetaProduto(!!tipoProd.usa_meta_produto);
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
        ? !!tipoProd.descontar_meta_geral
        : true
    );
    setExibeKpiComissao(
      tipoProd.exibe_kpi_comissao !== null && tipoProd.exibe_kpi_comissao !== undefined
        ? !!tipoProd.exibe_kpi_comissao
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
      .map((p) => {
        if (!p.tipo_pacote) return null;
        const encontrado = tiposPacote.find(
          (tipo) =>
            normalizeText(tipo.nome || "") ===
            normalizeText(p.tipo_pacote || "", { trim: true, collapseWhitespace: true })
        );
        return encontrado?.id || null;
      })
      .filter((id): id is string => Boolean(id));
    setTiposPacoteSelecionados(Array.from(new Set(selecionados)));
    setMostrarFormulario(true);
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();

    if (modoSomenteLeitura) {
      setErro("Você não tem permissão para salvar tipos de produto.");
      return;
    }
    const nome = titleCaseWithExceptions(form.nome);
    const tipo = titleCaseWithExceptions(form.tipo || nome);
    if (!nome) {
      setErro("Nome é obrigatório.");
      return;
    }
    const normalizedNome = normalizeText(nome).trim();
    const existeDuplicado = tipos.some(
      (p) =>
        p.id !== editandoId &&
        normalizeText(p.nome || p.tipo || "").trim() === normalizedNome
    );
    if (existeDuplicado) {
      setModalDuplicado({ entity: "Tipo de Produto" });
      return;
    }
    if (form.regra_comissionamento === "geral" && !regraSelecionada) {
      setErro("Selecione uma regra de comissão para produtos do tipo 'geral'.");
      return;
    }
    const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const metaProdValor = toNumberOrNull(metaProdutoValor);
    const comissaoMetaPct = toNumberOrNull(comissaoProdutoMetaPct);
    if (form.regra_comissionamento === "diferenciado") {
      const fixNaoNum = toNumberOrNull(fixMetaNao);
      const fixAtNum = toNumberOrNull(fixMetaAtingida);
      const fixSupNum = toNumberOrNull(fixSuperMeta);
      const algumInvalido =
        fixNaoNum === null ||
        isNaN(fixNaoNum) ||
        fixAtNum === null ||
        isNaN(fixAtNum) ||
        fixSupNum === null ||
        isNaN(fixSupNum);
      if (algumInvalido) {
        setErro(
          "Preencha os percentuais fixos para meta não atingida, atingida e super meta (apenas números)."
        );
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
        // garante uma regra para respeitar o NOT NULL de rule_id quando diferenciado
        async function garantirRegraFixa(): Promise<string> {
          const nomeRegra = "Comissão Fixa (auto)";
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

        const fixNao =
          form.regra_comissionamento === "diferenciado"
            ? toNumberOrNull(fixMetaNao)
            : null;
        const fixAt =
          form.regra_comissionamento === "diferenciado"
            ? toNumberOrNull(fixMetaAtingida)
            : null;
        const fixSup =
          form.regra_comissionamento === "diferenciado"
            ? toNumberOrNull(fixSuperMeta)
            : null;

        let ruleIdToUse = regraSelecionada || produtoRegraMap[tipoId]?.rule_id || null;
        if (form.regra_comissionamento === "diferenciado" && !ruleIdToUse) {
          ruleIdToUse = await garantirRegraFixa();
        }

        if (regraSelecionada || form.regra_comissionamento === "diferenciado") {
          const { error: upsertErr } = await supabase
            .from("product_commission_rule")
            .upsert(
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
        const payloads = tiposPacoteSelecionadosInfo.map((tipo) => ({
          produto_id: tipoId,
          tipo_pacote: tipo.nome,
          rule_id: tipo.rule_id || null,
          fix_meta_nao_atingida: tipo.fix_meta_nao_atingida ?? null,
          fix_meta_atingida: tipo.fix_meta_atingida ?? null,
          fix_super_meta: tipo.fix_super_meta ?? null,
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
      await carregar();
    } catch (e) {
      console.error(e);
      setErro(
        e instanceof Error ? `Erro ao salvar tipo de produto: ${e.message}` : "Erro ao salvar tipo de produto."
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
    } catch (e) {
      console.error(e);
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
    return tipos.filter((p) => normalizeText(p.nome || p.tipo || "").includes(termo));
  }, [busca, tipos]);
  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) return <div>Você não possui acesso ao módulo de Parâmetros.</div>;

  return (
    <div className="produtos-page">
      {mostrarFormulario && (
        <div className="card-base card-blue form-card mb-3">
          <form onSubmit={salvar}>
            <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nome *</label>
              <input
                className="form-input"
                value={form.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                disabled={modoSomenteLeitura}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Modelo de comissão</label>
              <select
                className="form-input"
                value={form.regra_comissionamento}
                onChange={(e) => {
                  const val = e.target.value;
                  handleChange("regra_comissionamento", val);
                  if (val === "diferenciado") {
                    setRegraSelecionada("");
                  }
                }}
                disabled={modoSomenteLeitura}
              >
                <option value="geral">Geral (usa regra cadastrada)</option>
                <option value="diferenciado">Diferenciado (percentual fixo)</option>
              </select>
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label">Soma na meta?</label>
              <select
                className="form-input"
                value={form.soma_na_meta ? "1" : "0"}
                onChange={(e) => handleChange("soma_na_meta", e.target.value === "1")}
                disabled={modoSomenteLeitura}
              >
                <option value="1">Sim</option>
                <option value="0">Não</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Ativo?</label>
              <select
                className="form-input"
                value={form.ativo ? "1" : "0"}
                onChange={(e) => handleChange("ativo", e.target.value === "1")}
                disabled={modoSomenteLeitura}
              >
                <option value="1">Sim</option>
                <option value="0">Não</option>
              </select>
            </div>
          </div>

          {form.regra_comissionamento === "geral" && (
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Regra de Comissão *</label>
              <select
                className="form-input"
                value={regraSelecionada}
                onChange={(e) => setRegraSelecionada(e.target.value)}
                disabled={modoSomenteLeitura}
                required
              >
                <option value="">Selecione</option>
                {regras.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome} ({r.tipo})
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.regra_comissionamento === "diferenciado" && (
            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">Comissão fixa (meta não atingida) %</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={fixMetaNao}
                  onChange={(e) => setFixMetaNao(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Comissão fixa (meta atingida) %</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={fixMetaAtingida}
                  onChange={(e) => setFixMetaAtingida(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Comissão fixa (super meta) %</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={fixSuperMeta}
                  onChange={(e) => setFixSuperMeta(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
              </div>
            </div>
          )}

          <div className="card-base" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label">Tipos de Pacote</label>
              <select
                className="form-input"
                multiple
                size={Math.min(6, Math.max(3, tiposPacote.length || 3))}
                value={tiposPacoteSelecionados}
                onChange={handleTipoPacoteSelection}
                disabled={modoSomenteLeitura || tiposPacote.length === 0}
                aria-label="Selecione os tipos de pacote vinculados"
              >
                {tiposPacote.map((tipo) => {
                  const regra = tipo.rule_id ? regrasMap.get(tipo.rule_id) : null;
                  const descricaoRegra = regra
                    ? `${regra.nome} (${regra.tipo})`
                    : tipo.fix_meta_nao_atingida != null ||
                      tipo.fix_meta_atingida != null ||
                      tipo.fix_super_meta != null
                      ? "Comissão fixa"
                      : "Sem regra definida";
                  return (
                    <option key={tipo.id} value={tipo.id}>
                      {tipo.nome} — {descricaoRegra}
                    </option>
                  );
                })}
              </select>
              <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                Selecione um ou mais tipos de pacote. O sistema usa as regras cadastradas em Parâmetros &gt; Tipo de Pacote.
              </div>
            </div>

            {tiposPacote.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                Cadastre tipos de pacote antes de vincular regras específicas a este produto.
              </div>
            )}

            {tiposPacoteSelecionadosInfo.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Regras aplicadas</div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {tiposPacoteSelecionadosInfo.map((tipo) => {
                    const regra = tipo.rule_id ? regrasMap.get(tipo.rule_id) : null;
                    const fixPartes = [];
                    if (tipo.fix_meta_nao_atingida != null) {
                      fixPartes.push(`Meta não: ${tipo.fix_meta_nao_atingida}%`);
                    }
                    if (tipo.fix_meta_atingida != null) {
                      fixPartes.push(`Meta: ${tipo.fix_meta_atingida}%`);
                    }
                    if (tipo.fix_super_meta != null) {
                      fixPartes.push(`Super meta: ${tipo.fix_super_meta}%`);
                    }
                    return (
                      <li key={tipo.id} style={{ fontSize: 13, color: "#0f172a" }}>
                        <strong>{tipo.nome}</strong> — {regra ? `${regra.nome} (${regra.tipo})` : "Comissão fixa"}
                        {fixPartes.length > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: "#475569" }}>
                            ({fixPartes.join(" • ")})
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {!modoSomenteLeitura && (
            <div className="mobile-stack-buttons" style={{ marginTop: 8 }}>
              <button className="btn btn-primary w-full sm:w-auto" type="submit">
                {editandoId ? "Salvar alterações" : "Salvar tipo"}
              </button>
              <button type="button" className="btn btn-light w-full sm:w-auto" onClick={fecharFormularioTipo}>
                Cancelar
              </button>
            </div>
          )}
          </form>
        </div>
      )}

      {!mostrarFormulario && (
        <>
          {/* BUSCA */}
          <div className="card-base card-blue mb-3">
            <div
              className="form-row mobile-stack"
              style={{
                marginTop: 8,
                gap: 8,
                gridTemplateColumns: "minmax(220px, 1fr) auto",
                alignItems: "end",
              }}
            >
              <div className="form-group" style={{ minWidth: 220 }}>
                <label className="form-label">Buscar tipo de produto</label>
                <input
                  className="form-input"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite parte do nome..."
                  style={{ width: "100%" }}
                />
              </div>
              {!modoSomenteLeitura && (
                <div className="form-group" style={{ alignItems: "flex-end" }}>
                  <span style={{ visibility: "hidden" }}>botão</span>
                  <button
                    className="btn btn-primary w-full sm:w-auto"
                    type="button"
                    onClick={abrirFormularioTipo}
                    disabled={mostrarFormulario}
                  >
                    Novo produto
                  </button>
                </div>
              )}
            </div>
          </div>

          {erro && (
            <div className="mb-3">
              <AlertMessage variant="error">{erro}</AlertMessage>
            </div>
          )}

          {/* TABELA */}
          <DataTable
            className="table-default table-header-blue table-mobile-cards min-w-[720px]"
            containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
            headers={
              <tr>
                <th>Nome</th>
                <th>Regra</th>
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
            emptyMessage="Nenhum tipo encontrado."
            colSpan={7}
          >
            {tiposFiltrados.map((p) => (
              <tr key={p.id}>
                <td data-label="Nome">{p.nome || p.tipo}</td>
                <td data-label="Regra">{p.regra_comissionamento}</td>
                <td data-label="Regra vinculada">
                  {produtoRegraMap[p.id]?.rule_id
                    ? regras.find((r) => r.id === produtoRegraMap[p.id]?.rule_id)?.nome || "-"
                    : produtoRegraMap[p.id]?.fix_meta_atingida
                      ? "Comissão fixa"
                      : "-"}
                </td>
                <td data-label="Soma meta">{p.soma_na_meta ? "Sim" : "Não"}</td>
                <td data-label="Ativo" style={{ color: p.ativo ? "#22c55e" : "#ef4444" }}>
                  {p.ativo ? "Ativo" : "Inativo"}
                </td>
                <td data-label="Criado em">
                  {p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "-"}
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
                              onClick: () => iniciarEdicao(p),
                              icon: "✏️",
                            },
                          ]
                        : []),
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
      {modalDuplicado && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Aviso: ${modalDuplicado.entity}`}
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header" style={{ alignItems: "center", gap: 10 }}>
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0 }}>{modalDuplicado.entity} já cadastrado.</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setModalDuplicado(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
