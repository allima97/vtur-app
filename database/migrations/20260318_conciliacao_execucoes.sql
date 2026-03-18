create table if not exists public.conciliacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor text not null default 'cron',
  actor_user_id uuid references public.users(id) on delete set null,
  checked integer not null default 0,
  reconciled integer not null default 0,
  updated_taxes integer not null default 0,
  still_pending integer not null default 0,
  status text not null default 'ok',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists conciliacao_execucoes_company_created_idx
  on public.conciliacao_execucoes(company_id, created_at desc);

create index if not exists conciliacao_execucoes_actor_created_idx
  on public.conciliacao_execucoes(actor, created_at desc);

alter table public.conciliacao_execucoes enable row level security;

drop policy if exists "conciliacao_execucoes_select" on public.conciliacao_execucoes;
create policy "conciliacao_execucoes_select" on public.conciliacao_execucoes
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

drop policy if exists "conciliacao_execucoes_insert" on public.conciliacao_execucoes;
create policy "conciliacao_execucoes_insert" on public.conciliacao_execucoes
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
