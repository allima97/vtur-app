-- 2026-03-04: Hotfix RLS clientes (recursao infinita)
-- Sintoma: PostgREST 500 com SQLSTATE 42P17 "infinite recursion detected in policy for relation \"clientes\""
-- Causa mais comum: policies chamando funcoes/subqueries que acabam reentrando na propria tabela,
-- ou helpers que leem tabelas sob RLS e geram ciclo.
-- Correcao: padroniza helpers com row_security = off e recria policies de clientes.

-- Helpers: garantir que nao gerem recursao via RLS em cascata
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

create or replace function public.is_uso_individual(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((select u.uso_individual from public.users u where u.id = uid), false);
$$;

create or replace function public.is_corporate_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (
      select coalesce(u.uso_individual, false) = false
      from public.users u
      where u.id = uid
    ),
    false
  );
$$;

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

-- Coluna de autoria (para uso_individual e auditoria)
alter table public.clientes
  add column if not exists created_by uuid references public.users(id);

create index if not exists idx_clientes_created_by on public.clientes (created_by);

-- RLS: CLIENTES
alter table public.clientes enable row level security;

-- Hotfix: limpar policies antigas/legadas.
-- Importante: o Postgres pode avaliar multiplas policies para o mesmo comando.
-- Se ficar qualquer policy antiga com cast invalido (company_id = ''::uuid) ou
-- recursao (consultando a propria tabela), o PostgREST continua retornando 500.
do $$
declare
  pol record;
begin
  for pol in (
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clientes'
      and policyname not in (
        'clientes_select',
        'clientes_insert',
        'clientes_update',
        'clientes_delete_admin'
      )
  ) loop
    execute format('drop policy if exists %I on public.clientes', pol.policyname);
  end loop;
end
$$;

-- Drop defensivo (independente de qual versao esteja no banco)
drop policy if exists "clientes_select" on public.clientes;
drop policy if exists "clientes_write" on public.clientes;
drop policy if exists "clientes_insert" on public.clientes;
drop policy if exists "clientes_update" on public.clientes;
drop policy if exists "clientes_delete_admin" on public.clientes;

-- Drop defensivo extra (nomes comuns já vistos causando recursão)
drop policy if exists "clientes_update_roles_company" on public.clientes;
drop policy if exists "clientes_update_same_company_fallback" on public.clientes;

-- SELECT
create policy "clientes_select" on public.clientes
  for select using (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  );

-- INSERT
create policy "clientes_insert" on public.clientes
  for insert
  with check (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  );

-- UPDATE
create policy "clientes_update" on public.clientes
  for update
  using (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  );

-- DELETE: somente admin (opcional; se nao quiser delete, remova este bloco)
create policy "clientes_delete_admin" on public.clientes
  for delete
  using (is_admin(auth.uid()));
