-- 2026-03-26: Regra de design obrigatória dos cards CRM (Template Master Layout)
-- - layout único: master-card-v1
-- - dimensão única: 1080x1080

alter table public.user_message_templates
  add column if not exists layout_key text;

update public.user_message_templates
set layout_key = 'master-card-v1'
where coalesce(layout_key, '') = '';

alter table public.user_message_templates
  alter column layout_key set default 'master-card-v1';

alter table public.user_message_templates
  alter column layout_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_message_templates_layout_key_master_check'
  ) then
    alter table public.user_message_templates
      add constraint user_message_templates_layout_key_master_check
      check (layout_key = 'master-card-v1');
  end if;
end $$;

alter table public.user_message_template_themes
  alter column width_px set default 1080;

alter table public.user_message_template_themes
  alter column height_px set default 1080;

update public.user_message_template_themes
set width_px = 1080,
    height_px = 1080
where coalesce(width_px, 0) <> 1080
   or coalesce(height_px, 0) <> 1080;
