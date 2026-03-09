-- 2026-03-12: corrige RLS de escala_horario_usuario para MASTER interno
-- Evita 42501 ao salvar horarios da equipe quando o MASTER opera na propria company.

alter table public.escala_horario_usuario enable row level security;

drop policy if exists "escala_horario_usuario_select" on public.escala_horario_usuario;
create policy "escala_horario_usuario_select" on public.escala_horario_usuario
  for select using (
    is_admin(auth.uid())
    or company_id = public.current_company_id()
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
  );

drop policy if exists "escala_horario_usuario_write" on public.escala_horario_usuario;
create policy "escala_horario_usuario_write" on public.escala_horario_usuario
  for all using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
    or (is_gestor(auth.uid()) and company_id = public.current_company_id())
  )
  with check (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
    or (is_gestor(auth.uid()) and company_id = public.current_company_id())
  );
