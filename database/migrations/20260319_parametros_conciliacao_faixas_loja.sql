alter table if exists public.parametros_comissao
  add column if not exists conciliacao_faixas_loja jsonb not null default '[]'::jsonb;
