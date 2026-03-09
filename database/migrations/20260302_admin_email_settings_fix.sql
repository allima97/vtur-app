-- 2026-03-02: Ajuste de constraint para permitir upsert por singleton

drop index if exists admin_email_settings_singleton_key;
create unique index if not exists admin_email_settings_singleton_key
  on public.admin_email_settings (singleton);
