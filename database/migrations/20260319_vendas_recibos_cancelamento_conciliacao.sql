alter table public.vendas_recibos
  add column if not exists cancelado_por_conciliacao_em date,
  add column if not exists cancelado_por_conciliacao_observacao text;

create index if not exists idx_vendas_recibos_cancelado_conciliacao
  on public.vendas_recibos (cancelado_por_conciliacao_em)
  where cancelado_por_conciliacao_em is not null;
