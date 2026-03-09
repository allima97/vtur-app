-- 2026-03-09: corrige RLS para permitir que MASTER/gestor finalize perfis placeholder
-- Cenário: ao criar usuário corporativo via operador (Master/Gestor), já existe um
-- registro em public.users (company_id/user_type_id nulos, uso_individual=true)
-- gerado pelo trigger de signup. A policy de UPDATE atual bloqueava esse row por
-- exigir company_id não nulo no USING, resultando em
-- "new row violates row-level security policy (USING expression)".

alter table public.users enable row level security;

drop policy if exists "users_update_self_or_admin" on public.users;
create policy "users_update_self_or_admin" on public.users
  for update using (
    -- Admin sempre pode
    is_admin(auth.uid())
    -- Autogerenciamento
    or id = auth.uid()
    -- MASTER pode acessar perfis corporativos do portfólio OU placeholders sem vínculo ainda
    or (
      is_master(auth.uid())
      and not public.is_admin_user_type(users.user_type_id)
      and (
        (
          users.company_id is not null
          and coalesce(users.uso_individual, false) = false
          and public.master_can_access_company(auth.uid(), users.company_id)
        )
        or (
          users.company_id is null
          and users.user_type_id is null
          and coalesce(users.uso_individual, true) = true
        )
      )
    )
    -- Gestor pode alterar vendedores da própria empresa ou placeholders ainda sem vínculo
    or (
      is_gestor(auth.uid())
      and (
        (
          users.company_id = public.current_company_id()
          and coalesce(users.uso_individual, false) = false
          and exists (
            select 1
            from public.user_types ut
            where ut.id = users.user_type_id
              and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
          )
        )
        or (
          users.company_id is null
          and users.user_type_id is null
          and coalesce(users.uso_individual, true) = true
        )
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and coalesce(uso_individual, false) = false
      and public.master_can_access_company(auth.uid(), company_id)
      and not public.is_admin_user_type(user_type_id)
    )
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
      and coalesce(uso_individual, false) = false
      and exists (
        select 1
        from public.user_types ut
        where ut.id = user_type_id
          and upper(coalesce(ut.name, '')) like '%VENDEDOR%'
      )
    )
  );

