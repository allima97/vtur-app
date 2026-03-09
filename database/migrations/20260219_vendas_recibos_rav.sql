-- Add informational RAV value to vendas_recibos
alter table vendas_recibos
  add column if not exists valor_rav numeric default 0;

comment on column vendas_recibos.valor_rav is
  'Valor RAV informativo (nao afeta comissao/metas).';
