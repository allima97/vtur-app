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

export const LEGACY_CONCILIACAO_COMMISSION_BAND_KEYS = [
  "MENOR_10",
  "MAIOR_OU_IGUAL_10",
  "SEGURO_32_35",
] as const;

export type ConciliacaoCommissionBandKey =
  (typeof LEGACY_CONCILIACAO_COMMISSION_BAND_KEYS)[number];

export type ConciliacaoCommissionBandId = string;

export type ConciliacaoCommissionBandMode =
  | "CONCILIACAO"
  | "PRODUTO_DIFERENCIADO";

export type ConciliacaoCommissionBandRule = {
  faixa_loja: ConciliacaoCommissionBandId;
  nome: string;
  percentual_min: number | null;
  percentual_max: number | null;
  ordem: number;
  ativo: boolean;
  tipo_calculo: ConciliacaoCommissionBandMode;
  tipo: "GERAL" | "ESCALONAVEL";
  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;
  tiers: Tier[];
};

export type ParametrosComissao = {
  usar_taxas_na_meta: boolean;
  foco_valor?: "bruto" | "liquido";
  foco_faturamento?: "bruto" | "liquido";
  conciliacao_sobrepoe_vendas?: boolean;
  conciliacao_regra_ativa?: boolean;
  conciliacao_tipo?: "GERAL" | "ESCALONAVEL";
  conciliacao_meta_nao_atingida?: number | null;
  conciliacao_meta_atingida?: number | null;
  conciliacao_super_meta?: number | null;
  conciliacao_tiers?: Tier[] | null;
  conciliacao_faixas_loja?: ConciliacaoCommissionBandRule[] | null;
};

export type ConciliacaoCommissionSelection =
  | {
      kind: "CONCILIACAO";
      bandKey: ConciliacaoCommissionBandId;
      rule: Regra;
    }
  | {
      kind: "PRODUTO_DIFERENCIADO";
      bandKey: ConciliacaoCommissionBandId;
      rule: null;
    }
  | {
      kind: "NONE";
      bandKey: ConciliacaoCommissionBandId;
      rule: null;
    };

type DefaultBandDefinition = {
  faixa_loja: ConciliacaoCommissionBandKey;
  nome: string;
  percentual_min: number | null;
  percentual_max: number | null;
  ordem: number;
  tipo_calculo: ConciliacaoCommissionBandMode;
};

const DEFAULT_BAND_DEFINITIONS: DefaultBandDefinition[] = [
  {
    faixa_loja: "MENOR_10",
    nome: "Menor que 10%",
    percentual_min: null,
    percentual_max: 9.9999,
    ordem: 10,
    tipo_calculo: "CONCILIACAO",
  },
  {
    faixa_loja: "MAIOR_OU_IGUAL_10",
    nome: "Igual ou maior que 10%",
    percentual_min: 10,
    percentual_max: 31.9999,
    ordem: 20,
    tipo_calculo: "CONCILIACAO",
  },
  {
    faixa_loja: "SEGURO_32_35",
    nome: "Igual ou maior que 32%",
    percentual_min: 32,
    percentual_max: null,
    ordem: 30,
    tipo_calculo: "PRODUTO_DIFERENCIADO",
  },
];

