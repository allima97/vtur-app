-- 2026-02-06: adiciona controle de fechamento de consultorias online

alter table public.consultorias_online
  add column if not exists fechada boolean not null default false;

alter table public.consultorias_online
  add column if not exists fechada_em timestamp with time zone;

create index if not exists consultorias_online_fechada_idx
  on public.consultorias_online (fechada);

select pg_notify('pgrst', 'reload schema');
