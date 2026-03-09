-- Add DU value (comissionable portion of taxes) to vendas_recibos
alter table vendas_recibos
  add column if not exists valor_du numeric default 0;

comment on column vendas_recibos.valor_du is
  'Valor DU comissionavel (parte das taxas).';
