-- 2026-02-11: convites de usuarios corporativos (master/gestor/admin)

create table if not exists public.user_convites (
  id uuid primary key default gen_random_uuid(),
  invited_user_id uuid references public.users(id) on delete set null,
  invited_email text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_type_id uuid references public.user_types(id),
  invited_by uuid not null references public.users(id) on delete cascade,
  invited_by_role text not null default 'GESTOR' check (
    upper(invited_by_role) in ('ADMIN', 'MASTER', 'GESTOR')
  ),
  status text not null default 'pending' check (
    lower(status) in ('pending', 'accepted', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists user_convites_company_status_idx
  on public.user_convites(company_id, status, created_at desc);

create index if not exists user_convites_invited_by_idx
  on public.user_convites(invited_by, status, created_at desc);

create unique index if not exists user_convites_pending_email_company_uidx
  on public.user_convites(lower(invited_email), company_id)
  where lower(status) = 'pending';

create or replace function public.user_profile_basico_completo(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.users u
    where u.id = uid
      and coalesce(trim(u.nome_completo), '') <> ''
      and coalesce(trim(u.telefone), '') <> ''
      and coalesce(trim(u.cidade), '') <> ''
      and coalesce(trim(u.estado), '') <> ''
      and u.uso_individual is not null
  );
$$;

create or replace function public.sync_user_convites_status()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.user_profile_basico_completo(new.id) then
    update public.user_convites
       set status = 'accepted',
           accepted_at = coalesce(accepted_at, now())
     where invited_user_id = new.id
       and lower(status) = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_convites_status on public.users;
create trigger trg_sync_user_convites_status
after insert or update of nome_completo, telefone, cidade, estado, uso_individual
on public.users
for each row
execute function public.sync_user_convites_status();

alter table public.user_convites enable row level security;

drop policy if exists "user_convites_select" on public.user_convites;
create policy "user_convites_select" on public.user_convites
for select using (
  is_admin(auth.uid())
  or invited_by = auth.uid()
  or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  or (is_gestor(auth.uid()) and company_id = public.current_company_id())
);

drop policy if exists "user_convites_insert" on public.user_convites;
create policy "user_convites_insert" on public.user_convites
for insert with check (
  is_admin(auth.uid())
  or (
    invited_by = auth.uid()
    and (
      (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      or (is_gestor(auth.uid()) and company_id = public.current_company_id())
    )
  )
);

drop policy if exists "user_convites_update" on public.user_convites;
create policy "user_convites_update" on public.user_convites
for update using (
  is_admin(auth.uid())
  or invited_by = auth.uid()
)
with check (
  is_admin(auth.uid())
  or invited_by = auth.uid()
);

