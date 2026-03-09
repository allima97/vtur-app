-- 2026-02-03: perfil MASTER com portfolio multi-empresa e RLS dedicado

-- 1) Tipo de usuário MASTER
insert into public.user_types (name)
select 'MASTER'
where not exists (
  select 1 from public.user_types where upper(name) = 'MASTER'
);

-- 2) Tabela de vínculo MASTER <-> EMPRESAS
create table if not exists public.master_empresas (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  unique (master_id, company_id)
);

create index if not exists master_empresas_master_idx on public.master_empresas(master_id);
create index if not exists master_empresas_company_idx on public.master_empresas(company_id);
create index if not exists master_empresas_status_idx on public.master_empresas(status);

-- 3) Helpers
create or replace function public.is_master(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    upper(
      coalesce(
        (
          select ut.name
          from public.user_types ut
          join public.users u on u.id = uid and u.user_type_id = ut.id
        ),
        ''
      )
    ) like '%MASTER%',
    false
  );
$$;

create or replace function public.is_admin_user_type(ut_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    upper(coalesce((select ut.name from public.user_types ut where ut.id = ut_id), '')) like '%ADMIN%',
    false
  );
$$;

create or replace function public.master_company_ids(uid uuid)
returns table (company_id uuid)
language sql stable security definer
set search_path = public
as $$
  select me.company_id
  from public.master_empresas me
  where me.master_id = uid
    and me.status = 'approved';
$$;

create or replace function public.master_can_access_company(uid uuid, company uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.master_empresas me
    where me.master_id = uid
      and me.company_id = company
      and me.status = 'approved'
  );
$$;

create or replace function public.master_can_access_user(master_id uuid, target_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.master_empresas me
      on me.company_id = u.company_id
     and me.master_id = master_id
     and me.status = 'approved'
    where u.id = target_user_id
      and coalesce(u.uso_individual, false) = false
      and not public.is_admin_user_type(u.user_type_id)
  );
$$;

create or replace function public.is_master_allowed_module(modulo text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(coalesce(modulo, '')) in (
    'dashboard',
    'vendas_consulta',
    'orcamentos',
    'clientes',
    'consultoria_online',
    'cadastros',
    'cadastros_paises',
    'cadastros_estados',
    'cadastros_cidades',
    'cadastros_destinos',
    'cadastros_produtos',
    'circuitos',
    'cadastros_lote',
    'cadastros_fornecedores',
    'relatorios',
    'relatorios_vendas',
    'relatorios_destinos',
    'relatorios_produtos',
    'relatorios_clientes',
    'parametros',
    'parametros_tipo_produtos',
    'parametros_metas',
    'parametros_regras_comissao',
    'operacao',
    'operacao_viagens',
    'comissionamento'
  );
$$;

-- 4) RLS: MASTER_EMPRESAS
alter table public.master_empresas enable row level security;

drop policy if exists "master_empresas_select" on public.master_empresas;
create policy "master_empresas_select" on public.master_empresas
  for select using (
    is_admin(auth.uid())
    or master_id = auth.uid()
  );

drop policy if exists "master_empresas_insert_admin" on public.master_empresas;
create policy "master_empresas_insert_admin" on public.master_empresas
  for insert with check (is_admin(auth.uid()));

drop policy if exists "master_empresas_insert_master" on public.master_empresas;
create policy "master_empresas_insert_master" on public.master_empresas
  for insert with check (
    is_master(auth.uid())
    and master_id = auth.uid()
    and status = 'pending'
    and approved_by is null
  );

drop policy if exists "master_empresas_update_admin" on public.master_empresas;
create policy "master_empresas_update_admin" on public.master_empresas
  for update using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists "master_empresas_update_master" on public.master_empresas;
create policy "master_empresas_update_master" on public.master_empresas
  for update using (
    is_master(auth.uid())
    and master_id = auth.uid()
    and status = 'pending'
  )
  with check (
    is_master(auth.uid())
    and master_id = auth.uid()
    and status = 'pending'
  );

drop policy if exists "master_empresas_delete_admin" on public.master_empresas;
create policy "master_empresas_delete_admin" on public.master_empresas
  for delete using (is_admin(auth.uid()));

