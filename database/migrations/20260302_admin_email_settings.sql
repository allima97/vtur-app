-- 2026-03-02: Configurações de e-mail (SMTP) administráveis

create table if not exists public.admin_email_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  smtp_host text,
  smtp_port integer,
  smtp_secure boolean not null default true,
  smtp_user text,
  smtp_pass text,
  alerta_from_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_email_settings_singleton_key
  on public.admin_email_settings (singleton)
  where singleton;

alter table public.admin_email_settings enable row level security;
drop policy if exists "admin_email_settings_admin_all" on public.admin_email_settings;
create policy "admin_email_settings_admin_all" on public.admin_email_settings
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
