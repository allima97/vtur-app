-- 2026-02-05: notas JSON por recibo (servicos inclusos, descricoes completas, etc)

create extension if not exists "pgcrypto";

create table if not exists public.vendas_recibos_notas (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  recibo_id uuid not null references public.vendas_recibos(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  notas jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_vendas_recibos_notas_un
  on public.vendas_recibos_notas (venda_id, recibo_id);

create index if not exists idx_vendas_recibos_notas_venda
  on public.vendas_recibos_notas (venda_id);

create index if not exists idx_vendas_recibos_notas_recibo
  on public.vendas_recibos_notas (recibo_id);

create index if not exists idx_vendas_recibos_notas_company
  on public.vendas_recibos_notas (company_id);

alter table public.vendas_recibos_notas enable row level security;

drop policy if exists "vendas_recibos_notas_select" on public.vendas_recibos_notas;
create policy "vendas_recibos_notas_select" on public.vendas_recibos_notas
  for select using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

drop policy if exists "vendas_recibos_notas_write" on public.vendas_recibos_notas;
create policy "vendas_recibos_notas_write" on public.vendas_recibos_notas
  for all using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
