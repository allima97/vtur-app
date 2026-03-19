alter table public.conciliacao_recibos
  add column if not exists ranking_vendedor_id uuid references public.users(id) on delete set null,
  add column if not exists ranking_produto_id uuid references public.tipo_produtos(id) on delete set null,
  add column if not exists ranking_assigned_by uuid references public.users(id) on delete set null,
  add column if not exists ranking_assigned_at timestamptz;

create index if not exists conciliacao_recibos_ranking_vendedor_idx
  on public.conciliacao_recibos (company_id, ranking_vendedor_id, movimento_data);

create index if not exists conciliacao_recibos_ranking_produto_idx
  on public.conciliacao_recibos (ranking_produto_id)
  where ranking_produto_id is not null;