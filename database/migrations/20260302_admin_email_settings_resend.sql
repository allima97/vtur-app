-- 2026-03-02: Chave API Resend configurável no admin

alter table public.admin_email_settings
  add column if not exists resend_api_key text;
