-- 2026-02-11: categorias e prioridades para To Do

create extension if not exists "pgcrypto";

create table if not exists public.todo_categorias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  nome text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_todo_categorias_company on public.todo_categorias (company_id);
create index if not exists idx_todo_categorias_user on public.todo_categorias (user_id);

create or replace function public.todo_categorias_set_defaults()
returns trigger
language plpgsql
as $$
declare
  v_company uuid;
begin
  select coalesce(
    nullif(current_setting('request.jwt.claims.company_id', true), '')::uuid,
    (select u.company_id from public.users u where u.id = auth.uid())
  ) into v_company;

  if new.company_id is null then
    new.company_id := v_company;
  end if;
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.created_at is null then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_todo_categorias_defaults on public.todo_categorias;
create trigger trg_todo_categorias_defaults
before insert on public.todo_categorias
for each row execute procedure public.todo_categorias_set_defaults();

create or replace function public.todo_categorias_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_todo_categorias_updated_at on public.todo_categorias;
create trigger trg_todo_categorias_updated_at
before update on public.todo_categorias
for each row execute procedure public.todo_categorias_set_updated_at();

alter table public.todo_categorias enable row level security;

-- usa mesma helper de company_id da agenda
create or replace function public.current_company_id()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims.company_id', true), '')::uuid,
    (select u.company_id from public.users u where u.id = auth.uid())
  );
$$;

drop policy if exists "todo_categorias_select" on public.todo_categorias;
create policy "todo_categorias_select" on public.todo_categorias
  for select using (
    auth.uid() is not null and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists "todo_categorias_insert" on public.todo_categorias;
create policy "todo_categorias_insert" on public.todo_categorias
  for insert with check (
    auth.uid() is not null
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists "todo_categorias_update" on public.todo_categorias;
create policy "todo_categorias_update" on public.todo_categorias
  for update using (
    auth.uid() is not null
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  )
  with check (
    auth.uid() is not null
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists "todo_categorias_delete" on public.todo_categorias;
create policy "todo_categorias_delete" on public.todo_categorias
  for delete using (
    auth.uid() is not null
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

-- adiciona categoria, prioridade e cor ao To Do
alter table public.agenda_itens
  add column if not exists categoria_id uuid references public.todo_categorias(id) on delete set null,
  add column if not exists prioridade text check (prioridade in ('alta','media','baixa')),
  add column if not exists cor text;

create index if not exists idx_agenda_itens_categoria on public.agenda_itens (categoria_id);
create index if not exists idx_agenda_itens_prioridade on public.agenda_itens (prioridade);
