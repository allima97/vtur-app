-- 2026-02-11: corrige visibilidade de usuarios corporativos para o master
-- Problema: policies exigiam master_empresas.status = 'approved', ocultando
-- gestores/vendedores corporativos em transicoes de vinculacao.

create or replace function public.master_can_access_company(uid uuid, company uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.master_empresas me
    where me.master_id = uid
      and me.company_id = company
      and coalesce(me.status, 'pending') <> 'rejected'
  )
  or company = (select u.company_id from public.users u where u.id = uid);
$$;

create or replace function public.master_can_access_user(master_id uuid, target_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = target_user_id
      and coalesce(u.uso_individual, false) = false
      and not public.is_admin_user_type(u.user_type_id)
      and u.company_id is not null
      and public.master_can_access_company(master_id, u.company_id)
  );
$$;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users
  for select using (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and coalesce(uso_individual, false) = false
    )
    or (
      is_master(auth.uid())
      and company_id is not null
      and coalesce(uso_individual, false) = false
      and public.master_can_access_company(auth.uid(), company_id)
    )
  );
