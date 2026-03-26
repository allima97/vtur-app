-- 2026-03-25: Hotfix para ambientes onde as policies de CRM foram aplicadas
-- antes da criação da coluna `scope`.

alter table public.user_message_templates
  add column if not exists scope text not null default 'user';

alter table public.user_message_template_themes
  add column if not exists scope text not null default 'user';

alter table public.user_message_templates
  drop constraint if exists user_message_templates_scope_check;
alter table public.user_message_templates
  add constraint user_message_templates_scope_check
    check (scope in ('system', 'master', 'gestor', 'user'));

alter table public.user_message_template_themes
  drop constraint if exists crm_theme_scope_check;
alter table public.user_message_template_themes
  add constraint crm_theme_scope_check
    check (scope in ('system', 'master', 'gestor', 'user'));
