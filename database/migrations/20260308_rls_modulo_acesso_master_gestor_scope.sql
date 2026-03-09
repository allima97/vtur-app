-- 2026-03-08: modulo_acesso por escopo (admin/master/gestor)
-- Objetivo: permitir que MASTER gerencie permissoes no portfolio e
-- GESTOR gerencie permissoes dos vendedores da propria empresa.

alter table public.modulo_acesso enable row level security;

drop policy if exists "modulo_acesso_select" on public.modulo_acesso;
create policy "modulo_acesso_select" on public.modulo_acesso
  for select using (
    is_admin(auth.uid())
    or usuario_id = auth.uid()
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
    )
    or (
      is_gestor(auth.uid())
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = modulo_acesso.usuario_id
          and u.company_id = public.current_company_id()
          and coalesce(u.uso_individual, false) = false
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

drop policy if exists "modulo_acesso_insert_admin" on public.modulo_acesso;
create policy "modulo_acesso_insert_admin" on public.modulo_acesso
  for insert with check (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
      and lower(coalesce(permissao, '')) in ('none', 'view', 'create', 'edit', 'delete')
    )
    or (
      is_gestor(auth.uid())
      and lower(coalesce(permissao, '')) in ('none', 'view', 'create', 'edit', 'delete')
      and lower(coalesce(modulo, '')) not like 'admin%'
      and lower(coalesce(modulo, '')) not like 'master%'
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = modulo_acesso.usuario_id
          and u.company_id = public.current_company_id()
          and coalesce(u.uso_individual, false) = false
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

drop policy if exists "modulo_acesso_update_admin" on public.modulo_acesso;
create policy "modulo_acesso_update_admin" on public.modulo_acesso
  for update using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
    )
    or (
      is_gestor(auth.uid())
      and lower(coalesce(modulo, '')) not like 'admin%'
      and lower(coalesce(modulo, '')) not like 'master%'
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = modulo_acesso.usuario_id
          and u.company_id = public.current_company_id()
          and coalesce(u.uso_individual, false) = false
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
      and lower(coalesce(permissao, '')) in ('none', 'view', 'create', 'edit', 'delete')
    )
    or (
      is_gestor(auth.uid())
      and lower(coalesce(permissao, '')) in ('none', 'view', 'create', 'edit', 'delete')
      and lower(coalesce(modulo, '')) not like 'admin%'
      and lower(coalesce(modulo, '')) not like 'master%'
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = modulo_acesso.usuario_id
          and u.company_id = public.current_company_id()
          and coalesce(u.uso_individual, false) = false
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

drop policy if exists "modulo_acesso_delete_admin" on public.modulo_acesso;
create policy "modulo_acesso_delete_admin" on public.modulo_acesso
  for delete using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
    )
    or (
      is_gestor(auth.uid())
      and lower(coalesce(modulo, '')) not like 'admin%'
      and lower(coalesce(modulo, '')) not like 'master%'
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = modulo_acesso.usuario_id
          and u.company_id = public.current_company_id()
          and coalesce(u.uso_individual, false) = false
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

