-- Horários padrão por usuário para auto preenchimento de escala
create table if not exists public.escala_horario_usuario (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  usuario_id uuid not null references public.users(id) on delete cascade,
  seg_inicio time null,
  seg_fim time null,
  ter_inicio time null,
  ter_fim time null,
  qua_inicio time null,
  qua_fim time null,
  qui_inicio time null,
  qui_fim time null,
  sex_inicio time null,
  sex_fim time null,
  sab_inicio time null,
  sab_fim time null,
  dom_inicio time null,
  dom_fim time null,
  feriado_inicio time null,
  feriado_fim time null,
  auto_aplicar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id)
);

create index if not exists idx_escala_horario_usuario_company
  on public.escala_horario_usuario (company_id);

alter table public.escala_horario_usuario enable row level security;

drop policy if exists "escala_horario_usuario_select" on public.escala_horario_usuario;
create policy "escala_horario_usuario_select" on public.escala_horario_usuario
  for select using (
    is_admin(auth.uid())
    or company_id = public.current_company_id()
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

drop policy if exists "escala_horario_usuario_write" on public.escala_horario_usuario;
create policy "escala_horario_usuario_write" on public.escala_horario_usuario
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
