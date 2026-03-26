-- 2026-03-25: CRM templates/themes com leitura hierárquica por escopo

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

drop policy if exists user_message_templates_select on public.user_message_templates;
create policy user_message_templates_select on public.user_message_templates
for select
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
  or scope = 'system'
  or (
    scope in ('master', 'gestor')
    and company_id is not null
    and company_id = public.current_company_id()
  )
  or (
    scope = 'master'
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
      scope = 'user'
      or (
        scope = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        scope = 'master'
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
      scope = 'user'
      or (
        scope = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        scope = 'master'
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

drop policy if exists user_message_template_themes_select on public.user_message_template_themes;
create policy user_message_template_themes_select on public.user_message_template_themes
for select
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
  or scope = 'system'
  or (
    scope in ('master', 'gestor')
    and company_id is not null
    and company_id = public.current_company_id()
  )
  or (
    scope = 'master'
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
      scope = 'user'
      or (
        scope = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        scope = 'master'
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
      scope = 'user'
      or (
        scope = 'gestor'
        and is_gestor(auth.uid())
        and company_id = public.current_company_id()
      )
      or (
        scope = 'master'
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
