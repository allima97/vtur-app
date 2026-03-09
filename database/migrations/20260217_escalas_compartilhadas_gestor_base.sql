-- 2026-02-17: Escalas compartilhadas entre gestores da mesma equipe (usa gestor_base_id)
-- Objetivo: quando um gestor compartilha a equipe via gestor_equipe_compartilhada,
-- a escala (escala_mes/escala_dia) deve ser única (no gestor base) e refletir para todos.

-- Retorna o gestor base final do gestor informado (considera cadeia de compartilhamento).
-- IMPORTANTE: security definer para uso no front e em policies.
create or replace function public.gestor_equipe_base_id(uid uuid)
returns uuid
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
  )
  select coalesce(
    (
      select rl.gestor_base_id
      from recursive_links rl
      order by array_length(rl.path, 1) desc
      limit 1
    ),
    uid
  )
  from allowed a
  where a.ok;
$$;

alter table public.escala_mes enable row level security;
alter table public.escala_dia enable row level security;
alter table public.feriados enable row level security;

drop policy if exists "escala_mes_select" on public.escala_mes;
create policy "escala_mes_select" on public.escala_mes
  for select using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
    or (is_gestor(auth.uid()) and gestor_id = public.gestor_equipe_base_id(auth.uid()))
  );

drop policy if exists "escala_mes_write" on public.escala_mes;
create policy "escala_mes_write" on public.escala_mes
  for all using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
    or (is_gestor(auth.uid()) and gestor_id = public.gestor_equipe_base_id(auth.uid()))
  )
  with check (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
    or (
      is_gestor(auth.uid())
      and gestor_id = public.gestor_equipe_base_id(auth.uid())
      and company_id = public.current_company_id()
    )
  );

drop policy if exists "escala_dia_select" on public.escala_dia;
create policy "escala_dia_select" on public.escala_dia
  for select using (
    is_admin(auth.uid())
    or usuario_id = auth.uid()
    or exists (
      select 1
      from public.escala_mes em
      where em.id = escala_dia.escala_mes_id
        and (
          (is_gestor(auth.uid()) and em.gestor_id = public.gestor_equipe_base_id(auth.uid()))
          or (
            is_master(auth.uid())
            and (
              public.master_can_access_company(auth.uid(), em.company_id)
              or em.company_id = public.current_company_id()
            )
          )
        )
    )
  );

drop policy if exists "escala_dia_write" on public.escala_dia;
create policy "escala_dia_write" on public.escala_dia
  for all using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.escala_mes em
      where em.id = escala_dia.escala_mes_id
        and (
          (is_gestor(auth.uid()) and em.gestor_id = public.gestor_equipe_base_id(auth.uid()))
          or (
            is_master(auth.uid())
            and (
              public.master_can_access_company(auth.uid(), em.company_id)
              or em.company_id = public.current_company_id()
            )
          )
        )
    )
  )
  with check (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.escala_mes em
      where em.id = escala_dia.escala_mes_id
        and (
          (is_gestor(auth.uid()) and em.gestor_id = public.gestor_equipe_base_id(auth.uid()))
          or (
            is_master(auth.uid())
            and (
              public.master_can_access_company(auth.uid(), em.company_id)
              or em.company_id = public.current_company_id()
            )
          )
        )
    )
  );

