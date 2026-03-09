-- Cria tabelas para Controle de SAC
create table if not exists public.sac_controle (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  recibo text,
  tour text,
  data_solicitacao date,
  motivo text,
  contratante_pax text,
  ok_quando text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sac_controle_company on public.sac_controle (company_id);
create index if not exists idx_sac_controle_data on public.sac_controle (data_solicitacao);

create table if not exists public.sac_interacoes (
  id uuid primary key default gen_random_uuid(),
  sac_id uuid not null references public.sac_controle(id) on delete cascade,
  data_interacao date,
  descricao text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_sac_interacoes_sac on public.sac_interacoes (sac_id);

-- RLS
alter table public.sac_controle enable row level security;
drop policy if exists "sac_controle_select" on public.sac_controle;
create policy "sac_controle_select" on public.sac_controle
  for select using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
  );
drop policy if exists "sac_controle_write" on public.sac_controle;
create policy "sac_controle_write" on public.sac_controle
  for all using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
  );

alter table public.sac_interacoes enable row level security;
drop policy if exists "sac_interacoes_select" on public.sac_interacoes;
create policy "sac_interacoes_select" on public.sac_interacoes
  for select using (
    exists (
      select 1 from public.sac_controle s
      where s.id = sac_id
        and (
          is_admin(auth.uid())
          or s.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                     (select u.company_id from public.users u where u.id = auth.uid()))
        )
    )
  );
drop policy if exists "sac_interacoes_write" on public.sac_interacoes;
create policy "sac_interacoes_write" on public.sac_interacoes
  for all using (
    exists (
      select 1 from public.sac_controle s
      where s.id = sac_id
        and (
          is_admin(auth.uid())
          or s.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                     (select u.company_id from public.users u where u.id = auth.uid()))
        )
    )
  );
