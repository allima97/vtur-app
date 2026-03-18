alter table public.parametros_comissao
  add column if not exists mfa_obrigatorio boolean not null default false;
