alter table public.parametros_comissao
  add column if not exists conciliacao_tipo text not null default 'GERAL',
  add column if not exists conciliacao_tiers jsonb not null default '[]'::jsonb;
