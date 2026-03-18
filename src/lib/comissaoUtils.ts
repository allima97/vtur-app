export type Tier = {
  faixa: "PRE" | "POS";
  de_pct: number;
  ate_pct: number;
  inc_pct_meta: number;
  inc_pct_comissao: number;
};

export type Regra = {
  id: string;
  tipo: "GERAL" | "ESCALONAVEL";
  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;
  commission_tier?: Tier[];
};

export type RegraProduto = {
  produto_id: string;
  rule_id: string | null;
  fix_meta_nao_atingida: number | null;
  fix_meta_atingida: number | null;
  fix_super_meta: number | null;
};

export type ParametrosComissao = {
  usar_taxas_na_meta: boolean;
  foco_valor?: "bruto" | "liquido";
  foco_faturamento?: "bruto" | "liquido";
  conciliacao_sobrepoe_vendas?: boolean;
  conciliacao_regra_ativa?: boolean;
  conciliacao_meta_nao_atingida?: number | null;
  conciliacao_meta_atingida?: number | null;
  conciliacao_super_meta?: number | null;
};

export function hasConciliacaoCommissionRule(params?: ParametrosComissao | null) {
  if (!params?.conciliacao_regra_ativa) return false;
  return (
    params.conciliacao_meta_nao_atingida != null ||
    params.conciliacao_meta_atingida != null ||
    params.conciliacao_super_meta != null
  );
}

export function calcularPctConciliacao(
  params: ParametrosComissao | null | undefined,
  pctMeta: number
) {
  if (!hasConciliacaoCommissionRule(params)) return 0;

  const pctNao =
    params?.conciliacao_meta_nao_atingida ??
    params?.conciliacao_meta_atingida ??
    params?.conciliacao_super_meta ??
    0;
  const pctAt =
    params?.conciliacao_meta_atingida ??
    params?.conciliacao_meta_nao_atingida ??
    params?.conciliacao_super_meta ??
    0;
  const pctSup =
    params?.conciliacao_super_meta ??
    params?.conciliacao_meta_atingida ??
    params?.conciliacao_meta_nao_atingida ??
    0;

  if (pctMeta < 100) return pctNao;
  if (pctMeta >= 120) return pctSup;
  return pctAt;
}

export function calcularPctEscalonavel(regra: Regra, pctMeta: number) {
  const faixa = pctMeta >= 0 ? (pctMeta < 100 ? "PRE" : "POS") : "PRE";
  const base =
    faixa === "PRE"
      ? regra.meta_nao_atingida ?? regra.meta_atingida ?? 0
      : regra.meta_atingida ?? regra.meta_nao_atingida ?? 0;

  const tier = (regra.commission_tier || [])
    .filter((t) => t.faixa === faixa)
    .find((t) => {
      const valor = Number(pctMeta || 0);
      return valor >= t.de_pct && valor <= t.ate_pct;
    });

  if (!tier) {
    if (pctMeta >= 120) {
      return regra.super_meta ?? base;
    }
    return base;
  }

  const incMeta = Number(tier.inc_pct_meta || 0);
  const incCom = Number(tier.inc_pct_comissao || 0);

  if (incMeta <= 0) {
    return incCom || base;
  }

  const steps = Math.max(0, Math.floor((pctMeta - Number(tier.de_pct)) / incMeta));
  return base + steps * (incCom / 100);
}

export function calcularPctPorRegra(regra: Regra, pctMeta: number): number {
  if (regra.tipo === "ESCALONAVEL") {
    return calcularPctEscalonavel(regra, pctMeta);
  }

  if (pctMeta < 100) return regra.meta_nao_atingida ?? 0;
  if (pctMeta >= 120) {
    return regra.super_meta ?? regra.meta_atingida ?? regra.meta_nao_atingida ?? 0;
  }
  return regra.meta_atingida ?? regra.meta_nao_atingida ?? 0;
}

export function regraProdutoTemFixo(regra?: RegraProduto | null) {
  if (!regra) return false;
  return (
    regra.fix_meta_nao_atingida != null ||
    regra.fix_meta_atingida != null ||
    regra.fix_super_meta != null
  );
}

export function calcularPctFixoProduto(regra: RegraProduto, pctMeta: number) {
  const fixNao =
    regra.fix_meta_nao_atingida ??
    regra.fix_meta_atingida ??
    regra.fix_super_meta ??
    0;
  const fixAt =
    regra.fix_meta_atingida ??
    regra.fix_meta_nao_atingida ??
    regra.fix_super_meta ??
    0;
  const fixSup =
    regra.fix_super_meta ??
    regra.fix_meta_atingida ??
    regra.fix_meta_nao_atingida ??
    0;

  if (pctMeta < 100) return fixNao;
  if (pctMeta >= 120) return fixSup;
  return fixAt;
}

export function calcularDescontoAplicado(
  totalRecibos: number,
  valorTotalBruto?: number | null,
  valorTotalPago?: number | null
) {
  const bruto = Number(valorTotalBruto || 0);
  const pago = Number(valorTotalPago || 0);
  if (!Number.isFinite(bruto) || !Number.isFinite(pago) || bruto <= 0 || pago <= 0) {
    return 0;
  }
  const delta = bruto - pago;
  if (delta <= 0) return 0;
  const approx = (a: number, b: number) => Math.abs(a - b) <= 0.5;
  if (approx(totalRecibos, bruto)) return delta;
  if (approx(totalRecibos, pago)) return 0;
  if (totalRecibos > pago + 0.5) return delta;
  return 0;
}
