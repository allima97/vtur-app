import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { registrarLog } from "../../lib/logs";
import { formatDateTimeBR } from "../../lib/format";
import {
  createDefaultConciliacaoBandRules,
  type ConciliacaoCommissionBandRule,
} from "../../lib/comissaoUtils";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

type ParametrosSistema = {
  id?: string;
  company_id: string | null;
  owner_user_id?: string | null;
  owner_user_nome?: string | null;
  usar_taxas_na_meta: boolean;
  foco_valor: "bruto" | "liquido";
  modo_corporativo: boolean;
  politica_cancelamento: "cancelar_venda" | "estornar_recibos";
  foco_faturamento: "bruto" | "liquido";
  conciliacao_sobrepoe_vendas: boolean;
  conciliacao_regra_ativa: boolean;
  conciliacao_tipo: "GERAL" | "ESCALONAVEL";
  conciliacao_meta_nao_atingida: number | null;
  conciliacao_meta_atingida: number | null;
  conciliacao_super_meta: number | null;
  conciliacao_tiers: Array<{
    faixa: "PRE" | "POS";
    de_pct: number;
    ate_pct: number;
    inc_pct_meta: number;
    inc_pct_comissao: number;
  }>;
  conciliacao_faixas_loja: ConciliacaoCommissionBandRule[];
  mfa_obrigatorio: boolean;
  exportacao_pdf: boolean;
  exportacao_excel: boolean;
};

const DEFAULT_PARAMS: ParametrosSistema = {
  company_id: null,
  owner_user_id: null,
  usar_taxas_na_meta: false,
  foco_valor: "bruto",
  modo_corporativo: false,
  politica_cancelamento: "cancelar_venda",
  foco_faturamento: "bruto",
  conciliacao_sobrepoe_vendas: false,
  conciliacao_regra_ativa: false,
  conciliacao_tipo: "GERAL",
  conciliacao_meta_nao_atingida: null,
  conciliacao_meta_atingida: null,
  conciliacao_super_meta: null,
  conciliacao_tiers: [],
  conciliacao_faixas_loja: createDefaultConciliacaoBandRules({
    usar_taxas_na_meta: false,
    conciliacao_regra_ativa: false,
    conciliacao_tipo: "GERAL",
    conciliacao_meta_nao_atingida: null,
    conciliacao_meta_atingida: null,
    conciliacao_super_meta: null,
    conciliacao_tiers: [],
  }),
  mfa_obrigatorio: false,
  exportacao_pdf: false,
  exportacao_excel: false,
};

function parseNumberOrNull(value: string) {
  return value === "" ? null : Number(value);
}

function createEmptyTier(faixa: "PRE" | "POS") {
  return {
    faixa,
    de_pct: 0,
    ate_pct: 0,
    inc_pct_meta: 0,
    inc_pct_comissao: 0,
  };
}

function createEmptyBandTier(faixa: "PRE" | "POS") {
  return createEmptyTier(faixa);
}