drop policy if exists "master_empresas_delete_master" on public.master_empresas;
create policy "master_empresas_delete_master" on public.master_empresas
  for delete using (
    is_master(auth.uid())
    and master_id = auth.uid()
    and status = 'pending'
  );

-- 5) RLS: COMPANIES (admin full, master portfolio, same company)
drop policy if exists "companies_select_admin" on public.companies;
create policy "companies_select_admin" on public.companies
  for select using (
    is_admin(auth.uid())
    or id = public.current_company_id()
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.master_empresas me
        where me.master_id = auth.uid()
          and me.company_id = companies.id
      )
    )
  );

drop policy if exists "companies_write_admin" on public.companies;
create policy "companies_write_admin" on public.companies
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists "companies_insert_master" on public.companies;
create policy "companies_insert_master" on public.companies
  for insert with check (is_master(auth.uid()));

drop policy if exists "companies_update_master" on public.companies;
create policy "companies_update_master" on public.companies
  for update using (
    is_master(auth.uid())
    and exists (
      select 1
      from public.master_empresas me
      where me.master_id = auth.uid()
        and me.company_id = companies.id
        and me.status = 'pending'
    )
  )
  with check (
    is_master(auth.uid())
    and exists (
      select 1
      from public.master_empresas me
      where me.master_id = auth.uid()
        and me.company_id = companies.id
        and me.status = 'pending'
    )
  );

-- 6) RLS: USERS (admin full, self, master portfolio/corporativo)
drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users
  for select using (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and coalesce(uso_individual, false) = false
    )
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.master_empresas me
        where me.master_id = auth.uid()
          and me.company_id = users.company_id
          and me.status = 'approved'
      )
      and coalesce(uso_individual, false) = false
    )
  );

drop policy if exists "users_insert_self_or_admin" on public.users;
create policy "users_insert_self_or_admin" on public.users
  for insert with check (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and public.master_can_access_company(auth.uid(), company_id)
      and coalesce(uso_individual, false) = false
      and not public.is_admin_user_type(user_type_id)
    )
  );

drop policy if exists "users_update_self_or_admin" on public.users;
create policy "users_update_self_or_admin" on public.users
  for update using (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and public.master_can_access_company(auth.uid(), company_id)
      and coalesce(uso_individual, false) = false
      and not public.is_admin_user_type(user_type_id)
    )
  )
  with check (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      is_master(auth.uid())
      and company_id is not null
      and public.master_can_access_company(auth.uid(), company_id)
      and coalesce(uso_individual, false) = false
      and not public.is_admin_user_type(user_type_id)
    )
  );

-- 7) RLS: MODULO_ACESSO (admin full, master limitado)
drop policy if exists "modulo_acesso_select" on public.modulo_acesso;
create policy "modulo_acesso_select" on public.modulo_acesso
  for select using (
    is_admin(auth.uid())
    or usuario_id = auth.uid()
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
    )
  );

drop policy if exists "modulo_acesso_insert_admin" on public.modulo_acesso;
create policy "modulo_acesso_insert_admin" on public.modulo_acesso
  for insert with check (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
      and lower(coalesce(permissao, '')) in ('none', 'view', 'create', 'edit', 'delete')
    )
  );

drop policy if exists "modulo_acesso_update_admin" on public.modulo_acesso;
create policy "modulo_acesso_update_admin" on public.modulo_acesso
  for update using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
      and lower(coalesce(permissao, '')) in ('none', 'view', 'create', 'edit', 'delete')
    )
  );

drop policy if exists "modulo_acesso_delete_admin" on public.modulo_acesso;
create policy "modulo_acesso_delete_admin" on public.modulo_acesso
  for delete using (
    is_admin(auth.uid())
    or (
      is_master(auth.uid())
      and public.master_can_access_user(auth.uid(), usuario_id)
      and public.is_master_allowed_module(modulo)
    )
  );

