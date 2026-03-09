-- 2026-02-05: RLS para uso_individual (vendas/viagens e tabelas relacionadas)

create or replace function public.is_uso_individual(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select u.uso_individual from public.users u where u.id = uid), false);
$$;

-- =========================
-- VENDAS
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
        vendedor_id = auth.uid()
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
        vendedor_id = auth.uid()
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
              v.vendedor_id = auth.uid()
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
              v.vendedor_id = auth.uid()
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
              v.vendedor_id = auth.uid()
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
              v.vendedor_id = auth.uid()
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
      from public.vendas v
      where v.id = vendas_recibos_notas.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.vendedor_id = auth.uid()
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
        )
    )
  );

drop policy if exists "vendas_recibos_notas_write" on public.vendas_recibos_notas;
create policy "vendas_recibos_notas_write" on public.vendas_recibos_notas
  for all using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_recibos_notas.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.vendedor_id = auth.uid()
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
      from public.vendas v
      where v.id = vendas_recibos_complementares.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.vendedor_id = auth.uid()
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
        )
    )
  );

drop policy if exists "vendas_recibos_complementares_write" on public.vendas_recibos_complementares;
create policy "vendas_recibos_complementares_write" on public.vendas_recibos_complementares
  for all using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_recibos_complementares.venda_id
        and (
          is_admin(auth.uid())
          or (
            public.is_uso_individual(auth.uid())
            and v.vendedor_id = auth.uid()
          )
          or (
            not public.is_uso_individual(auth.uid())
            and (
              v.vendedor_id = auth.uid()
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
        )
    )
  );

-- =========================
-- VIAGENS
-- =========================
alter table public.viagens enable row level security;

drop policy if exists "viagens_select" on public.viagens;
create policy "viagens_select" on public.viagens
  for select using (
    is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (
      company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
      and (
        not public.is_uso_individual(auth.uid())
        or responsavel_user_id = auth.uid()
      )
    )
  );

drop policy if exists "viagens_write" on public.viagens;
create policy "viagens_write" on public.viagens
  for all using (
    is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    or (
      company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
      and (
        not public.is_uso_individual(auth.uid())
        or responsavel_user_id = auth.uid()
      )
    )
  );

-- =========================
-- VIAGEM_ACOMPANHANTES
-- =========================
alter table public.viagem_acompanhantes enable row level security;

drop policy if exists "viagem_acompanhantes_select" on public.viagem_acompanhantes;
create policy "viagem_acompanhantes_select" on public.viagem_acompanhantes
  for select using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "viagem_acompanhantes_write" on public.viagem_acompanhantes;
create policy "viagem_acompanhantes_write" on public.viagem_acompanhantes
  for all using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );

-- =========================
-- VIAGEM_PASSAGEIROS
-- =========================
alter table public.viagem_passageiros enable row level security;

drop policy if exists "viagem_passageiros_select" on public.viagem_passageiros;
create policy "viagem_passageiros_select" on public.viagem_passageiros
  for select using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "viagem_passageiros_write" on public.viagem_passageiros;
create policy "viagem_passageiros_write" on public.viagem_passageiros
  for all using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );

-- =========================
-- VIAGEM_SERVICOS
-- =========================
alter table public.viagem_servicos enable row level security;

drop policy if exists "viagem_servicos_select" on public.viagem_servicos;
create policy "viagem_servicos_select" on public.viagem_servicos
  for select using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "viagem_servicos_write" on public.viagem_servicos;
create policy "viagem_servicos_write" on public.viagem_servicos
  for all using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );

-- =========================
-- VIAGEM_DOCUMENTOS
-- =========================
alter table public.viagem_documentos enable row level security;

drop policy if exists "viagem_documentos_select" on public.viagem_documentos;
create policy "viagem_documentos_select" on public.viagem_documentos
  for select using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "viagem_documentos_write" on public.viagem_documentos;
create policy "viagem_documentos_write" on public.viagem_documentos
  for all using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.viagens v
      where v.id = viagem_id
        and (
          (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
          or (
            v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                    (select u.company_id from public.users u where u.id = auth.uid()))
            and (
              not public.is_uso_individual(auth.uid())
              or v.responsavel_user_id = auth.uid()
            )
          )
        )
    )
  );