function createBandId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "_").toUpperCase();
  }
  return `FAIXA_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function createManualBandRule(order: number): ConciliacaoCommissionBandRule {
  return {
    faixa_loja: createBandId(),
    nome: `Nova faixa ${order}`,
    percentual_min: null,
    percentual_max: null,
    ordem: order * 10,
    ativo: true,
    tipo_calculo: "CONCILIACAO",
    tipo: "GERAL",
    meta_nao_atingida: null,
    meta_atingida: null,
    super_meta: null,
    tiers: [],
  };
}

export default function ParametrosSistemaIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Parametros");
  const podeAdministrar = can("Parametros", "edit");

  const [params, setParams] = useState<ParametrosSistema>(DEFAULT_PARAMS);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);
  const [origemDados, setOrigemDados] = useState<"default" | "banco">("default");
  const [ownerNome, setOwnerNome] = useState<string | null>(null);
  const [editableConciliacaoTiers, setEditableConciliacaoTiers] = useState<Record<string, boolean>>({});
  const [editableBandTiers, setEditableBandTiers] = useState<Record<string, boolean>>({});
  const bloqueado = !podeVer || !podeAdministrar;
  const resumoConfiguracao = [
    {
      label: "Última atualização",
      value: ultimaAtualizacao ? formatDateTimeBR(ultimaAtualizacao) : "Ainda não salvo",
    },
    {
      label: "Origem dos dados",
      value: origemDados === "banco" ? "Banco de dados" : "Valores padrão",
    },
    {
      label: "Última edição por",
      value: ownerNome || "Sem registro",
    },
  ];

  useEffect(() => {
    carregar();
  }, []);

  const focoLabel = useMemo(
    () => (params.foco_valor === "bruto" ? "Valor bruto" : "Valor líquido"),
    [params.foco_valor],
  );

  function getConciliacaoTierKey(index: number) {
    return `conciliacao-tier-${index}`;
  }

  function getBandTierKey(faixaLoja: string, index: number) {
    return `band-tier-${faixaLoja}-${index}`;
  }

  async function carregar() {
    try {
      setLoading(true);
      setErro(null);
      setSucesso(null);

      const resp = await fetch("/api/v1/parametros/sistema");
      if (!resp.ok) throw new Error(await resp.text());
      const payload = (await resp.json()) as {
        params: ParametrosSistema;
        ultima_atualizacao: string | null;
        origem: "default" | "banco";
        owner_nome: string | null;
      };

      setParams(payload.params);
      setUltimaAtualizacao(payload.ultima_atualizacao || null);
      setOrigemDados(payload.origem || "default");
      setOwnerNome(payload.owner_nome || null);
      setEditableConciliacaoTiers({});
      setEditableBandTiers({});
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar parâmetros.");
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    if (bloqueado) return;
    try {
      setSalvando(true);
      setErro(null);
      setSucesso(null);

      const payload = {
        company_id: params.company_id,
        owner_user_id: params.owner_user_id,
        usar_taxas_na_meta: params.usar_taxas_na_meta,
        foco_valor: params.foco_valor,
        modo_corporativo: params.modo_corporativo,
        politica_cancelamento: params.politica_cancelamento,
        foco_faturamento: params.foco_faturamento,
        conciliacao_sobrepoe_vendas: params.conciliacao_sobrepoe_vendas,
        conciliacao_regra_ativa: params.conciliacao_regra_ativa,
        conciliacao_tipo: params.conciliacao_tipo,
        conciliacao_meta_nao_atingida: params.conciliacao_meta_nao_atingida,
        conciliacao_meta_atingida: params.conciliacao_meta_atingida,
        conciliacao_super_meta: params.conciliacao_super_meta,
        conciliacao_tiers: params.conciliacao_tiers,
        conciliacao_faixas_loja: params.conciliacao_faixas_loja,
        mfa_obrigatorio: params.mfa_obrigatorio,
        exportacao_pdf: params.exportacao_pdf,
        exportacao_excel: params.exportacao_excel,
      };

      const resp = await fetch("/api/v1/parametros/sistema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { id?: string | null };
      if (data?.id) {
        setParams((prev) => ({ ...prev, id: data.id || undefined }));
      }

      await registrarLog({
        user_id: (await supabase.auth.getUser()).data.user?.id || null,
        acao: "parametros_sistema_salvos",
        modulo: "Parametros",
        detalhes: payload,
      });

      setSucesso("Parâmetros salvos com sucesso.");
      setUltimaAtualizacao(new Date().toISOString());
      setOrigemDados("banco");
      setOwnerNome(params.owner_user_nome || null);
      setEditableConciliacaoTiers({});
      setEditableBandTiers({});
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar parâmetros.");
    } finally {
      setSalvando(false);
    }
  }

  function addConciliacaoTier(faixa: "PRE" | "POS") {
    setParams((prev) => ({
      ...prev,
      conciliacao_tiers: [...prev.conciliacao_tiers, createEmptyTier(faixa)],
    }));
    setEditableConciliacaoTiers((prev) => ({
      ...prev,
      [getConciliacaoTierKey(params.conciliacao_tiers.length)]: true,
    }));
  }

  function updateConciliacaoTier(
    index: number,
    field: "faixa" | "de_pct" | "ate_pct" | "inc_pct_meta" | "inc_pct_comissao",
    value: string | number
  ) {
    setParams((prev) => ({
      ...prev,
      conciliacao_tiers: prev.conciliacao_tiers.map((tier, currentIndex) => {
        if (currentIndex !== index) return tier;
        return {
          ...tier,
          [field]:
            field === "faixa"
              ? value
              : Number.isFinite(Number(value))
              ? Number(value)
              : 0,
        };
      }),
    }));
  }

  function removeConciliacaoTier(index: number) {
    setParams((prev) => ({
      ...prev,
      conciliacao_tiers: prev.conciliacao_tiers.filter((_, currentIndex) => currentIndex !== index),
    }));
    setEditableConciliacaoTiers((prev) => {
      const next = { ...prev };
      delete next[getConciliacaoTierKey(index)];
      return next;
    });
  }

  function updateConciliacaoBand(
    faixaLoja: string,
    changes: Partial<ConciliacaoCommissionBandRule>
  ) {
    setParams((prev) => ({
      ...prev,
      conciliacao_faixas_loja: prev.conciliacao_faixas_loja.map((band) =>
        band.faixa_loja === faixaLoja ? { ...band, ...changes } : band
      ),
    }));
  }

  function addConciliacaoBand() {
    setParams((prev) => ({
      ...prev,
      conciliacao_faixas_loja: [
        ...prev.conciliacao_faixas_loja,
        createManualBandRule(prev.conciliacao_faixas_loja.length + 1),
      ],
    }));
  }

  function addConciliacaoBandTier(
    faixaLoja: string,
    faixa: "PRE" | "POS"
  ) {
    const targetBand = params.conciliacao_faixas_loja.find((band) => band.faixa_loja === faixaLoja);
    setParams((prev) => ({
      ...prev,
      conciliacao_faixas_loja: prev.conciliacao_faixas_loja.map((band) =>
        band.faixa_loja === faixaLoja
          ? {
              ...band,
              tiers: [...band.tiers, createEmptyBandTier(faixa)],
            }
          : band
      ),
    }));
    setEditableBandTiers((prev) => ({
      ...prev,
      [getBandTierKey(faixaLoja, targetBand?.tiers.length ?? 0)]: true,
    }));
  }

  function updateConciliacaoBandTier(
    faixaLoja: string,
    index: number,
    field: "faixa" | "de_pct" | "ate_pct" | "inc_pct_meta" | "inc_pct_comissao",
    value: string | number
  ) {
    setParams((prev) => ({
      ...prev,
      conciliacao_faixas_loja: prev.conciliacao_faixas_loja.map((band) => {
        if (band.faixa_loja !== faixaLoja) return band;
        return {
          ...band,
          tiers: band.tiers.map((tier, currentIndex) => {
            if (currentIndex !== index) return tier;
            return {
              ...tier,
              [field]:
                field === "faixa"
                  ? value
                  : Number.isFinite(Number(value))
                  ? Number(value)
                  : 0,
            };
          }),
        };
      }),
    }));
  }

  function removeConciliacaoBandTier(
    faixaLoja: string,
    index: number
  ) {
    setParams((prev) => ({
      ...prev,
      conciliacao_faixas_loja: prev.conciliacao_faixas_loja.map((band) =>
        band.faixa_loja === faixaLoja
          ? {
              ...band,
              tiers: band.tiers.filter((_, currentIndex) => currentIndex !== index),
            }
          : band
      ),
    }));
    setEditableBandTiers((prev) => {
      const next = { ...prev };
      delete next[getBandTierKey(faixaLoja, index)];
      return next;
    });
  }

  function removeConciliacaoBand(faixaLoja: string) {
    setParams((prev) => ({
      ...prev,
      conciliacao_faixas_loja: prev.conciliacao_faixas_loja.filter(
        (band) => band.faixa_loja !== faixaLoja
      ),
    }));
  }

  if (loading || loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return <AppCard tone="config">Acesso ao módulo de Parâmetros bloqueado.</AppCard>;
  }

  return (
    <section className="parametros-sistema-page">
      <AppCard
        tone="config"
        className="mb-3"
        title="Parâmetros do Sistema"
        subtitle="Organize metas, conciliação, segurança e operação da empresa em blocos claros e independentes."
        actions={
          <div className="mobile-stack-buttons" style={{ display: "flex", gap: 10 }}>
            <AppButton
              variant="primary"
              onClick={salvar}
              disabled={bloqueado || salvando}
            >
              {salvando ? "Salvando..." : "Salvar parâmetros"}
            </AppButton>
            <AppButton variant="secondary" onClick={carregar} disabled={salvando}>
              Recarregar
            </AppButton>
          </div>
        }
      />

      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
      {sucesso && <AlertMessage variant="success">{sucesso}</AlertMessage>}

      <AppCard
        tone="config"
        className="parametros-sistema-status-card"
        title="Resumo da configuração"
        subtitle="Use este bloco para entender rapidamente de onde vieram os dados e quando eles foram alterados."
      >
        <div className="parametros-sistema-status-grid">
          {resumoConfiguracao.map((item) => (
            <div key={item.label} className="parametros-sistema-status-item">
              <span className="parametros-sistema-status-label">{item.label}</span>
              <strong className="parametros-sistema-status-value">{item.value}</strong>
            </div>
          ))}
        </div>
        {bloqueado && (
          <p className="vtur-warning-note" style={{ marginTop: 12 }}>
            Você não tem permissão para editar. Solicite acesso ao administrador.
          </p>
        )}
      </AppCard>

      <div className="parametros-sistema-grid">
        <AppCard
          tone="config"
          title="Metas e faturamento"
          subtitle="Defina qual base o sistema usa nos dashboards, metas gerais e relatórios financeiros."
        >
          <div className="parametros-sistema-stack">
            <label className="parametros-sistema-option">
              <span className="parametros-sistema-option-title">
                <input
                  type="checkbox"
                  checked={params.usar_taxas_na_meta}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, usar_taxas_na_meta: e.target.checked }))
                  }
                  disabled={bloqueado}
                />
                Meta considera taxas
              </span>
              <span className="parametros-sistema-option-copy">
                Inclui as taxas no cálculo da meta geral da equipe.
              </span>
            </label>

            <div className="form-row">
              <div className="form-group">
                <AppField
                  as="select"
                  label="Foco das metas"
                  value={params.foco_valor}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      foco_valor: e.target.value === "liquido" ? "liquido" : "bruto",
                    }))
                  }
                  disabled={bloqueado}
                  options={[
                    { value: "bruto", label: "Valor bruto" },
                    { value: "liquido", label: "Valor líquido" },
                  ]}
                />
                <small className="parametros-sistema-field-hint">
                  {focoLabel} será usado em metas e dashboards.
                </small>
              </div>

              <div className="form-group">
                <AppField
                  as="select"
                  label="Foco de faturamento"
                  value={params.foco_faturamento}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      foco_faturamento: e.target.value === "liquido" ? "liquido" : "bruto",
                    }))
                  }
                  disabled={bloqueado}
                  options={[
                    { value: "bruto", label: "Valor bruto" },
                    { value: "liquido", label: "Valor líquido" },
                  ]}
                />
                <small className="parametros-sistema-field-hint">
                  Define a base principal para faturamento e relatórios financeiros.
                </small>
              </div>
            </div>
          </div>
        </AppCard>

        <AppCard
          tone="config"
          title="Operação da empresa"
          subtitle="Centralize aqui as regras estruturais de uso diário do sistema."
        >
          <div className="parametros-sistema-stack">
            <label className="parametros-sistema-option">
              <span className="parametros-sistema-option-title">
                <input
                  type="checkbox"
                  checked={params.modo_corporativo}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, modo_corporativo: e.target.checked }))
                  }
                  disabled={bloqueado}
                />
                Modo corporativo
              </span>
              <span className="parametros-sistema-option-copy">
                Ativa recursos multiempresa e controles extras para estruturas corporativas.
              </span>
            </label>

            <div className="form-group">
              <AppField
                as="select"
                label="Política de cancelamento"
                value={params.politica_cancelamento}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    politica_cancelamento:
                      e.target.value === "estornar_recibos"
                        ? "estornar_recibos"
                        : "cancelar_venda",
                  }))
                }
                disabled={bloqueado}
                options={[
                  { value: "cancelar_venda", label: "Cancelar venda (exclui venda)" },
                  { value: "estornar_recibos", label: "Estornar recibos (manter venda)" },
                ]}
              />
              <small className="parametros-sistema-field-hint">
                Define o comportamento padrão do sistema ao cancelar uma venda.
              </small>
            </div>
          </div>
        </AppCard>

        <AppCard
          tone="config"
          title="Segurança e exportações"
          subtitle="Controle exigências de acesso e liberação dos formatos de saída."
        >
          <div className="parametros-sistema-stack">
            <label className="parametros-sistema-option">
              <span className="parametros-sistema-option-title">
                <input
                  type="checkbox"
                  checked={params.mfa_obrigatorio}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, mfa_obrigatorio: e.target.checked }))
                  }
                  disabled={bloqueado}
                />
                Exigir verificação em duas etapas (2FA)
              </span>
              <span className="parametros-sistema-option-copy">
                Usuários sem autenticador configurado serão direcionados ao perfil antes de acessar os módulos.
              </span>
            </label>

            <div className="parametros-sistema-option-list">
              <label className="parametros-sistema-option">
                <span className="parametros-sistema-option-title">
                  <input
                    type="checkbox"
                    checked={params.exportacao_pdf}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, exportacao_pdf: e.target.checked }))
                    }
                    disabled={bloqueado}
                  />
                  Exportação em PDF
                </span>
                <span className="parametros-sistema-option-copy">
                  Libera os módulos que geram documentos e relatórios em PDF.
                </span>
              </label>

              <label className="parametros-sistema-option">
                <span className="parametros-sistema-option-title">
                  <input
                    type="checkbox"
                    checked={params.exportacao_excel}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, exportacao_excel: e.target.checked }))
                    }
                    disabled={bloqueado}
                  />
                  Exportação em Excel
                </span>
                <span className="parametros-sistema-option-copy">
                  Mantém a exportação tabular habilitada para relatórios e operações administrativas.
                </span>
              </label>
            </div>
          </div>
        </AppCard>

        <AppCard
          className="parametros-sistema-card-wide"
          tone="config"
          title="Conciliação e comissionamento"
          subtitle="Configure quando a conciliação prevalece sobre as vendas e como a regra própria de comissão deve ser aplicada."
        >
          <div className="parametros-sistema-stack">
            <div className="parametros-sistema-option-list parametros-sistema-option-list-2">
              <label className="parametros-sistema-option">
                <span className="parametros-sistema-option-title">
                  <input
                    type="checkbox"
                    checked={params.conciliacao_sobrepoe_vendas}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, conciliacao_sobrepoe_vendas: e.target.checked }))
                    }
                    disabled={bloqueado}
                  />
                  Conciliação como fonte principal
                </span>
                <span className="parametros-sistema-option-copy">
                  Quando ativa, a movimentação conciliada prevalece sobre a venda lançada manualmente.
                </span>
              </label>

              <label className="parametros-sistema-option">
                <span className="parametros-sistema-option-title">
                  <input
                    type="checkbox"
                    checked={params.conciliacao_regra_ativa}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, conciliacao_regra_ativa: e.target.checked }))
                    }
                    disabled={bloqueado}
                  />
                  Regra própria de comissão
                </span>
                <span className="parametros-sistema-option-copy">
                  Faz os recibos conciliados usarem a regra da conciliação antes do template geral e das regras por produto.
                </span>
              </label>
            </div>

            <div className="form-row">
              <div className="form-group">
                <AppField
                  as="select"
                  label="Tipo da regra da conciliação"
                  value={params.conciliacao_tipo}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      conciliacao_tipo: e.target.value === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL",
                    }))
                  }
                  disabled={bloqueado || !params.conciliacao_regra_ativa}
                  options={[
                    { value: "GERAL", label: "Geral (percentuais fixos)" },
                    { value: "ESCALONAVEL", label: "Escalonável (faixas)" },
                  ]}
                />
              </div>

              <div className="form-group">
                <AppField
                  type="number"
                  label="% Conciliação meta não batida"
                  value={params.conciliacao_meta_nao_atingida ?? ""}
                  min={0}
                  step="0.01"
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      conciliacao_meta_nao_atingida: parseNumberOrNull(e.target.value),
                    }))
                  }
                  disabled={bloqueado || !params.conciliacao_regra_ativa}
                />
              </div>

              <div className="form-group">
                <AppField
                  type="number"
                  label="% Conciliação meta batida"
                  value={params.conciliacao_meta_atingida ?? ""}
                  min={0}
                  step="0.01"
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      conciliacao_meta_atingida: parseNumberOrNull(e.target.value),
                    }))
                  }
                  disabled={bloqueado || !params.conciliacao_regra_ativa}
                />
              </div>

              <div className="form-group">
                <AppField
                  type="number"
                  label="% Conciliação super meta"
                  value={params.conciliacao_super_meta ?? ""}
                  min={0}
                  step="0.01"
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      conciliacao_super_meta: parseNumberOrNull(e.target.value),
                    }))
                  }
                  disabled={bloqueado || !params.conciliacao_regra_ativa}
                />
              </div>
            </div>

            <p className="parametros-sistema-field-hint">
              Quando habilitada, essa regra entra antes do template geral e das regras por produto para recibos conciliados.
            </p>

            {params.conciliacao_regra_ativa && params.conciliacao_tipo === "ESCALONAVEL" && (
              <AppCard
                className="vtur-sales-embedded-card"
                tone="config"
                title="Faixas escalonáveis da conciliação"
                subtitle="Reaproveita a mesma lógica das regras de comissão, usando base fixa mais incrementos por faixa."
                actions={
                  <div className="mobile-stack-buttons" style={{ display: "flex", gap: 8 }}>
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={() => addConciliacaoTier("PRE")}
                      disabled={bloqueado}
                    >
                      + Faixa PRE
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={() => addConciliacaoTier("POS")}
                      disabled={bloqueado}
                    >
                      + Faixa POS
                    </AppButton>
                  </div>
                }
              >
                <div className="table-container">
                  <table className="table-default table-header-blue table-mobile-cards min-w-[920px]">
                    <thead>
                      <tr>
                        <th>Faixa</th>
                        <th>De (%)</th>
                        <th>Até (%)</th>
                        <th>Inc. Meta (%)</th>
                        <th>Inc. Comissão (%)</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {params.conciliacao_tiers.length === 0 ? (
                        <tr>
                          <td colSpan={6}>Nenhuma faixa cadastrada.</td>
                        </tr>
                      ) : (
                        params.conciliacao_tiers.map((tier, index) => {
                          const tierKey = getConciliacaoTierKey(index);
                          const rowEditable = Boolean(editableConciliacaoTiers[tierKey]);
                          return (
                          <tr key={`${tier.faixa}-${index}`}>
                            <td data-label="Faixa">
                              <select
                                className="form-select"
                                value={tier.faixa}
                                disabled={bloqueado || !rowEditable}
                                onChange={(e) =>
                                  updateConciliacaoTier(index, "faixa", e.target.value === "POS" ? "POS" : "PRE")
                                }
                              >
                                <option value="PRE">PRE</option>
                                <option value="POS">POS</option>
                              </select>
                            </td>
                            <td data-label="De (%)">
                              <input
                                className="form-input"
                                type="number"
                                step="0.01"
                                value={tier.de_pct}
                                disabled={bloqueado || !rowEditable}
                                onChange={(e) => updateConciliacaoTier(index, "de_pct", e.target.value)}
                              />
                            </td>
                            <td data-label="Até (%)">
                              <input
                                className="form-input"
                                type="number"
                                step="0.01"
                                value={tier.ate_pct}
                                disabled={bloqueado || !rowEditable}
                                onChange={(e) => updateConciliacaoTier(index, "ate_pct", e.target.value)}
                              />
                            </td>
                            <td data-label="Inc. Meta (%)">
                              <input
                                className="form-input"
                                type="number"
                                step="0.01"
                                value={tier.inc_pct_meta}
                                disabled={bloqueado || !rowEditable}
                                onChange={(e) => updateConciliacaoTier(index, "inc_pct_meta", e.target.value)}
                              />
                            </td>
                            <td data-label="Inc. Comissão (%)">
                              <input
                                className="form-input"
                                type="number"
                                step="0.01"
                                value={tier.inc_pct_comissao}
                                disabled={bloqueado || !rowEditable}
                                onChange={(e) => updateConciliacaoTier(index, "inc_pct_comissao", e.target.value)}
                              />
                            </td>
                            <td data-label="Ações">
                              <div className="action-buttons vtur-table-actions">
                                <AppButton
                                  type="button"
                                  variant="ghost"
                                  className="icon-action-btn vtur-table-action"
                                  onClick={() =>
                                    setEditableConciliacaoTiers((prev) => ({
                                      ...prev,
                                      [tierKey]: true,
                                    }))
                                  }
                                  disabled={bloqueado}
                                  icon="pi pi-pencil"
                                  title="Editar faixa"
                                  aria-label="Editar faixa"
                                />
                                <AppButton
                                  type="button"
                                  variant="danger"
                                  className="icon-action-btn vtur-table-action"
                                  onClick={() => removeConciliacaoTier(index)}
                                  disabled={bloqueado}
                                  icon="pi pi-trash"
                                  title="Excluir faixa"
                                  aria-label="Excluir faixa"
                                />
                              </div>
                            </td>
                          </tr>
                        )})
                      )}
                    </tbody>
                  </table>
                </div>
              </AppCard>
            )}

            <AppCard
              className="vtur-sales-embedded-card"
              tone="config"
              title="Faixas de comissionamento da loja"
              subtitle="Defina como a comissão da conciliação deve ser calculada de acordo com a faixa da comissão da loja em cada recibo."
              actions={
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={addConciliacaoBand}
                  disabled={bloqueado}
                >
                  + Nova faixa
                </AppButton>
              }
            >
              <div className="parametros-sistema-band-grid">
                {params.conciliacao_faixas_loja.map((band) => {
                  const usaRegraConciliacao = band.tipo_calculo === "CONCILIACAO";
                  const faixaResumo = [
                    band.percentual_min != null ? `de ${band.percentual_min}%` : "sem mínimo",
                    band.percentual_max != null ? `até ${band.percentual_max}%` : "sem máximo",
                  ].join(" • ");
                  return (
                    <AppCard
                      key={band.faixa_loja}
                      className="vtur-sales-embedded-card"
                      tone="config"
                      title={band.nome || "Faixa sem nome"}
                      subtitle={`Aplica automaticamente quando a % da comissão da loja cair em ${faixaResumo}.`}
                      actions={
                        <AppButton
                          type="button"
                          variant="danger"
                          onClick={() => removeConciliacaoBand(band.faixa_loja)}
                          disabled={bloqueado || params.conciliacao_faixas_loja.length <= 1}
                        >
                          Excluir faixa
                        </AppButton>
                      }
                    >
                      <div className="parametros-sistema-stack">
                        <div className="form-row">
                          <div className="form-group">
                            <AppField
                              label="Nome da faixa"
                              value={band.nome}
                              onChange={(e) =>
                                updateConciliacaoBand(band.faixa_loja, { nome: e.target.value })
                              }
                              disabled={bloqueado}
                            />
                          </div>
                          <div className="form-group">
                            <AppField
                              type="number"
                              label="% mínimo"
                              value={band.percentual_min ?? ""}
                              step="0.01"
                              onChange={(e) =>
                                updateConciliacaoBand(band.faixa_loja, {
                                  percentual_min: parseNumberOrNull(e.target.value),
                                })
                              }
                              disabled={bloqueado}
                              caption="Deixe vazio para não limitar o início da faixa."
                            />
                          </div>
                          <div className="form-group">
                            <AppField
                              type="number"
                              label="% máximo"
                              value={band.percentual_max ?? ""}
                              step="0.01"
                              onChange={(e) =>
                                updateConciliacaoBand(band.faixa_loja, {
                                  percentual_max: parseNumberOrNull(e.target.value),
                                })
                              }
                              disabled={bloqueado}
                              caption="Deixe vazio para que a faixa não tenha teto."
                            />
                          </div>
                        </div>

                        <div className="parametros-sistema-option-list">
                          <label className="parametros-sistema-option">
                            <span className="parametros-sistema-option-title">
                              <input
                                type="checkbox"
                                checked={band.ativo}
                                disabled={bloqueado || !params.conciliacao_regra_ativa}
                                onChange={(e) =>
                                  updateConciliacaoBand(band.faixa_loja, { ativo: e.target.checked })
                                }
                              />
                              Faixa ativa
                            </span>
                            <span className="parametros-sistema-option-copy">
                              Quando ativa, esta faixa passa a ser considerada no cálculo da comissão dos recibos conciliados.
                            </span>
                          </label>
                        </div>

                        <div className="form-row parametros-sistema-band-fields-row">
                          <div className="form-group">
                            <AppField
                              as="select"
                              label="Base do pagamento"
                              value={band.tipo_calculo}
                              onChange={(e) =>
                                updateConciliacaoBand(band.faixa_loja, {
                                  tipo_calculo:
                                    e.target.value === "PRODUTO_DIFERENCIADO"
                                      ? "PRODUTO_DIFERENCIADO"
                                      : "CONCILIACAO",
                                })
                              }
                              disabled={bloqueado || !params.conciliacao_regra_ativa}
                              options={[
                                { value: "CONCILIACAO", label: "Regra da conciliação" },
                                { value: "PRODUTO_DIFERENCIADO", label: "Produto diferenciado" },
                              ]}
                            />
                          </div>
                          {usaRegraConciliacao ? (
                            <>
                              <div className="form-group">
                                <AppField
                                  as="select"
                                  label="Tipo da regra"
                                  value={band.tipo}
                                  onChange={(e) =>
                                    updateConciliacaoBand(band.faixa_loja, {
                                      tipo: e.target.value === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL",
                                    })
                                  }
                                  disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                  options={[
                                    { value: "GERAL", label: "Geral (percentuais fixos)" },
                                    { value: "ESCALONAVEL", label: "Escalonável (faixas)" },
                                  ]}
                                />
                              </div>
                              <div className="form-group">
                                <AppField
                                  type="number"
                                  label="% Meta não batida"
                                  value={band.meta_nao_atingida ?? ""}
                                  min={0}
                                  step="0.01"
                                  onChange={(e) =>
                                    updateConciliacaoBand(band.faixa_loja, {
                                      meta_nao_atingida: parseNumberOrNull(e.target.value),
                                    })
                                  }
                                  disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                />
                              </div>
                              <div className="form-group">
                                <AppField
                                  type="number"
                                  label="% Meta batida"
                                  value={band.meta_atingida ?? ""}
                                  min={0}
                                  step="0.01"
                                  onChange={(e) =>
                                    updateConciliacaoBand(band.faixa_loja, {
                                      meta_atingida: parseNumberOrNull(e.target.value),
                                    })
                                  }
                                  disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                />
                              </div>
                              <div className="form-group">
                                <AppField
                                  type="number"
                                  label="% Super meta"
                                  value={band.super_meta ?? ""}
                                  min={0}
                                  step="0.01"
                                  onChange={(e) =>
                                    updateConciliacaoBand(band.faixa_loja, {
                                      super_meta: parseNumberOrNull(e.target.value),
                                    })
                                  }
                                  disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                />
                              </div>
                            </>
                          ) : null}
                        </div>

                        <small className="parametros-sistema-field-hint">
                          Use produto diferenciado quando a faixa deve obedecer às regras já cadastradas no sistema para seguro ou outro produto especial.
                        </small>

                        {usaRegraConciliacao ? (
                          <>
                            {band.tipo === "ESCALONAVEL" ? (
                              <AppCard
                                className="vtur-sales-embedded-card"
                                tone="config"
                                title="Faixas escalonáveis"
                                subtitle="Use PRE e POS para montar o mesmo comportamento de escalonamento das regras de comissão."
                                actions={
                                  <div className="mobile-stack-buttons" style={{ display: "flex", gap: 8 }}>
                                    <AppButton
                                      type="button"
                                      variant="secondary"
                                      onClick={() => addConciliacaoBandTier(band.faixa_loja, "PRE")}
                                      disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                    >
                                      + Faixa PRE
                                    </AppButton>
                                    <AppButton
                                      type="button"
                                      variant="secondary"
                                      onClick={() => addConciliacaoBandTier(band.faixa_loja, "POS")}
                                      disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                    >
                                      + Faixa POS
                                    </AppButton>
                                  </div>
                                }
                              >
                                <div className="table-container">
                                  <table className="table-default table-header-blue table-mobile-cards min-w-[920px]">
                                    <thead>
                                      <tr>
                                        <th>Faixa</th>
                                        <th>De (%)</th>
                                        <th>Até (%)</th>
                                        <th>Inc. Meta (%)</th>
                                        <th>Inc. Comissão (%)</th>
                                        <th>Ações</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {band.tiers.length === 0 ? (
                                        <tr>
                                          <td colSpan={6}>Nenhuma faixa cadastrada.</td>
                                        </tr>
                                      ) : (
                                        band.tiers.map((tier, index) => {
                                          const tierKey = getBandTierKey(band.faixa_loja, index);
                                          const rowEditable = Boolean(editableBandTiers[tierKey]);
                                          return (
                                          <tr key={`${band.faixa_loja}-${tier.faixa}-${index}`}>
                                            <td data-label="Faixa">
                                              <select
                                                className="form-select"
                                                value={tier.faixa}
                                                disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo || !rowEditable}
                                                onChange={(e) =>
                                                  updateConciliacaoBandTier(
                                                    band.faixa_loja,
                                                    index,
                                                    "faixa",
                                                    e.target.value === "POS" ? "POS" : "PRE"
                                                  )
                                                }
                                              >
                                                <option value="PRE">PRE</option>
                                                <option value="POS">POS</option>
                                              </select>
                                            </td>
                                            <td data-label="De (%)">
                                              <input
                                                className="form-input"
                                                type="number"
                                                step="0.01"
                                                value={tier.de_pct}
                                                disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo || !rowEditable}
                                                onChange={(e) =>
                                                  updateConciliacaoBandTier(
                                                    band.faixa_loja,
                                                    index,
                                                    "de_pct",
                                                    e.target.value
                                                  )
                                                }
                                              />
                                            </td>
                                            <td data-label="Até (%)">
                                              <input
                                                className="form-input"
                                                type="number"
                                                step="0.01"
                                                value={tier.ate_pct}
                                                disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo || !rowEditable}
                                                onChange={(e) =>
                                                  updateConciliacaoBandTier(
                                                    band.faixa_loja,
                                                    index,
                                                    "ate_pct",
                                                    e.target.value
                                                  )
                                                }
                                              />
                                            </td>
                                            <td data-label="Inc. Meta (%)">
                                              <input
                                                className="form-input"
                                                type="number"
                                                step="0.01"
                                                value={tier.inc_pct_meta}
                                                disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo || !rowEditable}
                                                onChange={(e) =>
                                                  updateConciliacaoBandTier(
                                                    band.faixa_loja,
                                                    index,
                                                    "inc_pct_meta",
                                                    e.target.value
                                                  )
                                                }
                                              />
                                            </td>
                                            <td data-label="Inc. Comissão (%)">
                                              <input
                                                className="form-input"
                                                type="number"
                                                step="0.01"
                                                value={tier.inc_pct_comissao}
                                                disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo || !rowEditable}
                                                onChange={(e) =>
                                                  updateConciliacaoBandTier(
                                                    band.faixa_loja,
                                                    index,
                                                    "inc_pct_comissao",
                                                    e.target.value
                                                  )
                                                }
                                              />
                                            </td>
                                            <td data-label="Ações">
                                              <div className="action-buttons vtur-table-actions">
                                                <AppButton
                                                  type="button"
                                                  variant="ghost"
                                                  className="icon-action-btn vtur-table-action"
                                                  onClick={() =>
                                                    setEditableBandTiers((prev) => ({
                                                      ...prev,
                                                      [tierKey]: true,
                                                    }))
                                                  }
                                                  disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                                  icon="pi pi-pencil"
                                                  title="Editar faixa"
                                                  aria-label="Editar faixa"
                                                />
                                                <AppButton
                                                  type="button"
                                                  variant="danger"
                                                  className="icon-action-btn vtur-table-action"
                                                  onClick={() => removeConciliacaoBandTier(band.faixa_loja, index)}
                                                  disabled={bloqueado || !params.conciliacao_regra_ativa || !band.ativo}
                                                  icon="pi pi-trash"
                                                  title="Excluir faixa"
                                                  aria-label="Excluir faixa"
                                                />
                                              </div>
                                            </td>
                                          </tr>
                                        )})
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </AppCard>
                            ) : null}
                          </>
                        ) : (
                          <AlertMessage variant="info" className="vtur-alert-inline">
                            Esta faixa usará as regras de produto diferenciado já cadastradas no sistema.
                          </AlertMessage>
                        )}
                      </div>
                    </AppCard>
                  );
                })}
              </div>
            </AppCard>
          </div>
        </AppCard>
      </div>

      <AppCard
        tone="config"
        title="Ações"
        subtitle="Salve depois de revisar cada bloco para manter as regras da empresa consistentes."
      >
        <div className="mobile-stack-buttons" style={{ display: "flex", gap: 10 }}>
          <AppButton
            variant="primary"
            onClick={salvar}
            disabled={bloqueado || salvando}
          >
            {salvando ? "Salvando..." : "Salvar parâmetros"}
          </AppButton>
          <AppButton variant="secondary" onClick={carregar} disabled={salvando}>
            Recarregar
          </AppButton>
        </div>
      </AppCard>

    </section>
  );
}