function normalizeBandId(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizeBandName(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "Nova faixa";
}

function parseNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getDefaultBandDefinition(
  key?: string | null
): DefaultBandDefinition | null {
  const normalized = normalizeBandKey(key);
  if (!normalized) return null;
  return DEFAULT_BAND_DEFINITIONS.find((item) => item.faixa_loja === normalized) || null;
}

function sanitizeTier(tier: any): Tier | null {
  const faixa = String(tier?.faixa || "").trim().toUpperCase();
  if (faixa !== "PRE" && faixa !== "POS") return null;

  const dePct = Number(tier?.de_pct ?? 0);
  const atePct = Number(tier?.ate_pct ?? 0);
  const incMeta = Number(tier?.inc_pct_meta ?? 0);
  const incCom = Number(tier?.inc_pct_comissao ?? 0);
  if (![dePct, atePct, incMeta, incCom].every(Number.isFinite)) return null;

  return {
    faixa,
    de_pct: dePct,
    ate_pct: atePct,
    inc_pct_meta: incMeta,
    inc_pct_comissao: incCom,
  };
}

function hasRuleValues(definition: {
  meta_nao_atingida?: number | null;
  meta_atingida?: number | null;
  super_meta?: number | null;
  tiers?: Tier[] | null;
}) {
  return (
    definition.meta_nao_atingida != null ||
    definition.meta_atingida != null ||
    definition.super_meta != null ||
    (Array.isArray(definition.tiers) && definition.tiers.length > 0)
  );
}

function buildRuleFromDefinition(params: {
  id: string;
  tipo?: "GERAL" | "ESCALONAVEL";
  meta_nao_atingida?: number | null;
  meta_atingida?: number | null;
  super_meta?: number | null;
  tiers?: Tier[] | null;
}): Regra | null {
  const tipo = params.tipo === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL";
  const tiers = Array.isArray(params.tiers)
    ? params.tiers.map(sanitizeTier).filter((item): item is Tier => Boolean(item))
    : [];

  if (!hasRuleValues({ ...params, tiers })) return null;
  if (tipo === "ESCALONAVEL" && tiers.length === 0 && !hasRuleValues(params)) return null;

  return {
    id: params.id,
    tipo,
    meta_nao_atingida: params.meta_nao_atingida ?? 0,
    meta_atingida:
      params.meta_atingida ?? params.meta_nao_atingida ?? 0,
    super_meta:
      params.super_meta ??
      params.meta_atingida ??
      params.meta_nao_atingida ??
      0,
    commission_tier: tiers,
  };
}

export function buildLegacyConciliacaoRule(
  params?: ParametrosComissao | null
): Regra | null {
  if (!params?.conciliacao_regra_ativa) return null;
  return buildRuleFromDefinition({
    id: "conciliacao",
    tipo: params.conciliacao_tipo,
    meta_nao_atingida: params.conciliacao_meta_nao_atingida ?? null,
    meta_atingida: params.conciliacao_meta_atingida ?? null,
    super_meta: params.conciliacao_super_meta ?? null,
    tiers: Array.isArray(params.conciliacao_tiers) ? params.conciliacao_tiers : [],
  });
}

export function buildConciliacaoRule(params?: ParametrosComissao | null) {
  return buildLegacyConciliacaoRule(params);
}

export function createDefaultConciliacaoBandRules(
  params?: ParametrosComissao | null
): ConciliacaoCommissionBandRule[] {
  const legacyTipo =
    params?.conciliacao_tipo === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL";
  const legacyRule = buildLegacyConciliacaoRule(params);
  const legacyTiers = Array.isArray(params?.conciliacao_tiers)
    ? params.conciliacao_tiers.map(sanitizeTier).filter((item): item is Tier => Boolean(item))
    : [];

  return DEFAULT_BAND_DEFINITIONS.map((definition) => ({
    faixa_loja: definition.faixa_loja,
    nome: definition.nome,
    percentual_min: definition.percentual_min,
    percentual_max: definition.percentual_max,
    ordem: definition.ordem,
    ativo: definition.tipo_calculo === "PRODUTO_DIFERENCIADO" ? true : Boolean(legacyRule),
    tipo_calculo: definition.tipo_calculo,
    tipo: definition.tipo_calculo === "PRODUTO_DIFERENCIADO" ? "GERAL" : legacyTipo,
    meta_nao_atingida:
      definition.tipo_calculo === "PRODUTO_DIFERENCIADO"
        ? null
        : params?.conciliacao_meta_nao_atingida ?? null,
    meta_atingida:
      definition.tipo_calculo === "PRODUTO_DIFERENCIADO"
        ? null
        : params?.conciliacao_meta_atingida ?? null,
    super_meta:
      definition.tipo_calculo === "PRODUTO_DIFERENCIADO"
        ? null
        : params?.conciliacao_super_meta ?? null,
    tiers: definition.tipo_calculo === "PRODUTO_DIFERENCIADO" ? [] : legacyTiers,
  }));
}

function normalizeBandKey(value?: string | null): ConciliacaoCommissionBandKey | null {
  const normalized = normalizeBandId(value);
  if (!normalized) return null;
  if (normalized === "MENOR_10") return "MENOR_10";
  if (normalized === "MAIOR_OU_IGUAL_10") return "MAIOR_OU_IGUAL_10";
  if (
    normalized === "SEGURO_32_35" ||
    normalized === "MAIOR_OU_IGUAL_32" ||
    normalized === "MAIOR_OU_IGUAL_35"
  ) {
    return "SEGURO_32_35";
  }
  return null;
}

function isBandRangeMatch(
  rule: Pick<ConciliacaoCommissionBandRule, "percentual_min" | "percentual_max">,
  percentual?: number | null
) {
  const pct = Number(percentual ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return false;
  const min = rule.percentual_min;
  const max = rule.percentual_max;
  if (min != null && pct < min) return false;
  if (max != null && pct > max) return false;
  return true;
}

function sortBandRules(rules: ConciliacaoCommissionBandRule[]) {
  return [...rules].sort((left, right) => {
    if (left.ordem !== right.ordem) return left.ordem - right.ordem;
    const leftMin = left.percentual_min ?? Number.NEGATIVE_INFINITY;
    const rightMin = right.percentual_min ?? Number.NEGATIVE_INFINITY;
    if (leftMin !== rightMin) return leftMin - rightMin;
    return left.nome.localeCompare(right.nome, "pt-BR");
  });
}

export function sanitizeConciliacaoBandRules(
  value: unknown,
  params?: ParametrosComissao | null
): ConciliacaoCommissionBandRule[] {
  const defaults = createDefaultConciliacaoBandRules(params);
  if (!Array.isArray(value) || value.length === 0) {
    return sortBandRules(defaults);
  }

  const sanitized = value
    .map((item: any, index) => {
      const legacyDefinition = getDefaultBandDefinition(item?.faixa_loja);
      const normalizedId =
        normalizeBandId(item?.faixa_loja) ||
        normalizeBandId(item?.id) ||
        `FAIXA_${index + 1}`;
      const base =
        defaults.find((entry) => normalizeBandId(entry.faixa_loja) === normalizedId) ||
        (legacyDefinition
          ? defaults.find((entry) => entry.faixa_loja === legacyDefinition.faixa_loja)
          : null);
      const tipoCalculo =
        String(item?.tipo_calculo || "").trim().toUpperCase() === "PRODUTO_DIFERENCIADO"
          ? "PRODUTO_DIFERENCIADO"
          : "CONCILIACAO";
      const tipo = String(item?.tipo || "").trim().toUpperCase() === "ESCALONAVEL"
        ? "ESCALONAVEL"
        : "GERAL";
      const tiers = Array.isArray(item?.tiers)
        ? item.tiers.map(sanitizeTier).filter((tier): tier is Tier => Boolean(tier))
        : base?.tiers || [];

      return {
        faixa_loja: normalizedId,
        nome: normalizeBandName(item?.nome ?? legacyDefinition?.nome ?? base?.nome ?? item?.faixa_loja),
        percentual_min:
          parseNullableNumber(item?.percentual_min) ??
          legacyDefinition?.percentual_min ??
          base?.percentual_min ??
          null,
        percentual_max:
          parseNullableNumber(item?.percentual_max) ??
          legacyDefinition?.percentual_max ??
          base?.percentual_max ??
          null,
        ordem: Number.isFinite(Number(item?.ordem))
          ? Number(item.ordem)
          : base?.ordem ?? (index + 1) * 10,
        ativo: item?.ativo == null ? base?.ativo ?? true : Boolean(item.ativo),
        tipo_calculo: tipoCalculo,
        tipo,
        meta_nao_atingida:
          item?.meta_nao_atingida != null
            ? Number(item.meta_nao_atingida)
            : base?.meta_nao_atingida ?? null,
        meta_atingida:
          item?.meta_atingida != null
            ? Number(item.meta_atingida)
            : base?.meta_atingida ?? null,
        super_meta:
          item?.super_meta != null
            ? Number(item.super_meta)
            : base?.super_meta ?? null,
        tiers,
      } satisfies ConciliacaoCommissionBandRule;
    })
    .filter((item) => item.nome);

  return sortBandRules(sanitized);
}

export function hasConciliacaoBandRules(params?: ParametrosComissao | null) {
  if (!params?.conciliacao_regra_ativa) return false;
  if (!Array.isArray(params.conciliacao_faixas_loja) || params.conciliacao_faixas_loja.length === 0) {
    return false;
  }
  return sanitizeConciliacaoBandRules(params.conciliacao_faixas_loja, params).some(
    (item) => item.ativo
  );
}

export function resolveConciliacaoBandKey(params: {
  conciliacao_faixas_loja?: ConciliacaoCommissionBandRule[] | null;
  faixa_comissao?: string | null;
  percentual_comissao_loja?: number | null;
  is_seguro_viagem?: boolean | null;
}): ConciliacaoCommissionBandId {
  const customRules = Array.isArray(params.conciliacao_faixas_loja)
    ? sortBandRules(sanitizeConciliacaoBandRules(params.conciliacao_faixas_loja))
    : [];

  if (customRules.length > 0) {
    const matched = customRules.find(
      (item) => item.ativo && isBandRangeMatch(item, params.percentual_comissao_loja)
    );
    if (matched) return matched.faixa_loja;
  }

  const explicitId = normalizeBandId(params.faixa_comissao);
  if (explicitId) {
    const exact = customRules.find((item) => normalizeBandId(item.faixa_loja) === explicitId);
    if (exact) return exact.faixa_loja;

    const legacy = normalizeBandKey(params.faixa_comissao);
    if (legacy) return legacy;
  }

  const percentual = Number(params.percentual_comissao_loja || 0);
  if (params.is_seguro_viagem || percentual >= 32) {
    return "SEGURO_32_35";
  }
  if (percentual >= 10) {
    return "MAIOR_OU_IGUAL_10";
  }
  return "MENOR_10";
}

export function resolveConciliacaoBandRule(
  params: ParametrosComissao | null | undefined,
  options?: {
    faixa_comissao?: string | null;
    percentual_comissao_loja?: number | null;
    is_seguro_viagem?: boolean | null;
  }
): ConciliacaoCommissionBandRule | null {
  if (!params) return null;
  const rules = sanitizeConciliacaoBandRules(params.conciliacao_faixas_loja, params);
  if (rules.length === 0) return null;

  const bandKey = resolveConciliacaoBandKey({
    conciliacao_faixas_loja: params.conciliacao_faixas_loja,
    faixa_comissao: options?.faixa_comissao ?? null,
    percentual_comissao_loja: options?.percentual_comissao_loja ?? null,
    is_seguro_viagem: options?.is_seguro_viagem ?? null,
  });

  return (
    rules.find((item) => normalizeBandId(item.faixa_loja) === normalizeBandId(bandKey)) || null
  );
}

export function resolveConciliacaoCommissionSelection(
  params: ParametrosComissao | null | undefined,
  options?: {
    faixa_comissao?: string | null;
    percentual_comissao_loja?: number | null;
    is_seguro_viagem?: boolean | null;
  }
): ConciliacaoCommissionSelection {
  const bandKey = resolveConciliacaoBandKey({
    conciliacao_faixas_loja: params?.conciliacao_faixas_loja ?? null,
    faixa_comissao: options?.faixa_comissao ?? null,
    percentual_comissao_loja: options?.percentual_comissao_loja ?? null,
    is_seguro_viagem: options?.is_seguro_viagem ?? null,
  });

  if (!params?.conciliacao_regra_ativa) {
    return { kind: "NONE", bandKey, rule: null };
  }

  const hasCustomBands =
    Array.isArray(params.conciliacao_faixas_loja) &&
    params.conciliacao_faixas_loja.length > 0;

  if (hasCustomBands) {
    const band = resolveConciliacaoBandRule(params, options);
    if (!band || !band.ativo) {
      return { kind: "NONE", bandKey, rule: null };
    }
    if (band.tipo_calculo === "PRODUTO_DIFERENCIADO") {
      return { kind: "PRODUTO_DIFERENCIADO", bandKey, rule: null };
    }
    const rule = buildRuleFromDefinition({
      id: `conciliacao-${band.faixa_loja.toLowerCase()}`,
      tipo: band.tipo,
      meta_nao_atingida: band.meta_nao_atingida,
      meta_atingida: band.meta_atingida,
      super_meta: band.super_meta,
      tiers: band.tiers,
    });
    return rule
      ? { kind: "CONCILIACAO", bandKey, rule }
      : { kind: "NONE", bandKey, rule: null };
  }

  if (bandKey === "SEGURO_32_35") {
    return { kind: "PRODUTO_DIFERENCIADO", bandKey, rule: null };
  }

  const legacyRule = buildLegacyConciliacaoRule(params);
  return legacyRule
    ? { kind: "CONCILIACAO", bandKey, rule: legacyRule }
    : { kind: "NONE", bandKey, rule: null };
}

export function hasConciliacaoCommissionRule(params?: ParametrosComissao | null) {
  if (!params?.conciliacao_regra_ativa) return false;
  return hasConciliacaoBandRules(params) || Boolean(buildLegacyConciliacaoRule(params));
}

export function calcularPctConciliacao(
  params: ParametrosComissao | null | undefined,
  pctMeta: number,
  options?: {
    faixa_comissao?: string | null;
    percentual_comissao_loja?: number | null;
    is_seguro_viagem?: boolean | null;
  }
) {
  const selection = resolveConciliacaoCommissionSelection(params, options);
  if (selection.kind !== "CONCILIACAO" || !selection.rule) return 0;
  return calcularPctPorRegra(selection.rule, pctMeta);
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
