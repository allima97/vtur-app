-- 2026-03-08: permite MASTER criar/editar usuarios corporativos do portfolio
-- e mantém GESTOR restrito a vendedores da propria empresa.

alter table public.users enable row level security;

drop policy if exists "users_insert_self_or_admin" on public.users;
create policy "users_insert_self_or_admin" on public.users
  for insert with check (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and coalesce(uso_individual, false) = false
      and public.master_can_access_company(auth.uid(), company_id)
      and not public.is_admin_user_type(user_type_id)
    )
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
      and coalesce(uso_individual, false) = false
      and exists (
        select 1
        from public.user_types ut
        where ut.id = user_type_id
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

drop policy if exists "users_update_self_or_admin" on public.users;
create policy "users_update_self_or_admin" on public.users
  for update using (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and coalesce(uso_individual, false) = false
      and public.master_can_access_company(auth.uid(), company_id)
    )
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
      and coalesce(uso_individual, false) = false
      and exists (
        select 1
        from public.user_types ut
        where ut.id = users.user_type_id
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and coalesce(uso_individual, false) = false
      and public.master_can_access_company(auth.uid(), company_id)
      and not public.is_admin_user_type(user_type_id)
    )
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
      and coalesce(uso_individual, false) = false
      and exists (
        select 1
        from public.user_types ut
        where ut.id = user_type_id
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

