-- 2026-03-12: corrige RLS de escalas para MASTER interno (company atual sem vinculo em master_empresas)
-- Evita erro 42501 ao inserir em public.escala_mes no modulo Escalas.

alter table public.escala_mes enable row level security;
alter table public.escala_dia enable row level security;
alter table public.feriados enable row level security;

drop policy if exists "escala_mes_select" on public.escala_mes;
create policy "escala_mes_select" on public.escala_mes
  for select using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
    or (is_gestor(auth.uid()) and gestor_id = public.gestor_equipe_base_id(auth.uid()))
  );

drop policy if exists "escala_mes_write" on public.escala_mes;
create policy "escala_mes_write" on public.escala_mes
  for all using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and (
        public.master_can_access_company(auth.uid(), company_id)
        or company_id = public.current_company_id()
      )
    )
    or (is_gestor(auth.uid()) and gestor_id = public.gestor_equipe_base_id(auth.uid()))
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
    or (
      is_gestor(auth.uid())
      and gestor_id = public.gestor_equipe_base_id(auth.uid())
      and company_id = public.current_company_id()
    )
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
          (is_gestor(auth.uid()) and em.gestor_id = public.gestor_equipe_base_id(auth.uid()))
          or (
            is_master(auth.uid())
            and (
              public.master_can_access_company(auth.uid(), em.company_id)
              or em.company_id = public.current_company_id()
            )
          )
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
          (is_gestor(auth.uid()) and em.gestor_id = public.gestor_equipe_base_id(auth.uid()))
          or (
            is_master(auth.uid())
            and (
              public.master_can_access_company(auth.uid(), em.company_id)
              or em.company_id = public.current_company_id()
            )
          )
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
          (is_gestor(auth.uid()) and em.gestor_id = public.gestor_equipe_base_id(auth.uid()))
          or (
            is_master(auth.uid())
            and (
              public.master_can_access_company(auth.uid(), em.company_id)
              or em.company_id = public.current_company_id()
            )
          )
        )
    )
  );

drop policy if exists "feriados_select" on public.feriados;
create policy "feriados_select" on public.feriados
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

drop policy if exists "feriados_write" on public.feriados;
create policy "feriados_write" on public.feriados
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
