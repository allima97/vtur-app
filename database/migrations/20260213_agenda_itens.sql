-- 2026-02-13: agenda (eventos + to-dos) - sem defaults com subquery

create extension if not exists "pgcrypto";

create table if not exists public.agenda_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  tipo text not null check (tipo in ('evento', 'todo')),
  titulo text not null,
  descricao text,
  start_date date,
  end_date date,
  all_day boolean default true,
  status text default 'aberto',
  done boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_agenda_itens_company on public.agenda_itens (company_id);
create index if not exists idx_agenda_itens_user on public.agenda_itens (user_id);
create index if not exists idx_agenda_itens_start on public.agenda_itens (start_date);

create or replace function public.agenda_itens_set_defaults()
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

drop trigger if exists trg_agenda_itens_defaults on public.agenda_itens;
create trigger trg_agenda_itens_defaults
before insert on public.agenda_itens
for each row execute procedure public.agenda_itens_set_defaults();

create or replace function public.agenda_itens_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agenda_itens_updated_at on public.agenda_itens;
create trigger trg_agenda_itens_updated_at
before update on public.agenda_itens
for each row execute procedure public.agenda_itens_set_updated_at();

alter table public.agenda_itens enable row level security;

create or replace function public.current_company_id()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims.company_id', true), '')::uuid,
    (select u.company_id from public.users u where u.id = auth.uid())
  );
$$;

drop policy if exists "agenda_itens_select" on public.agenda_itens;
create policy "agenda_itens_select" on public.agenda_itens
  for select using (
    auth.uid() is not null and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists "agenda_itens_insert" on public.agenda_itens;
create policy "agenda_itens_insert" on public.agenda_itens
  for insert with check (
    auth.uid() is not null
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists "agenda_itens_update" on public.agenda_itens;
create policy "agenda_itens_update" on public.agenda_itens
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

drop policy if exists "agenda_itens_delete" on public.agenda_itens;
create policy "agenda_itens_delete" on public.agenda_itens
  for delete using (
    auth.uid() is not null
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );
