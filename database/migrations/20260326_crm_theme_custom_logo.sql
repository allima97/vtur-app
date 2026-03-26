-- 2026-03-26: logo personalizado por template no CRM

alter table public.user_message_template_themes
  add column if not exists logo_url text null,
  add column if not exists logo_path text null;

-- Backfill opcional para registros já preenchidos com URL pública do bucket de templates.
update public.user_message_template_themes
set logo_path = nullif(
  split_part(
    regexp_replace(
      coalesce(logo_url, ''),
      '^.*?/storage/v1/object/public/message-template-themes/',
      ''
    ),
    '?',
    1
  ),
  ''
)
where logo_path is null
  and coalesce(logo_url, '') like '%/storage/v1/object/public/message-template-themes/%';
