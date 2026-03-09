-- 2026-03-11: endurece RLS de users para impedir auto-alteracao de escopo
-- Objetivo: usuario logado pode atualizar seu perfil, mas nao pode mudar company_id/user_type_id
-- (nem desfazer uso corporativo quando bloqueado).

create or replace function public.current_user_type_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.user_type_id
  from public.users u
  where u.id = auth.uid();
$$;

create or replace function public.current_uso_individual()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.uso_individual
  from public.users u
  where u.id = auth.uid();
$$;

create or replace function public.current_created_by_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.created_by_gestor
  from public.users u
  where u.id = auth.uid();
$$;

grant execute on function public.current_user_type_id() to anon, authenticated, service_role;
grant execute on function public.current_uso_individual() to anon, authenticated, service_role;
grant execute on function public.current_created_by_gestor() to anon, authenticated, service_role;

alter table public.users enable row level security;

drop policy if exists "users_insert_self_or_admin" on public.users;
create policy "users_insert_self_or_admin" on public.users
  for insert with check (
    is_admin(auth.uid())
    or (
      id = auth.uid()
      and company_id is null
      and user_type_id is null
      and coalesce(uso_individual, true) = true
    )
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
    or (
      id = auth.uid()
      and company_id is not distinct from public.current_company_id()
      and user_type_id is not distinct from public.current_user_type_id()
      and created_by_gestor is not distinct from public.current_created_by_gestor()
      and (
        (
          (
            coalesce(public.current_created_by_gestor(), false) = true
            or (
              public.current_company_id() is not null
              and coalesce(public.current_uso_individual(), true) = false
            )
          )
          and uso_individual is not distinct from public.current_uso_individual()
        )
        or (
          not (
            coalesce(public.current_created_by_gestor(), false) = true
            or (
              public.current_company_id() is not null
              and coalesce(public.current_uso_individual(), true) = false
            )
          )
          and (
            uso_individual is null
            or uso_individual = true
            or (uso_individual = false and company_id is not null)
          )
        )
      )
    )
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

