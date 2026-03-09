-- 2026-02-23: allow ensure_user_profile trigger to insert despite RLS policies

create or replace function public.ensure_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Temporarily disable row-level security so this trigger can seed a profile even when running
  -- under the anon/service roles that power sign-up requests.
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
