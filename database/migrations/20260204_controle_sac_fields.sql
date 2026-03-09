-- Adiciona campos extras no Controle de SAC
alter table public.sac_controle
  add column if not exists status text default 'aberto',
  add column if not exists responsavel text,
  add column if not exists prazo date;

update public.sac_controle
set status = 'aberto'
where status is null;
