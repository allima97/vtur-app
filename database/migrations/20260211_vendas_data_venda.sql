-- 2026-02-11: adiciona data_venda em vendas

alter table public.vendas
  add column if not exists data_venda date;

update public.vendas
  set data_venda = coalesce(data_venda, data_lancamento, current_date)
  where data_venda is null;

alter table public.vendas
  alter column data_venda set not null;

create index if not exists idx_vendas_data_venda on public.vendas (data_venda);

