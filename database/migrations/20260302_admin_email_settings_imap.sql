-- 2026-03-02: Campos IMAP para caixa de entrada admin

alter table public.admin_email_settings
  add column if not exists imap_host text,
  add column if not exists imap_port integer,
  add column if not exists imap_secure boolean not null default true;
