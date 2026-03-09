-- 2026-03-04: Persistência de preferências do Menu (ordem/ocultos/seção)

create table if not exists public.menu_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_menu_prefs_updated_at
  on public.menu_prefs(updated_at desc);

alter table public.menu_prefs enable row level security;

-- Somente o próprio usuário (ou admin do sistema) pode ler/escrever.

drop policy if exists "menu_prefs_select" on public.menu_prefs;
create policy "menu_prefs_select" on public.menu_prefs
  for select using (
    is_admin(auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "menu_prefs_insert" on public.menu_prefs;
create policy "menu_prefs_insert" on public.menu_prefs
  for insert with check (
    auth.uid() is not null
    and (is_admin(auth.uid()) or user_id = auth.uid())
  );

drop policy if exists "menu_prefs_update" on public.menu_prefs;
create policy "menu_prefs_update" on public.menu_prefs
  for update using (
    is_admin(auth.uid())
    or user_id = auth.uid()
  )
  with check (
    is_admin(auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "menu_prefs_delete" on public.menu_prefs;
create policy "menu_prefs_delete" on public.menu_prefs
  for delete using (
    is_admin(auth.uid())
    or user_id = auth.uid()
  );
