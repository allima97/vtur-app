-- 2026-02-13: RLS - equipe compartilhada entre gestores
-- Substitui filtros diretos em gestor_vendedor por public.gestor_equipe_vendedor_ids(auth.uid()).

-- helper (garante função disponível para policies)
create or replace function public.is_gestor(uid uuid)
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
    ) like '%GESTOR%',
    false
  );
$$;

-- =========================
-- ORCAMENTOS / INTERACOES
-- =========================
DO $$
BEGIN
  IF to_regclass('public.orcamentos') IS NOT NULL THEN
    alter table public.orcamentos enable row level security;

    drop policy if exists "orcamentos_select" on public.orcamentos;
    create policy "orcamentos_select" on public.orcamentos
      for select using (
        is_admin(auth.uid())
        or vendedor_id = auth.uid()
        or vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_user(auth.uid(), vendedor_id))
      );

    drop policy if exists "orcamentos_write" on public.orcamentos;
    create policy "orcamentos_write" on public.orcamentos
      for all using (
        is_admin(auth.uid())
        or vendedor_id = auth.uid()
        or vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_user(auth.uid(), vendedor_id))
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orcamento_interacoes') IS NOT NULL
     AND to_regclass('public.orcamentos') IS NOT NULL THEN
    alter table public.orcamento_interacoes enable row level security;

    drop policy if exists "orcamento_interacoes_select" on public.orcamento_interacoes;
    create policy "orcamento_interacoes_select" on public.orcamento_interacoes
      for select using (
        exists (
          select 1
          from public.orcamentos o
          where o.id = orcamento_id
            and (
              is_admin(auth.uid())
              or o.vendedor_id = auth.uid()
              or o.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_user(auth.uid(), o.vendedor_id))
            )
        )
      );

    drop policy if exists "orcamento_interacoes_write" on public.orcamento_interacoes;
    create policy "orcamento_interacoes_write" on public.orcamento_interacoes
      for all using (
        exists (
          select 1
          from public.orcamentos o
          where o.id = orcamento_id
            and (
              is_admin(auth.uid())
              or o.vendedor_id = auth.uid()
              or o.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_user(auth.uid(), o.vendedor_id))
            )
        )
      );
  END IF;
END $$;

-- =========================
-- VENDAS (company_id scope)
-- =========================
alter table public.vendas enable row level security;

drop policy if exists "vendas_select" on public.vendas;
create policy "vendas_select" on public.vendas
  for select using (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and vendedor_id = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        company_id = coalesce(
          current_setting('request.jwt.claims.company_id', true)::uuid,
          (select u.company_id from public.users u where u.id = auth.uid())
        )
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        vendedor_id = auth.uid()
        or vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and exists (
        select 1
        from public.users u
        where u.id = vendedor_id
          and coalesce(u.uso_individual, false) = false
      )
    )
  );

drop policy if exists "vendas_write" on public.vendas;
create policy "vendas_write" on public.vendas
  for all using (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and vendedor_id = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        company_id = coalesce(
          current_setting('request.jwt.claims.company_id', true)::uuid,
          (select u.company_id from public.users u where u.id = auth.uid())
        )
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        vendedor_id = auth.uid()
        or vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and exists (
        select 1
        from public.users u
        where u.id = vendedor_id
          and coalesce(u.uso_individual, false) = false
      )
    )
  );

-- =========================
-- VENDAS_RECIBOS
-- =========================
alter table public.vendas_recibos enable row level security;

drop policy if exists "vendas_recibos_select" on public.vendas_recibos;
create policy "vendas_recibos_select" on public.vendas_recibos
  for select using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_recibos.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_recibos_write" on public.vendas_recibos;
create policy "vendas_recibos_write" on public.vendas_recibos
  for all using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_recibos.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- =========================
-- VENDAS_PAGAMENTOS
-- =========================
alter table public.vendas_pagamentos enable row level security;

drop policy if exists "vendas_pagamentos_select" on public.vendas_pagamentos;
create policy "vendas_pagamentos_select" on public.vendas_pagamentos
  for select using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_pagamentos.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_pagamentos_write" on public.vendas_pagamentos;
create policy "vendas_pagamentos_write" on public.vendas_pagamentos
  for all using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_pagamentos.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- =========================
-- VENDAS_RECIBOS_NOTAS
-- =========================
alter table public.vendas_recibos_notas enable row level security;

drop policy if exists "vendas_recibos_notas_select" on public.vendas_recibos_notas;
create policy "vendas_recibos_notas_select" on public.vendas_recibos_notas
  for select using (
    exists (
      select 1
      from public.vendas_recibos vr
      join public.vendas v on v.id = vr.venda_id
      where vr.id = vendas_recibos_notas.recibo_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_recibos_notas_write" on public.vendas_recibos_notas;
create policy "vendas_recibos_notas_write" on public.vendas_recibos_notas
  for all using (
    exists (
      select 1
      from public.vendas_recibos vr
      join public.vendas v on v.id = vr.venda_id
      where vr.id = vendas_recibos_notas.recibo_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- =========================
-- VENDAS_RECIBOS_COMPLEMENTARES
-- =========================
alter table public.vendas_recibos_complementares enable row level security;

drop policy if exists "vendas_recibos_complementares_select" on public.vendas_recibos_complementares;
create policy "vendas_recibos_complementares_select" on public.vendas_recibos_complementares
  for select using (
    exists (
      select 1
      from public.vendas_recibos vr
      join public.vendas v on v.id = vr.venda_id
      where vr.id = vendas_recibos_complementares.recibo_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_recibos_complementares_write" on public.vendas_recibos_complementares;
create policy "vendas_recibos_complementares_write" on public.vendas_recibos_complementares
  for all using (
    exists (
      select 1
      from public.vendas_recibos vr
      join public.vendas v on v.id = vr.venda_id
      where vr.id = vendas_recibos_complementares.recibo_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.company_id = coalesce(
                current_setting('request.jwt.claims.company_id', true)::uuid,
                (select u.company_id from public.users u where u.id = auth.uid())
              )
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1
              from public.users u
              where u.id = v.vendedor_id
                and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- =========================
-- METAS_VENDEDOR (write)
-- =========================
alter table public.metas_vendedor enable row level security;

drop policy if exists "metas_vendedor_write" on public.metas_vendedor;
create policy "metas_vendedor_write" on public.metas_vendedor
  for all using (
    is_admin(auth.uid())
    or (is_gestor(auth.uid()) and vendedor_id = auth.uid())
    or vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
  );