-- 8) RLS: GESTOR_VENDEDOR (admin, gestor e master portfolio)
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
        where u.id = gestor_vendedor.vendedor_id
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
        where u.id = gestor_vendedor.gestor_id
          and upper(coalesce(ut.name, '')) like '%GESTOR%'
      )
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = gestor_vendedor.vendedor_id
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
        where u.id = gestor_vendedor.vendedor_id
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
        where u.id = gestor_vendedor.gestor_id
          and upper(coalesce(ut.name, '')) like '%GESTOR%'
      )
      and exists (
        select 1
        from public.users u
        join public.user_types ut on ut.id = u.user_type_id
        where u.id = gestor_vendedor.vendedor_id
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

-- 9) RLS: ORCAMENTOS/VENDAS/METAS (master via portfolio + corporativo)
DO $$
BEGIN
  IF to_regclass('public.orcamentos') IS NOT NULL THEN
    drop policy if exists "orcamentos_select" on public.orcamentos;
    create policy "orcamentos_select" on public.orcamentos
      for select using (
        is_admin(auth.uid())
        or vendedor_id = auth.uid()
        or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
        or (
          is_master(auth.uid())
          and exists (
            select 1
            from public.users u
            join public.master_empresas me
              on me.company_id = u.company_id
             and me.master_id = auth.uid()
             and me.status = 'approved'
            where u.id = orcamentos.vendedor_id
              and coalesce(u.uso_individual, false) = false
          )
        )
      );

    drop policy if exists "orcamentos_write" on public.orcamentos;
    create policy "orcamentos_write" on public.orcamentos
      for all using (
        is_admin(auth.uid())
        or vendedor_id = auth.uid()
        or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
        or (
          is_master(auth.uid())
          and exists (
            select 1
            from public.users u
            join public.master_empresas me
              on me.company_id = u.company_id
             and me.master_id = auth.uid()
             and me.status = 'approved'
            where u.id = orcamentos.vendedor_id
              and coalesce(u.uso_individual, false) = false
          )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orcamento_interacoes') IS NOT NULL
     AND to_regclass('public.orcamentos') IS NOT NULL THEN
    drop policy if exists "orcamento_interacoes_select" on public.orcamento_interacoes;
    create policy "orcamento_interacoes_select" on public.orcamento_interacoes
      for select using (
        exists (
          select 1 from public.orcamentos o
          where o.id = orcamento_id
            and (
              is_admin(auth.uid())
              or o.vendedor_id = auth.uid()
              or o.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (
                is_master(auth.uid())
                and exists (
                  select 1
                  from public.users u
                  join public.master_empresas me
                    on me.company_id = u.company_id
                   and me.master_id = auth.uid()
                   and me.status = 'approved'
                  where u.id = o.vendedor_id
                    and coalesce(u.uso_individual, false) = false
                )
              )
            )
        )
      );

    drop policy if exists "orcamento_interacoes_write" on public.orcamento_interacoes;
    create policy "orcamento_interacoes_write" on public.orcamento_interacoes
      for all using (
        exists (
          select 1 from public.orcamentos o
          where o.id = orcamento_id
            and (
              is_admin(auth.uid())
              or o.vendedor_id = auth.uid()
              or o.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (
                is_master(auth.uid())
                and exists (
                  select 1
                  from public.users u
                  join public.master_empresas me
                    on me.company_id = u.company_id
                   and me.master_id = auth.uid()
                   and me.status = 'approved'
                  where u.id = o.vendedor_id
                    and coalesce(u.uso_individual, false) = false
                )
              )
            )
        )
      );
  END IF;
END $$;

-- VENDAS
drop policy if exists "vendas_select" on public.vendas;
create policy "vendas_select" on public.vendas
  for select using (
    is_admin(auth.uid())
    or vendedor_id = auth.uid()
    or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.users u
        join public.master_empresas me
          on me.company_id = u.company_id
         and me.master_id = auth.uid()
         and me.status = 'approved'
        where u.id = vendas.vendedor_id
          and coalesce(u.uso_individual, false) = false
      )
    )
  );

-- VENDAS WRITE

drop policy if exists "vendas_write" on public.vendas;
create policy "vendas_write" on public.vendas
  for all using (
    is_admin(auth.uid())
    or vendedor_id = auth.uid()
    or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.users u
        join public.master_empresas me
          on me.company_id = u.company_id
         and me.master_id = auth.uid()
         and me.status = 'approved'
        where u.id = vendas.vendedor_id
          and coalesce(u.uso_individual, false) = false
      )
    )
  );

