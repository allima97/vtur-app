import { normalizeText } from "./normalizeText";
import { supabaseBrowser } from "./supabase-browser";

const DEFAULT_NAO_COMISSIONAVEIS = [
  "credito diversos",
  "credito pax",
  "credito passageiro",
  "credito de viagem",
  "credipax",
  "vale viagem",
  "carta de credito",
  "credito",
];

const DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED = DEFAULT_NAO_COMISSIONAVEIS.map((termo) =>
  normalizeText(termo, { trim: true, collapseWhitespace: true })
).filter(Boolean);

let cachedTermosNaoComissionaveis: string[] | null = null;
let termosLoadPromise: Promise<string[]> | null = null;

function normalizeTerm(value?: string | null) {
  return normalizeText(value || "", { trim: true, collapseWhitespace: true });
}

export async function carregarTermosNaoComissionaveis(options: { force?: boolean } = {}) {
  const { force = false } = options;
  if (!force && cachedTermosNaoComissionaveis) return cachedTermosNaoComissionaveis;
  if (!force && termosLoadPromise) return termosLoadPromise;

  termosLoadPromise = (async () => {
    try {
      const { data, error } = await supabaseBrowser
        .from("parametros_pagamentos_nao_comissionaveis")
        .select("termo, termo_normalizado, ativo")
        .eq("ativo", true)
        .order("termo", { ascending: true });
      if (error) throw error;
      const termos = (data || [])
        .map((row: any) => normalizeTerm(row?.termo_normalizado || row?.termo))
        .filter(Boolean);
      const unique = Array.from(new Set(termos));
      cachedTermosNaoComissionaveis = unique;
      return unique;
    } catch (err) {
      console.warn("[pagamentoUtils] Falha ao carregar termos nao comissionaveis.", err);
    } finally {
      termosLoadPromise = null;
    }
    cachedTermosNaoComissionaveis = DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED;
    return cachedTermosNaoComissionaveis;
  })();

  return termosLoadPromise;
}

export function isFormaNaoComissionavel(nome?: string | null, termos?: string[] | null) {
  const normalized = normalizeTerm(nome);
  if (!normalized) return false;
  if (normalized.includes("cartao") && normalized.includes("credito")) return false;
  const lista =
    termos && termos.length
      ? termos
      : cachedTermosNaoComissionaveis || DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED;
  return lista.some((termo) => termo && normalized.includes(termo));
}

export function calcularNaoComissionavelPorVenda(
  pagamentos: {
    venda_id: string;
    valor_total?: number | null;
    valor_bruto?: number | null;
    desconto_valor?: number | null;
    paga_comissao?: boolean | null;
    forma_nome?: string | null;
  }[],
  termos?: string[] | null
) {
  const mapa = new Map<string, number>();
  pagamentos.forEach((pagamento) => {
    const naoComissiona =
      pagamento.paga_comissao === false ||
      isFormaNaoComissionavel(pagamento.forma_nome, termos);
    if (!naoComissiona) return;
    const total = Number(pagamento.valor_total || 0);
    const bruto = Number(pagamento.valor_bruto || 0);
    const desconto = Number(pagamento.desconto_valor || 0);
    const valorBase = bruto > 0 ? bruto : total > 0 ? total : Math.max(0, bruto - desconto);
    if (valorBase <= 0) return;
    mapa.set(pagamento.venda_id, (mapa.get(pagamento.venda_id) || 0) + valorBase);
  });
  return mapa;
}
