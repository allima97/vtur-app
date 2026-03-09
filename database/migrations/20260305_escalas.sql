-- 2026-03-05: Escalas (gestor/master) e feriados customizados

create table if not exists public.escala_mes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gestor_id uuid not null references public.users(id) on delete cascade,
  periodo date not null,
  status text not null default 'rascunho',
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists escala_mes_unique
  on public.escala_mes(company_id, gestor_id, periodo);
create index if not exists escala_mes_company_idx on public.escala_mes(company_id);
create index if not exists escala_mes_gestor_idx on public.escala_mes(gestor_id);

create table if not exists public.escala_dia (
  id uuid primary key default gen_random_uuid(),
  escala_mes_id uuid not null references public.escala_mes(id) on delete cascade,
  usuario_id uuid not null references public.users(id) on delete cascade,
  data date not null,
  tipo text not null,
  hora_inicio time null,
  hora_fim time null,
  observacao text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escala_mes_id, usuario_id, data)
);

create index if not exists escala_dia_mes_idx on public.escala_dia(escala_mes_id);
create index if not exists escala_dia_usuario_idx on public.escala_dia(usuario_id);
create index if not exists escala_dia_data_idx on public.escala_dia(data);

create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  data date not null,
  nome text not null,
  tipo text not null,
  estado text null,
  cidade text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, data, nome)
);

create index if not exists feriados_company_idx on public.feriados(company_id);
create index if not exists feriados_data_idx on public.feriados(data);

alter table public.escala_mes enable row level security;
alter table public.escala_dia enable row level security;
alter table public.feriados enable row level security;

drop policy if exists "escala_mes_select" on public.escala_mes;
create policy "escala_mes_select" on public.escala_mes
  for select using (
    is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (is_gestor(auth.uid()) and gestor_id = auth.uid())
  );

drop policy if exists "escala_mes_write" on public.escala_mes;
create policy "escala_mes_write" on public.escala_mes
  for all using (
    is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (is_gestor(auth.uid()) and gestor_id = auth.uid())
  )
  with check (
    is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (is_gestor(auth.uid()) and gestor_id = auth.uid() and company_id = public.current_company_id())
  );

drop policy if exists "escala_dia_select" on public.escala_dia;
create policy "escala_dia_select" on public.escala_dia
  for select using (
    is_admin(auth.uid())
    or usuario_id = auth.uid()
    or exists (
      select 1
      from public.escala_mes em
      where em.id = escala_dia.escala_mes_id
        and (
          (is_gestor(auth.uid()) and em.gestor_id = auth.uid())
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), em.company_id))
        )
    )
  );

drop policy if exists "escala_dia_write" on public.escala_dia;
create policy "escala_dia_write" on public.escala_dia
  for all using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.escala_mes em
      where em.id = escala_dia.escala_mes_id
        and (
          (is_gestor(auth.uid()) and em.gestor_id = auth.uid())
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), em.company_id))
        )
    )
  )
  with check (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.escala_mes em
      where em.id = escala_dia.escala_mes_id
        and (
          (is_gestor(auth.uid()) and em.gestor_id = auth.uid())
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), em.company_id))
        )
    )
  );

drop policy if exists "feriados_select" on public.feriados;
create policy "feriados_select" on public.feriados
  for select using (
    is_admin(auth.uid())
    or company_id = public.current_company_id()
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

drop policy if exists "feriados_write" on public.feriados;
create policy "feriados_write" on public.feriados
  for all using (
    is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (is_gestor(auth.uid()) and company_id = public.current_company_id())
  )
  with check (
    is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (is_gestor(auth.uid()) and company_id = public.current_company_id())
  );
