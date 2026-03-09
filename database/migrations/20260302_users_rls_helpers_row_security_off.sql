-- 2026-03-02: evita recursao infinita em RLS da tabela public.users
-- Sintoma: "infinite recursion detected in policy for relation \"users\"" ao atualizar (ex: active).
-- Causa comum: policies de users chamam funcoes que consultam public.users sob RLS.
-- Fix: executar helpers como SECURITY DEFINER com row_security = off.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    upper(
      coalesce(
        (
          select ut.name
          from public.user_types ut
          join public.users u on u.id = uid and u.user_type_id = ut.id
        ),
        ''
      )
    ) like '%ADMIN%',
    false
  );
$$;

create or replace function public.is_master(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    upper(
      coalesce(
        (
          select ut.name
          from public.user_types ut
          join public.users u on u.id = uid and u.user_type_id = ut.id
        ),
        ''
      )
    ) like '%MASTER%',
    false
  );
$$;

create or replace function public.is_gestor(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    upper(
      coalesce(
        (
          select ut.name
          from public.user_types ut
          join public.users u on u.id = uid and u.user_type_id = ut.id
        ),
        ''
      )
    ) like '%GESTOR%',
    false
  );
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.company_id
  from public.users u
  where u.id = auth.uid();
$$;

-- Mantem a regra mais permissiva (pending/approved) e bloqueia apenas rejected.
create or replace function public.master_can_access_company(uid uuid, company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
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
language sql
stable
security definer
set search_path = public
set row_security = off
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
