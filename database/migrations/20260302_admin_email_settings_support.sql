-- 2026-03-02: Remetente suporte adicional

alter table public.admin_email_settings
  add column if not exists suporte_from_email text;
