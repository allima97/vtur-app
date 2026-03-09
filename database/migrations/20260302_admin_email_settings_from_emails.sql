-- 2026-03-02: Remetentes adicionais por tipo (admin/avisos/financeiro)

alter table public.admin_email_settings
  add column if not exists admin_from_email text,
  add column if not exists avisos_from_email text,
  add column if not exists financeiro_from_email text;
