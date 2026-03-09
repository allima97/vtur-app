-- 2026-03-12: restaura escopo MASTER em gestor_vendedor sem remover regras de gestor/admin
-- Corrige erro 42501 ao montar equipes no modulo Master Usuarios.

alter table public.gestor_vendedor enable row level security;

drop policy if exists "gestor_vendedor_select" on public.gestor_vendedor;
create policy "gestor_vendedor_select" on public.gestor_vendedor
  for select using (
    is_admin(auth.uid())
    or gestor_id = auth.uid()
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
    )
  );

drop policy if exists "gestor_vendedor_insert" on public.gestor_vendedor;
create policy "gestor_vendedor_insert" on public.gestor_vendedor
  for insert with check (
    is_admin(auth.uid())
    or (
      gestor_id = auth.uid()
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = public.gestor_vendedor.vendedor_id
          and u.company_id = public.current_company_id()
          and coalesce(u.uso_individual, false) = false
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
      and public.master_can_access_user(auth.uid(), vendedor_id)
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = public.gestor_vendedor.gestor_id
          and upper(coalesce(ut.name, '')) like '%GESTOR%'
      )
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = public.gestor_vendedor.vendedor_id
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

drop policy if exists "gestor_vendedor_update" on public.gestor_vendedor;
create policy "gestor_vendedor_update" on public.gestor_vendedor
  for update using (
    is_admin(auth.uid())
    or gestor_id = auth.uid()
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
      and public.master_can_access_user(auth.uid(), vendedor_id)
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      gestor_id = auth.uid()
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = public.gestor_vendedor.vendedor_id
          and u.company_id = public.current_company_id()
          and coalesce(u.uso_individual, false) = false
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
      and public.master_can_access_user(auth.uid(), vendedor_id)
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = public.gestor_vendedor.gestor_id
          and upper(coalesce(ut.name, '')) like '%GESTOR%'
      )
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = public.gestor_vendedor.vendedor_id
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

drop policy if exists "gestor_vendedor_delete" on public.gestor_vendedor;
create policy "gestor_vendedor_delete" on public.gestor_vendedor
  for delete using (
    is_admin(auth.uid())
    or gestor_id = auth.uid()
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), gestor_id)
      and public.master_can_access_user(auth.uid(), vendedor_id)
    )
  );
