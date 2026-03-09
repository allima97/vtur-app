-- 2026-03-18: Auditoria e reversão (Conciliação)

create extension if not exists "pgcrypto";

create table if not exists public.conciliacao_recibo_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conciliacao_recibo_id uuid references public.conciliacao_recibos(id) on delete set null,
  venda_id uuid references public.vendas(id) on delete set null,
  venda_recibo_id uuid references public.vendas_recibos(id) on delete set null,
  numero_recibo text,

  field text not null default 'valor_taxas',
  old_value numeric,
  new_value numeric,

  actor text not null default 'cron',
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),

  reverted_at timestamptz,
  reverted_by uuid references public.users(id) on delete set null,
  revert_reason text
);

create index if not exists conciliacao_changes_company_changed_at_idx
  on public.conciliacao_recibo_changes(company_id, changed_at desc);

create index if not exists conciliacao_changes_company_reverted_idx
  on public.conciliacao_recibo_changes(company_id, reverted_at);

create index if not exists conciliacao_changes_venda_recibo_idx
  on public.conciliacao_recibo_changes(venda_recibo_id);

alter table public.conciliacao_recibo_changes enable row level security;

-- SELECT
drop policy if exists "conciliacao_changes_select" on public.conciliacao_recibo_changes;
create policy "conciliacao_changes_select" on public.conciliacao_recibo_changes
  for select using (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  );

-- INSERT
drop policy if exists "conciliacao_changes_insert" on public.conciliacao_recibo_changes;
create policy "conciliacao_changes_insert" on public.conciliacao_recibo_changes
  for insert with check (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  );

-- UPDATE (marcar revertido)
drop policy if exists "conciliacao_changes_update" on public.conciliacao_recibo_changes;
create policy "conciliacao_changes_update" on public.conciliacao_recibo_changes
  for update using (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  );
