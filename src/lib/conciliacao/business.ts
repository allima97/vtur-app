export type ConciliacaoStatus = "BAIXA" | "OPFAX" | "ESTORNO" | "OUTRO";

export type ConciliacaoFaixaComissao = string | "SEM_COMISSAO";

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 10000) / 10000;
}

function firstPositiveMoney(...values: Array<number | null | undefined>) {
  for (const value of values) {
    const num = Number(value ?? 0);
    if (Number.isFinite(num) && Math.abs(num) > 0.009) return roundMoney(num);
  }
  return null;
}

function firstPositivePercent(...values: Array<number | null | undefined>) {
  for (const value of values) {
    const num = Number(value ?? 0);
    if (Number.isFinite(num) && num > 0) return roundPercent(num);
  }
  return null;
}

export function normalizeConciliacaoDescricaoKey(value?: string | null) {
  return normalizeText(value);
}

export function normalizeConciliacaoStatus(value?: string | null): ConciliacaoStatus {
  const raw = normalizeText(value);
  if (!raw) return "OUTRO";
  if (raw.includes("ESTORNO")) return "ESTORNO";
  if (raw.includes("OPFAX")) return "OPFAX";
  if (raw.includes("BAIXA")) return "BAIXA";
  return "OUTRO";
}

export function inferConciliacaoStatus(descricao?: string | null): ConciliacaoStatus {
  return normalizeConciliacaoStatus(descricao);
}

export function calcularValorVendaReal(params: {
  valorLancamentos?: number | null;
  valorTaxas?: number | null;
  valorDescontos?: number | null;
  valorAbatimentos?: number | null;
}) {
  const bruto = Number(params.valorLancamentos || 0);
  const taxas = Number(params.valorTaxas || 0);
  const descontos = Number(params.valorDescontos || 0);
  const abatimentos = Number(params.valorAbatimentos || 0);
  return roundMoney(Math.max(0, bruto - taxas - descontos - abatimentos));
}

export function calcularPercentualComissaoLoja(params: {
  valorVendaReal?: number | null;
  valorSaldo?: number | null;
}) {
  const base = Number(params.valorVendaReal || 0);
  const saldo = Number(params.valorSaldo || 0);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(saldo) || saldo <= 0) return null;
  return roundPercent((saldo / base) * 100);
}

export function resolveConciliacaoComissaoLoja(params: {
  valorComissaoLoja?: number | null;
  valorSaldo?: number | null;
  valorCalculadaLoja?: number | null;
  valorVisaoMaster?: number | null;
  percentualComissaoLoja?: number | null;
  valorVendaReal?: number | null;
}) {
  const valorVendaReal = Number(params.valorVendaReal || 0);
  const percentualExplcito = firstPositivePercent(params.percentualComissaoLoja);
  const valorDireto = firstPositiveMoney(
    params.valorComissaoLoja,
    params.valorSaldo,
    params.valorCalculadaLoja,
    params.valorVisaoMaster
  );

  if (valorDireto != null) return valorDireto;
  if (percentualExplcito != null && Number.isFinite(valorVendaReal) && valorVendaReal > 0) {
    return roundMoney((valorVendaReal * percentualExplcito) / 100);
  }
  return 0;
}

export function resolveConciliacaoPercentualLoja(params: {
  percentualComissaoLoja?: number | null;
  valorComissaoLoja?: number | null;
  valorSaldo?: number | null;
  valorCalculadaLoja?: number | null;
  valorVisaoMaster?: number | null;
  valorVendaReal?: number | null;
}) {
  const percentualExplcito = firstPositivePercent(params.percentualComissaoLoja);
  if (percentualExplcito != null) return percentualExplcito;

  const valorComissaoLoja = resolveConciliacaoComissaoLoja({
    valorComissaoLoja: params.valorComissaoLoja,
    valorSaldo: params.valorSaldo,
    valorCalculadaLoja: params.valorCalculadaLoja,
    valorVisaoMaster: params.valorVisaoMaster,
    valorVendaReal: params.valorVendaReal,
  });

  return calcularPercentualComissaoLoja({
    valorVendaReal: params.valorVendaReal,
    valorSaldo: valorComissaoLoja,
  });
}

