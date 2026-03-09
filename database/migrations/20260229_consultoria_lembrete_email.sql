-- 2026-02-29: adiciona controle de envio de lembretes por e-mail

alter table public.consultorias_online
  add column if not exists lembrete_enviado_em timestamp with time zone;

create index if not exists consultorias_online_lembrete_enviado_idx
  on public.consultorias_online (lembrete_enviado_em);
