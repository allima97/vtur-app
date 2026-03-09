-- 2026-02-06: global criteria for non-commissionable payment forms

create table if not exists public.parametros_pagamentos_nao_comissionaveis (
  id uuid primary key default gen_random_uuid(),
  termo text not null,
  termo_normalizado text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

create unique index if not exists parametros_pagamentos_nao_comissionaveis_termo_uidx
  on public.parametros_pagamentos_nao_comissionaveis (termo_normalizado);

alter table public.parametros_pagamentos_nao_comissionaveis enable row level security;

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

drop policy if exists "nao_comissionaveis_select" on public.parametros_pagamentos_nao_comissionaveis;
create policy "nao_comissionaveis_select"
on public.parametros_pagamentos_nao_comissionaveis
for select
using (auth.uid() is not null);

drop policy if exists "nao_comissionaveis_insert" on public.parametros_pagamentos_nao_comissionaveis;
create policy "nao_comissionaveis_insert"
on public.parametros_pagamentos_nao_comissionaveis
for insert
with check (public.is_admin_user());

drop policy if exists "nao_comissionaveis_update" on public.parametros_pagamentos_nao_comissionaveis;
create policy "nao_comissionaveis_update"
on public.parametros_pagamentos_nao_comissionaveis
for update
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "nao_comissionaveis_delete" on public.parametros_pagamentos_nao_comissionaveis;
create policy "nao_comissionaveis_delete"
on public.parametros_pagamentos_nao_comissionaveis
for delete
using (public.is_admin_user());

insert into public.parametros_pagamentos_nao_comissionaveis
  (termo, termo_normalizado, ativo)
values
  ('Credito diversos', 'credito diversos', true),
  ('Credipax', 'credipax', true),
  ('Credito pax', 'credito pax', true),
  ('Credito passageiro', 'credito passageiro', true),
  ('Credito de viagem', 'credito de viagem', true),
  ('Vale viagem', 'vale viagem', true),
  ('Carta de credito', 'carta de credito', true),
  ('Credito', 'credito', true)
on conflict (termo_normalizado) do nothing;
