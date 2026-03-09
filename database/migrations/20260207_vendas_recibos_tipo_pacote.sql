-- 2026-02-07: adiciona tipo_pacote em vendas_recibos

alter table public.vendas_recibos
  add column if not exists tipo_pacote text;

create index if not exists idx_vendas_recibos_tipo_pacote
  on public.vendas_recibos (tipo_pacote);
