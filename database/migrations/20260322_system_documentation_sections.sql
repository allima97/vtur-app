-- 2026-03-22: documentação estruturada por seção/módulo

create table if not exists public.system_documentation_sections (
  id uuid primary key default gen_random_uuid(),
  slug text not null default 'vtur',
  role_scope text not null default 'all' check (role_scope in ('all', 'vendedor', 'gestor', 'master', 'admin')),
  module_key text not null,
  route_pattern text,
  title text not null,
  summary text,
  content_markdown text not null,
  tone text not null default 'info' check (tone in ('default', 'info', 'config', 'teal', 'green')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),
  constraint system_documentation_sections_slug_role_module_key
    unique (slug, role_scope, module_key)
);

create index if not exists idx_system_documentation_sections_slug_sort
  on public.system_documentation_sections (slug, role_scope, sort_order, title);

create index if not exists idx_system_documentation_sections_route_pattern
  on public.system_documentation_sections (route_pattern);

alter table public.system_documentation_sections enable row level security;

drop policy if exists "docs_sections_select" on public.system_documentation_sections;
create policy "docs_sections_select"
on public.system_documentation_sections
for select
using (auth.uid() is not null);

drop policy if exists "docs_sections_insert" on public.system_documentation_sections;
create policy "docs_sections_insert"
on public.system_documentation_sections
for insert
with check (public.is_admin_user());

drop policy if exists "docs_sections_update" on public.system_documentation_sections;
create policy "docs_sections_update"
on public.system_documentation_sections
for update
using (public.is_admin_user());

drop policy if exists "docs_sections_delete" on public.system_documentation_sections;
create policy "docs_sections_delete"
on public.system_documentation_sections
for delete
using (public.is_admin_user());

create table if not exists public.system_documentation_section_versions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.system_documentation_sections(id) on delete cascade,
  slug text not null,
  role_scope text not null,
  module_key text not null,
  route_pattern text,
  title text not null,
  summary text,
  content_markdown text not null,
  tone text not null,
  sort_order integer not null,
  is_active boolean not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

create index if not exists idx_system_documentation_section_versions_section
  on public.system_documentation_section_versions (section_id, created_at desc);

alter table public.system_documentation_section_versions enable row level security;

drop policy if exists "docs_section_versions_select" on public.system_documentation_section_versions;
create policy "docs_section_versions_select"
on public.system_documentation_section_versions
for select
using (auth.uid() is not null);

drop policy if exists "docs_section_versions_insert" on public.system_documentation_section_versions;
create policy "docs_section_versions_insert"
on public.system_documentation_section_versions
for insert
with check (public.is_admin_user());

create or replace function public.log_system_documentation_section_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    insert into public.system_documentation_section_versions
      (section_id, slug, role_scope, module_key, route_pattern, title, summary, content_markdown, tone, sort_order, is_active, action, created_by, created_at)
    values
      (old.id, old.slug, old.role_scope, old.module_key, old.route_pattern, old.title, old.summary, old.content_markdown, old.tone, old.sort_order, old.is_active, 'DELETE', old.updated_by, now());
    return old;
  end if;

  insert into public.system_documentation_section_versions
    (section_id, slug, role_scope, module_key, route_pattern, title, summary, content_markdown, tone, sort_order, is_active, action, created_by, created_at)
  values
    (new.id, new.slug, new.role_scope, new.module_key, new.route_pattern, new.title, new.summary, new.content_markdown, new.tone, new.sort_order, new.is_active, tg_op, new.updated_by, now());
  return new;
end;
$$;

drop trigger if exists trg_system_documentation_section_log on public.system_documentation_sections;
create trigger trg_system_documentation_section_log
after insert or update or delete on public.system_documentation_sections
for each row execute function public.log_system_documentation_section_change();