-- VENDAS_RECIBOS
drop policy if exists "vendas_recibos_select" on public.vendas_recibos;
create policy "vendas_recibos_select" on public.vendas_recibos
  for select using (
    exists (
      select 1 from public.vendas v
      where v.id = vendas_recibos.venda_id
        and (
          is_admin(auth.uid())
          or v.vendedor_id = auth.uid()
          or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
          or (
            is_master(auth.uid())
            and exists (
              select 1
              from public.users u
              join public.master_empresas me
                on me.company_id = u.company_id
               and me.master_id = auth.uid()
               and me.status = 'approved'
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- VENDAS_RECIBOS WRITE

drop policy if exists "vendas_recibos_write" on public.vendas_recibos;
create policy "vendas_recibos_write" on public.vendas_recibos
  for all using (
    exists (
      select 1 from public.vendas v
      where v.id = vendas_recibos.venda_id
        and (
          is_admin(auth.uid())
          or v.vendedor_id = auth.uid()
          or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
          or (
            is_master(auth.uid())
            and exists (
              select 1
              from public.users u
              join public.master_empresas me
                on me.company_id = u.company_id
               and me.master_id = auth.uid()
               and me.status = 'approved'
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- METAS VENDEDOR
drop policy if exists "metas_vendedor_select" on public.metas_vendedor;
create policy "metas_vendedor_select" on public.metas_vendedor
  for select using (
    is_admin(auth.uid())
    or vendedor_id = auth.uid()
    or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.users u
        join public.master_empresas me
          on me.company_id = u.company_id
         and me.master_id = auth.uid()
         and me.status = 'approved'
        where u.id = metas_vendedor.vendedor_id
          and coalesce(u.uso_individual, false) = false
      )
    )
  );

drop policy if exists "metas_vendedor_write" on public.metas_vendedor;
create policy "metas_vendedor_write" on public.metas_vendedor
  for all using (
    is_admin(auth.uid())
    or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.users u
        join public.master_empresas me
          on me.company_id = u.company_id
         and me.master_id = auth.uid()
         and me.status = 'approved'
        where u.id = metas_vendedor.vendedor_id
          and coalesce(u.uso_individual, false) = false
      )
    )
  );

-- METAS VENDEDOR PRODUTO

drop policy if exists "metas_vendedor_produto_select" on public.metas_vendedor_produto;
create policy "metas_vendedor_produto_select" on public.metas_vendedor_produto
  for select using (
    exists (
      select 1 from public.metas_vendedor mv
      where mv.id = metas_vendedor_produto.meta_vendedor_id
        and (
          is_admin(auth.uid())
          or mv.vendedor_id = auth.uid()
          or mv.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
          or (
            is_master(auth.uid())
            and exists (
              select 1
              from public.users u
              join public.master_empresas me
                on me.company_id = u.company_id
               and me.master_id = auth.uid()
               and me.status = 'approved'
              where u.id = mv.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- 10) RLS: CONSULTORIAS ONLINE (master via portfolio)
drop policy if exists "consultorias_online_admin" on public.consultorias_online;
create policy "consultorias_online_admin" on public.consultorias_online
  for all using (
    is_admin(auth.uid())
    or created_by = auth.uid()
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.users u
        join public.master_empresas me
          on me.company_id = u.company_id
         and me.master_id = auth.uid()
         and me.status = 'approved'
        where u.id = consultorias_online.created_by
          and coalesce(u.uso_individual, false) = false
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or created_by = auth.uid()
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.users u
        join public.master_empresas me
          on me.company_id = u.company_id
         and me.master_id = auth.uid()
         and me.status = 'approved'
        where u.id = consultorias_online.created_by
          and coalesce(u.uso_individual, false) = false
      )
    )
  );

-- 11) RLS: tabelas com company_id (permitir master portfolio)
-- VIAGENS
DROP POLICY IF EXISTS "viagens_select" ON public.viagens;
CREATE POLICY "viagens_select" ON public.viagens
  FOR SELECT USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
DROP POLICY IF EXISTS "viagens_write" ON public.viagens;
CREATE POLICY "viagens_write" ON public.viagens
  FOR ALL USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- FORNECEDORES
DROP POLICY IF EXISTS "fornecedores_select" ON public.fornecedores;
CREATE POLICY "fornecedores_select" ON public.fornecedores
  FOR SELECT USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
DROP POLICY IF EXISTS "fornecedores_write" ON public.fornecedores;
CREATE POLICY "fornecedores_write" ON public.fornecedores
  FOR ALL USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- CLIENTE_ACOMPANHANTES
DROP POLICY IF EXISTS "cliente_acompanhantes_select" ON public.cliente_acompanhantes;
CREATE POLICY "cliente_acompanhantes_select" ON public.cliente_acompanhantes
  FOR SELECT USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
DROP POLICY IF EXISTS "cliente_acompanhantes_write" ON public.cliente_acompanhantes;
CREATE POLICY "cliente_acompanhantes_write" ON public.cliente_acompanhantes
  FOR ALL USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- VIAGEM_ACOMPANHANTES
DROP POLICY IF EXISTS "viagem_acompanhantes_select" ON public.viagem_acompanhantes;
CREATE POLICY "viagem_acompanhantes_select" ON public.viagem_acompanhantes
  FOR SELECT USING (
    is_admin(auth.uid())
    or exists (
      select 1 from public.viagens v
      where v.id = viagem_id
        and (
          v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                  (select u.company_id from public.users u where u.id = auth.uid()))
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
        )
    )
  );
DROP POLICY IF EXISTS "viagem_acompanhantes_write" ON public.viagem_acompanhantes;
CREATE POLICY "viagem_acompanhantes_write" ON public.viagem_acompanhantes
  FOR ALL USING (
    is_admin(auth.uid())
    or exists (
      select 1 from public.viagens v
      where v.id = viagem_id
        and (
          v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                  (select u.company_id from public.users u where u.id = auth.uid()))
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
        )
    )
  );

-- VIAGEM_PASSAGEIROS
DROP POLICY IF EXISTS "viagem_passageiros_select" ON public.viagem_passageiros;
CREATE POLICY "viagem_passageiros_select" ON public.viagem_passageiros
  FOR SELECT USING (
    is_admin(auth.uid())
    or exists (
      select 1 from public.viagens v
      where v.id = viagem_id
        and (
          v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                  (select u.company_id from public.users u where u.id = auth.uid()))
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
        )
    )
  );
DROP POLICY IF EXISTS "viagem_passageiros_write" ON public.viagem_passageiros;
CREATE POLICY "viagem_passageiros_write" ON public.viagem_passageiros
  FOR ALL USING (
    is_admin(auth.uid())
    or exists (
      select 1 from public.viagens v
      where v.id = viagem_id
        and (
          v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                  (select u.company_id from public.users u where u.id = auth.uid()))
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
        )
    )
  );

-- VIAGEM_SERVICOS
DROP POLICY IF EXISTS "viagem_servicos_select" ON public.viagem_servicos;
CREATE POLICY "viagem_servicos_select" ON public.viagem_servicos
  FOR SELECT USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
DROP POLICY IF EXISTS "viagem_servicos_write" ON public.viagem_servicos;
CREATE POLICY "viagem_servicos_write" ON public.viagem_servicos
  FOR ALL USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- VIAGEM_DOCUMENTOS
DROP POLICY IF EXISTS "viagem_documentos_select" ON public.viagem_documentos;
CREATE POLICY "viagem_documentos_select" ON public.viagem_documentos
  FOR SELECT USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
DROP POLICY IF EXISTS "viagem_documentos_write" ON public.viagem_documentos;
CREATE POLICY "viagem_documentos_write" ON public.viagem_documentos
  FOR ALL USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- PARAMETROS_CAMBIOS
DROP POLICY IF EXISTS "parametros_cambios_select" ON public.parametros_cambios;
CREATE POLICY "parametros_cambios_select" ON public.parametros_cambios
  FOR SELECT USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
DROP POLICY IF EXISTS "parametros_cambios_write" ON public.parametros_cambios;
CREATE POLICY "parametros_cambios_write" ON public.parametros_cambios
  FOR ALL USING (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );
