-- 2026-02-05: privacidade de clientes (uso_individual)

create extension if not exists "pgcrypto";

-- coluna de autoria
alter table public.clientes
  add column if not exists created_by uuid references public.users(id);

create index if not exists idx_clientes_created_by on public.clientes (created_by);

-- helper
create or replace function public.is_uso_individual(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select u.uso_individual from public.users u where u.id = uid), false);
$$;

-- RLS: CLIENTES
alter table public.clientes enable row level security;

drop policy if exists "clientes_select" on public.clientes;
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
        company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                              (select u.company_id from public.users u where u.id = auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        created_by is null
        or exists (
          select 1 from public.users u
          where u.id = created_by and coalesce(u.uso_individual, false) = false
        )
        or created_by = auth.uid()
      )
    )
  );

drop policy if exists "clientes_write" on public.clientes;
create policy "clientes_write" on public.clientes
  for all using (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                              (select u.company_id from public.users u where u.id = auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
        or (is_gestor(auth.uid()) and company_id = public.current_company_id())
      )
      and (
        created_by is null
        or exists (
          select 1 from public.users u
          where u.id = created_by and coalesce(u.uso_individual, false) = false
        )
        or created_by = auth.uid()
      )
    )
  );
