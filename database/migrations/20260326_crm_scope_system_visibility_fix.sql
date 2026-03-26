-- 2026-03-26: Fix definitivo de visibilidade CRM por escopo (system/master/gestor/user)
-- Objetivo:
-- 1) Normalizar valores legados de scope.
-- 2) Garantir policies de leitura que exponham scope='system' para todos autenticados.
-- 3) Manter escrita de scope='system' restrita ao admin.

alter table public.user_message_templates
  add column if not exists scope text;

alter table public.user_message_template_themes
  add column if not exists scope text;

-- Normalização de valores legados
update public.user_message_templates
set scope = lower(trim(coalesce(scope, '')));

update public.user_message_template_themes
set scope = lower(trim(coalesce(scope, '')));

update public.user_message_templates
set scope = 'system'
where scope in ('system', 'sistema', 'all', 'global', 'todos');

update public.user_message_template_themes
set scope = 'system'
where scope in ('system', 'sistema', 'all', 'global', 'todos');

update public.user_message_templates
set scope = 'master'
where scope in ('master', 'empresa');

update public.user_message_template_themes
set scope = 'master'
where scope in ('master', 'empresa');

update public.user_message_templates
set scope = 'gestor'
where scope in ('gestor', 'manager');

update public.user_message_template_themes
set scope = 'gestor'
where scope in ('gestor', 'manager');

update public.user_message_templates
set scope = 'user'
where scope is null or scope = '' or scope not in ('system', 'master', 'gestor', 'user');

update public.user_message_template_themes
set scope = 'user'
where scope is null or scope = '' or scope not in ('system', 'master', 'gestor', 'user');

alter table public.user_message_templates
  alter column scope set default 'user';
alter table public.user_message_templates
  alter column scope set not null;

alter table public.user_message_template_themes
  alter column scope set default 'user';
alter table public.user_message_template_themes
  alter column scope set not null;

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

-- ── Policies: user_message_templates ─────────────────────────────────────
drop policy if exists user_message_templates_select on public.user_message_templates;
create policy user_message_templates_select on public.user_message_templates
for select
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
  or lower(coalesce(scope, '')) = 'system'
  or (
    lower(coalesce(scope, '')) in ('master', 'gestor')
    and company_id is not null
    and company_id = public.current_company_id()
  )
  or (
    lower(coalesce(scope, '')) = 'master'
    and company_id is not null
    and is_master(auth.uid())
    and public.master_can_access_company(auth.uid(), company_id)
  )
);

drop policy if exists user_message_templates_insert on public.user_message_templates;
create policy user_message_templates_insert on public.user_message_templates
for insert
with check (
  is_admin(auth.uid())
  or (
    user_id = auth.uid()
    and (
      lower(coalesce(scope, '')) = 'user'
      or (
        lower(coalesce(scope, '')) = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        lower(coalesce(scope, '')) = 'master'
        and is_master(auth.uid())
        and company_id is not null
        and public.master_can_access_company(auth.uid(), company_id)
      )
    )
  )
);

drop policy if exists user_message_templates_update on public.user_message_templates;
create policy user_message_templates_update on public.user_message_templates
for update
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
)
with check (
  is_admin(auth.uid())
  or (
    user_id = auth.uid()
    and (
      lower(coalesce(scope, '')) = 'user'
      or (
        lower(coalesce(scope, '')) = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        lower(coalesce(scope, '')) = 'master'
        and is_master(auth.uid())
        and company_id is not null
        and public.master_can_access_company(auth.uid(), company_id)
      )
    )
  )
);

drop policy if exists user_message_templates_delete on public.user_message_templates;
create policy user_message_templates_delete on public.user_message_templates
for delete
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
);

-- ── Policies: user_message_template_themes ───────────────────────────────
drop policy if exists user_message_template_themes_select on public.user_message_template_themes;
create policy user_message_template_themes_select on public.user_message_template_themes
for select
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
  or lower(coalesce(scope, '')) = 'system'
  or (
    lower(coalesce(scope, '')) in ('master', 'gestor')
    and company_id is not null
    and company_id = public.current_company_id()
  )
  or (
    lower(coalesce(scope, '')) = 'master'
    and company_id is not null
    and is_master(auth.uid())
    and public.master_can_access_company(auth.uid(), company_id)
  )
);

drop policy if exists user_message_template_themes_insert on public.user_message_template_themes;
create policy user_message_template_themes_insert on public.user_message_template_themes
for insert
with check (
  is_admin(auth.uid())
  or (
    user_id = auth.uid()
    and (
      lower(coalesce(scope, '')) = 'user'
      or (
        lower(coalesce(scope, '')) = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        lower(coalesce(scope, '')) = 'master'
        and is_master(auth.uid())
        and company_id is not null
        and public.master_can_access_company(auth.uid(), company_id)
      )
    )
  )
);

drop policy if exists user_message_template_themes_update on public.user_message_template_themes;
create policy user_message_template_themes_update on public.user_message_template_themes
for update
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
)
with check (
  is_admin(auth.uid())
  or (
    user_id = auth.uid()
    and (
      lower(coalesce(scope, '')) = 'user'
      or (
        lower(coalesce(scope, '')) = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        lower(coalesce(scope, '')) = 'master'
        and is_master(auth.uid())
        and company_id is not null
        and public.master_can_access_company(auth.uid(), company_id)
      )
    )
  )
);

drop policy if exists user_message_template_themes_delete on public.user_message_template_themes;
create policy user_message_template_themes_delete on public.user_message_template_themes
for delete
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
);
