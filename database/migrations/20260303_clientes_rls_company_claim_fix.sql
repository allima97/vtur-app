-- 2026-03-03: Hotfix RLS clientes
-- Motivo: algumas sessões/JWTs trazem `request.jwt.claims.company_id` como string vazia.
-- A policy antiga fazia cast direto `current_setting(... )::uuid`, causando erro SQL
-- (invalid input syntax for type uuid) e o PostgREST responde 500.

-- helper local (mantém padrão usado no projeto)
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with raw as (
    select nullif(btrim(current_setting('request.jwt.claims.company_id', true)), '') as v
  ), cleaned as (
    select nullif(trim(both '"' from v), '') as v
    from raw
  ), parsed as (
    select case
      when v is null then null
      when lower(v) in ('null', 'undefined') then null
      when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid
      else null
    end as cid
    from cleaned
  )
  select coalesce(
    (select cid from parsed),
    (select u.company_id from public.users u where u.id = auth.uid())
  );
$$;

alter table public.clientes enable row level security;

drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select" on public.clientes
  for select using (
    is_admin(auth.uid())
    or company_id = public.current_company_id()
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or created_by = auth.uid()
  );

drop policy if exists "clientes_write" on public.clientes;

-- WRITE: permitir criar/editar para usuários da mesma company.
-- DELETE: bloqueado (sem policy de delete).

drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes
  for insert
  with check (
    is_admin(auth.uid())
    or (
      (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (created_by is null or created_by = auth.uid())
    )
  );

drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes
  for update
  using (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists "clientes_delete_admin" on public.clientes;
