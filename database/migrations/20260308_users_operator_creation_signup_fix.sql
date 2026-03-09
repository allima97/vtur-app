-- 2026-03-08: corrige criacao de usuario por operador e signup publico
-- 1) garante trigger de perfil minimo com row_security=off
-- 2) permite update do perfil placeholder (company_id/user_type_id nulos) por master/gestor,
--    mantendo o WITH CHECK corporativo restritivo.

create or replace function public.ensure_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  insert into public.users (
    id,
    email,
    nome_completo,
    uso_individual,
    company_id,
    user_type_id,
    active,
    created_by_gestor,
    created_at,
    updated_at
  )
  values (
    new.id,
    lower(new.email),
    null,
    true,
    null,
    null,
    true,
    false,
    timezone('UTC', now()),
    timezone('UTC', now())
  )
  on conflict (id) do update
    set
      email = excluded.email,
      updated_at = timezone('UTC', now()),
      active = coalesce(users.active, excluded.active, true),
      uso_individual = coalesce(users.uso_individual, excluded.uso_individual, true);

  return new;
end;
$$;

drop trigger if exists trg_ensure_user_profile on auth.users;
create trigger trg_ensure_user_profile
  after insert on auth.users
  for each row
  execute function public.ensure_user_profile();

alter table public.users enable row level security;

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
          and public.master_can_access_company(auth.uid(), users.company_id)
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
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and coalesce(uso_individual, false) = false
      and public.master_can_access_company(auth.uid(), company_id)
      and not public.is_admin_user_type(user_type_id)
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

