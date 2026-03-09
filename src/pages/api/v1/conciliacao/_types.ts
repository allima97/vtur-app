export type ConciliacaoStatus = "BAIXA" | "OPFAX" | "ESTORNO" | "OUTRO";

export type ConciliacaoLinhaInput = {
  documento: string;
  movimento_data?: string | null; // ISO yyyy-mm-dd
  status?: ConciliacaoStatus | null;
  descricao?: string | null;

  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;

  origem?: string | null;
  raw?: any;
};
