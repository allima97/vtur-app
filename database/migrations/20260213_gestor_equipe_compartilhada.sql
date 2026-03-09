-- 2026-02-13: Gestores podem compartilhar a mesma equipe (link entre gestores)

-- Tabela de vinculo: gestor -> gestor_base (equipe do base sera usada pelo gestor).
create table if not exists public.gestor_equipe_compartilhada (
  gestor_id uuid primary key references public.users(id) on delete cascade,
  gestor_base_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  constraint gestor_equipe_compartilhada_no_self check (gestor_id <> gestor_base_id)
);

create index if not exists idx_gestor_equipe_compartilhada_base
  on public.gestor_equipe_compartilhada (gestor_base_id);

alter table public.gestor_equipe_compartilhada enable row level security;

drop policy if exists "gestor_equipe_compartilhada_select" on public.gestor_equipe_compartilhada;
create policy "gestor_equipe_compartilhada_select" on public.gestor_equipe_compartilhada
  for select using (
    is_admin(auth.uid())
    or gestor_id = auth.uid()
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
      and public.master_can_access_user(auth.uid(), gestor_base_id)
    )
  );

drop policy if exists "gestor_equipe_compartilhada_write" on public.gestor_equipe_compartilhada;
create policy "gestor_equipe_compartilhada_write" on public.gestor_equipe_compartilhada
  for all using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
      and public.master_can_access_user(auth.uid(), gestor_base_id)
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
      and public.master_can_access_user(auth.uid(), gestor_base_id)
      and exists (
        select 1
        from public.users g
        join public.user_types utg on utg.id = g.user_type_id
        join public.users b on b.id = public.gestor_equipe_compartilhada.gestor_base_id
        join public.user_types utb on utb.id = b.user_type_id
        where g.id = public.gestor_equipe_compartilhada.gestor_id
          and g.company_id is not null
          and g.company_id = b.company_id
          and coalesce(g.uso_individual, false) = false
          and coalesce(b.uso_individual, false) = false
          and upper(coalesce(utg.name, '')) like '%GESTOR%'
          and upper(coalesce(utb.name, '')) like '%GESTOR%'
      )
    )
  );

-- Retorna ids de vendedores da equipe efetiva do gestor, considerando equipe compartilhada.
-- IMPORTANTE: security definer para uso em policies; valida permissão para evitar vazamento via RPC.
create or replace function public.gestor_equipe_vendedor_ids(uid uuid)
returns table (vendedor_id uuid)
language sql stable security definer
set search_path = public
as $$
  with recursive allowed as (
    select
      (
        uid = auth.uid()
        or is_admin(auth.uid())
        or (is_master(auth.uid()) and public.master_can_access_user(auth.uid(), uid))
      ) as ok
  ),
  recursive_links as (
    select l.gestor_id, l.gestor_base_id, array[l.gestor_id] as path
    from public.gestor_equipe_compartilhada l
    join allowed a on a.ok
    where l.gestor_id = uid
    union all
    select l2.gestor_id, l2.gestor_base_id, rl.path || l2.gestor_id
    from public.gestor_equipe_compartilhada l2
    join recursive_links rl on l2.gestor_id = rl.gestor_base_id
    where not (l2.gestor_id = any(rl.path))
      and array_length(rl.path, 1) < 10
  ),
  base as (
    select coalesce(
      (
        select rl.gestor_base_id
        from recursive_links rl
        order by array_length(rl.path, 1) desc
        limit 1
      ),
      uid
    ) as gestor_base_id
  )
  select distinct gv.vendedor_id as vendedor_id
  from public.gestor_vendedor gv
  join allowed a on a.ok
  join base b on true
  where gv.gestor_id = b.gestor_base_id
    and coalesce(gv.ativo, true) = true;
$$;
