-- 2026-03-12: permissoes padrao por tipo de usuario

create extension if not exists "pgcrypto";

create table if not exists public.user_type_default_perms (
  id uuid primary key default gen_random_uuid(),
  user_type_id uuid not null references public.user_types(id) on delete cascade,
  modulo text not null,
  permissao text not null default 'none' check (lower(permissao) in ('none','view','create','edit','delete','admin')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_type_default_perms_user_modulo_uidx
  on public.user_type_default_perms(user_type_id, modulo);

create index if not exists user_type_default_perms_user_type_idx
  on public.user_type_default_perms(user_type_id);

create or replace function public.user_type_default_perms_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_type_default_perms_updated_at on public.user_type_default_perms;
create trigger trg_user_type_default_perms_updated_at
before update on public.user_type_default_perms
for each row execute procedure public.user_type_default_perms_set_updated_at();

alter table public.user_type_default_perms enable row level security;

drop policy if exists "user_type_default_perms_select" on public.user_type_default_perms;
create policy "user_type_default_perms_select" on public.user_type_default_perms
  for select using (is_admin(auth.uid()));

drop policy if exists "user_type_default_perms_insert" on public.user_type_default_perms;
create policy "user_type_default_perms_insert" on public.user_type_default_perms
  for insert with check (is_admin(auth.uid()));

drop policy if exists "user_type_default_perms_update" on public.user_type_default_perms;
create policy "user_type_default_perms_update" on public.user_type_default_perms
  for update using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "user_type_default_perms_delete" on public.user_type_default_perms;
create policy "user_type_default_perms_delete" on public.user_type_default_perms
  for delete using (is_admin(auth.uid()));

-- Aplica defaults do tipo ao criar/atualizar um usuario
create or replace function public.ensure_default_perms_user_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_type_id uuid;
begin
  perform set_config('row_security', 'off', true);

  v_user_type_id := new.user_type_id;

  -- Compat: self-signup sem user_type vira VENDEDOR (se existir)
  if v_user_type_id is null and coalesce(new.created_by_gestor, false) = false then
    select t.id
      into v_user_type_id
      from public.user_types t
     where upper(coalesce(t.name, '')) like '%VENDEDOR%'
     order by t.created_at asc
     limit 1;
  end if;

  if v_user_type_id is null then
    return new;
  end if;

  insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
  select new.id, d.modulo, d.permissao, (coalesce(d.ativo, true) and lower(coalesce(d.permissao, 'none')) <> 'none')
    from public.user_type_default_perms d
   where d.user_type_id = v_user_type_id
     and coalesce(d.ativo, true) = true
     and lower(coalesce(d.permissao, 'none')) <> 'none'
     and not exists (
       select 1
         from public.modulo_acesso ma
        where ma.usuario_id = new.id
          and lower(ma.modulo) = lower(d.modulo)
     );

  return new;
end;
$$;

drop trigger if exists trg_default_perms_vendedor on public.users;
drop trigger if exists trg_default_perms_user_type on public.users;
create trigger trg_default_perms_user_type
after insert or update of user_type_id, created_by_gestor on public.users
for each row execute function public.ensure_default_perms_user_type();

-- user_types: leitura liberada para autenticados, escrita apenas ADMIN
alter table public.user_types enable row level security;

drop policy if exists "user_types_select" on public.user_types;
create policy "user_types_select" on public.user_types
  for select using (
    auth.uid() is not null
  );

drop policy if exists "user_types_insert" on public.user_types;
create policy "user_types_insert" on public.user_types
  for insert with check (
    is_admin(auth.uid())
  );

drop policy if exists "user_types_update" on public.user_types;
create policy "user_types_update" on public.user_types
  for update using (
    is_admin(auth.uid())
  )
  with check (
    is_admin(auth.uid())
  );

drop policy if exists "user_types_delete" on public.user_types;
create policy "user_types_delete" on public.user_types
  for delete using (
    is_admin(auth.uid())
  );

-- Seed: VENDEDOR (mantem comportamento atual)
insert into public.user_type_default_perms (user_type_id, modulo, permissao, ativo)
select t.id, m.modulo, 'delete', true
from public.user_types t
cross join (
  values
    ('Dashboard'),
    ('Vendas'),
    ('Clientes'),
    ('Produtos'),
    ('Consultoria'),
    ('Consultoria Online')
) as m(modulo)
where upper(coalesce(t.name, '')) like '%VENDEDOR%'
  and not exists (
    select 1
    from public.user_type_default_perms d
    where d.user_type_id = t.id
      and d.modulo = m.modulo
  );
