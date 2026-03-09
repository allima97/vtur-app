-- 2026-02-17: RPC para retornar gestores de uma equipe compartilhada (base + gestores vinculados)

-- Retorna ids de gestores do grupo do gestor informado (inclui o gestor base e todos os gestores vinculados).
-- IMPORTANTE: security definer para uso no front; valida permissão para evitar vazamento via RPC.
create or replace function public.gestor_equipe_gestor_ids(uid uuid)
returns table (gestor_id uuid)
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
  ),
  tree as (
    select b.gestor_base_id as gestor_id, array[b.gestor_base_id] as path
    from base b
    union all
    select l.gestor_id, t.path || l.gestor_id
    from public.gestor_equipe_compartilhada l
    join tree t on l.gestor_base_id = t.gestor_id
    where not (l.gestor_id = any(t.path))
      and array_length(t.path, 1) < 50
  )
  select distinct t.gestor_id
  from tree t
  join allowed a on a.ok;
$$;

