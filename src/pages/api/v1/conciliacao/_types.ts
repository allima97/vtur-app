export type ConciliacaoStatus = "BAIXA" | "OPFAX" | "ESTORNO" | "OUTRO";
export type ConciliacaoFaixaComissao =
  | "MENOR_10"
  | "MAIOR_OU_IGUAL_10"
  | "SEGURO_32_35"
  | "SEM_COMISSAO";

export type ConciliacaoLinhaInput = {
  documento: string;
  movimento_data?: string | null; // ISO yyyy-mm-dd
  status?: ConciliacaoStatus | null;
  descricao?: string | null;
  descricao_chave?: string | null;

  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;
  valor_venda_real?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: ConciliacaoFaixaComissao | null;
  is_seguro_viagem?: boolean | null;
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;

  origem?: string | null;
  raw?: any;
};
