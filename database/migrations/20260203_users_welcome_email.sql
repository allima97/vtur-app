-- 2026-02-03: marca envio do email de boas-vindas
alter table public.users
  add column if not exists welcome_email_sent boolean not null default false;
