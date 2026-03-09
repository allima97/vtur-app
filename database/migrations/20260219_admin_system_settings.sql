-- 2026-02-19: Configuracoes globais do sistema (modo manutencao)

create table if not exists public.admin_system_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  maintenance_enabled boolean not null default false,
  maintenance_message text null,
  updated_by uuid null references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists admin_system_settings_singleton_key
  on public.admin_system_settings (singleton);

alter table public.admin_system_settings enable row level security;

-- Leitura liberada (necessario para checar manutencao sem sessao)
drop policy if exists "admin_system_settings_select_all" on public.admin_system_settings;
create policy "admin_system_settings_select_all" on public.admin_system_settings
  for select using (true);

-- Escrita apenas para admins
drop policy if exists "admin_system_settings_admin_all" on public.admin_system_settings;
create policy "admin_system_settings_admin_all" on public.admin_system_settings
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create or replace function public.admin_system_settings_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_admin_system_settings_updated_at on public.admin_system_settings;
create trigger trg_admin_system_settings_updated_at
before update on public.admin_system_settings
for each row execute procedure public.admin_system_settings_set_updated_at();

insert into public.admin_system_settings (singleton, maintenance_enabled)
values (true, false)
on conflict (singleton) do nothing;
