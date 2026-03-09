-- 2026-02-11: hotfix definitivo para recursao de RLS na tabela users
-- Sintoma: erro 54001 (stack depth limit exceeded) ao carregar perfil/listagens.
-- Causa: policies de users chamam funcoes que tambem leem public.users.
-- Correcao: funcoes helper passam a executar com row_security = off.

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
