-- 2026-03-10: permite MASTER operar usuários da própria company_id
-- mesmo sem vínculo explícito em master_empresas (ex.: master interno de filial única).
-- Ajusta policies de INSERT/UPDATE para aceitar company_id = current_company_id().

alter table public.users enable row level security;

drop policy if exists "users_insert_self_or_admin" on public.users;
create policy "users_insert_self_or_admin" on public.users
  for insert with check (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and not public.is_admin_user_type(user_type_id)
      and coalesce(uso_individual, false) = false
      and company_id is not null
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
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
      and not public.is_admin_user_type(users.user_type_id)
      and (
        (
          users.company_id is not null
          and coalesce(users.uso_individual, false) = false
          and (
            public.master_can_access_company(auth.uid(), users.company_id)
            or users.company_id = public.current_company_id()
          )
        )
        or (
          users.company_id is null
          and users.user_type_id is null
          and coalesce(users.uso_individual, true) = true
        )
      )
    )
    or (
      is_gestor(auth.uid())
      and (
        (
          users.company_id = public.current_company_id()
          and coalesce(users.uso_individual, false) = false
          and exists (
            select 1
            from public.user_types ut
            where ut.id = users.user_type_id
              and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
          )
        )
        or (
          users.company_id is null
          and users.user_type_id is null
          and coalesce(users.uso_individual, true) = true
        )
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and not public.is_admin_user_type(user_type_id)
      and coalesce(uso_individual, false) = false
      and company_id is not null
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
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

