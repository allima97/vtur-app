-- 2026-03-01: controle de envios por canal para lembretes de consultoria

alter table public.consultorias_online
  add column if not exists lembrete_envios jsonb not null default '{}'::jsonb;

create index if not exists consultorias_online_lembrete_envios_idx
  on public.consultorias_online using gin (lembrete_envios);
