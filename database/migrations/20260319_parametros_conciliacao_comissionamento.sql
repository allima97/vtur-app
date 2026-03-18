alter table public.parametros_comissao
  add column if not exists conciliacao_regra_ativa boolean not null default false,
  add column if not exists conciliacao_meta_nao_atingida numeric,
  add column if not exists conciliacao_meta_atingida numeric,
  add column if not exists conciliacao_super_meta numeric;
