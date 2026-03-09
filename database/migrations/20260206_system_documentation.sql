-- 2026-02-06: documentação do sistema (global) + versionamento

create table if not exists public.system_documentation (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  markdown text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

alter table public.system_documentation enable row level security;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin_user_type(u.user_type_id), false)
  from public.users u
  where u.id = auth.uid();
$$;

drop policy if exists "docs_select" on public.system_documentation;
create policy "docs_select"
on public.system_documentation
for select
using (auth.uid() is not null);

drop policy if exists "docs_insert" on public.system_documentation;
create policy "docs_insert"
on public.system_documentation
for insert
with check (public.is_admin_user());

drop policy if exists "docs_update" on public.system_documentation;
create policy "docs_update"
on public.system_documentation
for update
using (public.is_admin_user());

drop policy if exists "docs_delete" on public.system_documentation;
create policy "docs_delete"
on public.system_documentation
for delete
using (public.is_admin_user());

create table if not exists public.system_documentation_versions (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.system_documentation(id) on delete cascade,
  slug text not null,
  markdown text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

alter table public.system_documentation_versions enable row level security;

drop policy if exists "docs_versions_select" on public.system_documentation_versions;
create policy "docs_versions_select"
on public.system_documentation_versions
for select
using (auth.uid() is not null);

drop policy if exists "docs_versions_insert" on public.system_documentation_versions;
create policy "docs_versions_insert"
on public.system_documentation_versions
for insert
with check (public.is_admin_user());

create or replace function public.log_system_documentation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    insert into public.system_documentation_versions
      (doc_id, slug, markdown, action, created_by, created_at)
    values
      (old.id, old.slug, old.markdown, 'DELETE', old.updated_by, now());
    return old;
  end if;

  insert into public.system_documentation_versions
    (doc_id, slug, markdown, action, created_by, created_at)
  values
    (new.id, new.slug, new.markdown, tg_op, new.updated_by, now());
  return new;
end;
$$;

drop trigger if exists trg_system_documentation_log on public.system_documentation;
create trigger trg_system_documentation_log
after insert or update or delete on public.system_documentation
for each row execute function public.log_system_documentation_change();
