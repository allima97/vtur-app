-- 2026-03-02: Remetente por template de aviso

alter table public.admin_avisos_templates
  add column if not exists sender_key text;

update public.admin_avisos_templates
  set sender_key = 'avisos'
  where sender_key is null or sender_key = '';

alter table public.admin_avisos_templates
  alter column sender_key set default 'avisos',
  alter column sender_key set not null;
