-- Migração: ajustar RLS do roteiro_dia para permitir escrita no escopo correto
-- Motivo: o save usa upsert por (roteiro_id, ordem). Se existirem linhas antigas do mesmo roteiro
-- criadas por outro usuário, a policy anterior (created_by = auth.uid()) bloqueia update/delete.
-- A correção permite escrita quando o usuário tem permissão sobre o roteiro pai (dono/admin/master),
-- mantendo dias avulsos (company_id null) como privados do criador.
-- Data: 2026-03-03

alter table public.roteiro_dia enable row level security;

-- Mantém SELECT como já estava (visibilidade por empresa ou itens pessoais)
drop policy if exists roteiro_dia_select on public.roteiro_dia;
create policy roteiro_dia_select on public.roteiro_dia for select
  using (
    company_id = public.current_company_id()
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (company_id is null and created_by = auth.uid())
  );

-- INSERT: permite inserir no escopo da empresa do usuário (ou pessoal)
drop policy if exists roteiro_dia_insert on public.roteiro_dia;
create policy roteiro_dia_insert on public.roteiro_dia for insert
  with check (
    created_by = auth.uid()
    and (
      company_id is null
      or company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
    and (
      roteiro_id is null
      or exists (
        select 1
        from public.roteiro_personalizado r
        where r.id = roteiro_id
          and (
            r.created_by = auth.uid()
            or (is_admin(auth.uid()) and r.company_id = public.current_company_id())
            or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
          )
      )
    )
  );

-- UPDATE/DELETE: permite operar se o usuário puder editar o roteiro pai.
-- Para dias avulsos, mantém a privacidade (só o criador).
drop policy if exists roteiro_dia_update on public.roteiro_dia;
create policy roteiro_dia_update on public.roteiro_dia for update
  using (
    (company_id is null and created_by = auth.uid())
    or (
      roteiro_id is null
      and company_id is not null
      and (
        (created_by = auth.uid() and company_id = public.current_company_id())
        or (is_admin(auth.uid()) and company_id = public.current_company_id())
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
    or exists (
      select 1
      from public.roteiro_personalizado r
      where r.id = roteiro_id
        and (
          r.created_by = auth.uid()
          or (is_admin(auth.uid()) and r.company_id = public.current_company_id())
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
        )
    )
  )
  with check (
    (company_id is null and created_by = auth.uid())
    or (
      roteiro_id is null
      and company_id is not null
      and (
        (created_by = auth.uid() and company_id = public.current_company_id())
        or (is_admin(auth.uid()) and company_id = public.current_company_id())
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
    or exists (
      select 1
      from public.roteiro_personalizado r
      where r.id = roteiro_id
        and (
          r.created_by = auth.uid()
          or (is_admin(auth.uid()) and r.company_id = public.current_company_id())
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
        )
    )
  );

drop policy if exists roteiro_dia_delete on public.roteiro_dia;
create policy roteiro_dia_delete on public.roteiro_dia for delete
  using (
    (company_id is null and created_by = auth.uid())
    or (
      roteiro_id is null
      and company_id is not null
      and (
        (created_by = auth.uid() and company_id = public.current_company_id())
        or (is_admin(auth.uid()) and company_id = public.current_company_id())
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
    or exists (
      select 1
      from public.roteiro_personalizado r
      where r.id = roteiro_id
        and (
          r.created_by = auth.uid()
          or (is_admin(auth.uid()) and r.company_id = public.current_company_id())
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
        )
    )
  );
