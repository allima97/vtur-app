-- 2026-02-06: adiciona company_id em vendas + backfill + RLS ajustado

create extension if not exists "pgcrypto";

-- coluna e index
alter table public.vendas
  add column if not exists company_id uuid references public.companies(id);

create index if not exists idx_vendas_company on public.vendas (company_id);

-- backfill via vendedor
update public.vendas v
set company_id = u.company_id
from public.users u
where v.vendedor_id = u.id
  and v.company_id is null;

-- helper (garante função disponível)
create or replace function public.is_uso_individual(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select u.uso_individual from public.users u where u.id = uid), false);
$$;

-- =========================
-- RLS: VENDAS
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
        company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                              (select u.company_id from public.users u where u.id = auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        vendedor_id = auth.uid()
        or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and exists (
        select 1 from public.users u
        where u.id = vendedor_id and coalesce(u.uso_individual, false) = false
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
        company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                              (select u.company_id from public.users u where u.id = auth.uid()))
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        vendedor_id = auth.uid()
        or vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and exists (
        select 1 from public.users u
        where u.id = vendedor_id and coalesce(u.uso_individual, false) = false
      )
    )
  );

-- =========================
-- RLS: VENDAS_RECIBOS
-- =========================
alter table public.vendas_recibos enable row level security;

drop policy if exists "vendas_recibos_select" on public.vendas_recibos;
create policy "vendas_recibos_select" on public.vendas_recibos
  for select using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_recibos_write" on public.vendas_recibos;
create policy "vendas_recibos_write" on public.vendas_recibos
  for all using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- =========================
-- RLS: VENDAS_PAGAMENTOS
-- =========================
alter table public.vendas_pagamentos enable row level security;

drop policy if exists "vendas_pagamentos_select" on public.vendas_pagamentos;
create policy "vendas_pagamentos_select" on public.vendas_pagamentos
  for select using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_pagamentos_write" on public.vendas_pagamentos;
create policy "vendas_pagamentos_write" on public.vendas_pagamentos
  for all using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- =========================
-- RLS: VENDAS_RECIBOS_NOTAS
-- =========================
alter table public.vendas_recibos_notas enable row level security;

drop policy if exists "vendas_recibos_notas_select" on public.vendas_recibos_notas;
create policy "vendas_recibos_notas_select" on public.vendas_recibos_notas
  for select using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_recibos_notas_write" on public.vendas_recibos_notas;
create policy "vendas_recibos_notas_write" on public.vendas_recibos_notas
  for all using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

-- =========================
-- RLS: VENDAS_RECIBOS_COMPLEMENTARES
-- =========================
alter table public.vendas_recibos_complementares enable row level security;

drop policy if exists "vendas_recibos_complementares_select" on public.vendas_recibos_complementares;
create policy "vendas_recibos_complementares_select" on public.vendas_recibos_complementares
  for select using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );

drop policy if exists "vendas_recibos_complementares_write" on public.vendas_recibos_complementares;
create policy "vendas_recibos_complementares_write" on public.vendas_recibos_complementares
  for all using (
    exists (
      select 1 from public.vendas v
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
              v.company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                                      (select u.company_id from public.users u where u.id = auth.uid()))
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and (
              v.vendedor_id = auth.uid()
              or v.vendedor_id in (select gv.vendedor_id from public.gestor_vendedor gv where gv.gestor_id = auth.uid())
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), v.company_id))
            )
            and exists (
              select 1 from public.users u
              where u.id = v.vendedor_id and coalesce(u.uso_individual, false) = false
            )
          )
        )
    )
  );