export function classificarFaixaComissao(percentual?: number | null): ConciliacaoFaixaComissao {
  const pct = Number(percentual || 0);
  if (!Number.isFinite(pct) || pct <= 0) return "SEM_COMISSAO";
  if (Math.abs(pct - 32) <= 0.6 || Math.abs(pct - 35) <= 0.6 || (pct >= 31.5 && pct <= 35.5)) {
    return "SEGURO_32_35";
  }
  if (pct >= 10) return "MAIOR_OU_IGUAL_10";
  return "MENOR_10";
}

export function isConciliacaoSeguroViagem(percentual?: number | null) {
  return classificarFaixaComissao(percentual) === "SEGURO_32_35";
}

export function temValorFinanceiro(params: {
  valorLancamentos?: number | null;
  valorTaxas?: number | null;
  valorDescontos?: number | null;
  valorAbatimentos?: number | null;
  valorSaldo?: number | null;
  valorOpfax?: number | null;
}) {
  const values = [
    params.valorLancamentos,
    params.valorTaxas,
    params.valorDescontos,
    params.valorAbatimentos,
    params.valorSaldo,
    params.valorOpfax,
  ];
  return values.some((value) => Math.abs(Number(value || 0)) > 0.009);
}

export function buildConciliacaoMetrics(params: {
  descricao?: string | null;
  valorLancamentos?: number | null;
  valorTaxas?: number | null;
  valorDescontos?: number | null;
  valorAbatimentos?: number | null;
  valorSaldo?: number | null;
  valorOpfax?: number | null;
  valorCalculadaLoja?: number | null;
  valorVisaoMaster?: number | null;
  valorComissaoLoja?: number | null;
  percentualComissaoLoja?: number | null;
}) {
  const status = inferConciliacaoStatus(params.descricao);
  const valorVendaReal = calcularValorVendaReal({
    valorLancamentos: params.valorLancamentos,
    valorTaxas: params.valorTaxas,
    valorDescontos: params.valorDescontos,
    valorAbatimentos: params.valorAbatimentos,
  });
  const valorComissaoLoja = resolveConciliacaoComissaoLoja({
    valorComissaoLoja: params.valorComissaoLoja,
    valorSaldo: params.valorSaldo,
    valorCalculadaLoja: params.valorCalculadaLoja,
    valorVisaoMaster: params.valorVisaoMaster,
    percentualComissaoLoja: params.percentualComissaoLoja,
    valorVendaReal,
  });
  const percentualComissaoLoja = resolveConciliacaoPercentualLoja({
    percentualComissaoLoja: params.percentualComissaoLoja,
    valorComissaoLoja,
    valorSaldo: params.valorSaldo,
    valorCalculadaLoja: params.valorCalculadaLoja,
    valorVisaoMaster: params.valorVisaoMaster,
    valorVendaReal,
  });
  const faixaComissao = classificarFaixaComissao(percentualComissaoLoja);

  return {
    status,
    descricaoChave: normalizeConciliacaoDescricaoKey(params.descricao),
    valorVendaReal,
    valorComissaoLoja,
    percentualComissaoLoja,
    faixaComissao,
    isSeguroViagem: isConciliacaoSeguroViagem(percentualComissaoLoja),
    temValorFinanceiro: temValorFinanceiro({
      valorLancamentos: params.valorLancamentos,
      valorTaxas: params.valorTaxas,
      valorDescontos: params.valorDescontos,
      valorAbatimentos: params.valorAbatimentos,
      valorSaldo: params.valorSaldo,
      valorOpfax: params.valorOpfax,
    }),
  };
}
