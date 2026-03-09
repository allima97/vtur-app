-- 2026-03-05: Clientes compartilhados por CPF (cadastro unico) + privacidade por empresa
-- Regra: um mesmo passageiro (CPF) pode comprar em varias empresas, mas uma empresa
-- nao pode enxergar viagens/dados de outra empresa. Solucao: clientes unicos por CPF
-- + tabela de vinculo clientes_company para escopo por empresa (RLS).

create extension if not exists pgcrypto;

-- 1) Tabela de vinculo cliente <-> empresa (quem pode ver o cliente)
create table if not exists public.clientes_company (
  company_id uuid not null references public.companies(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_company_pkey primary key (company_id, cliente_id)
);

create index if not exists idx_clientes_company_cliente on public.clientes_company (cliente_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('UTC', now());
  return new;
end;
$$;

drop trigger if exists trg_clientes_company_updated_at on public.clientes_company;
create trigger trg_clientes_company_updated_at
  before update on public.clientes_company
  for each row execute function public.set_updated_at();

-- 2) Normalizacao de CPF (apenas digitos) para permitir unicidade global
create or replace function public.normalize_cpf(raw text)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(regexp_replace(coalesce(raw, ''), '\\D', '', 'g'), '');
$$;

-- normaliza dados existentes
update public.clientes
set cpf = public.normalize_cpf(cpf)
where cpf is not null;

create or replace function public.clientes_normalize_cpf_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    new.cpf := public.normalize_cpf(new.cpf);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_normalize_cpf on public.clientes;
create trigger trg_clientes_normalize_cpf
  before insert or update of cpf on public.clientes
  for each row execute function public.clientes_normalize_cpf_trigger();

-- 3) Mescla duplicados (mesmo CPF) em um unico cliente
--    Atualiza automaticamente todas as FKs que apontam para public.clientes(id).
create temporary table if not exists tmp_cliente_merge (
  dup_id uuid primary key,
  keep_id uuid not null
) on commit drop;

insert into tmp_cliente_merge (dup_id, keep_id)
select id as dup_id, keep_id
from (
  select
    c.id,
    first_value(c.id) over (partition by c.cpf order by c.created_at asc, c.id asc) as keep_id,
    row_number() over (partition by c.cpf order by c.created_at asc, c.id asc) as rn
  from public.clientes c
  where c.cpf is not null
) ranked
where rn > 1;

-- atualiza tabelas que tem FK para clientes.id
do $$
declare
  r record;
begin
  for r in (
    select
      c.conrelid::regclass as tbl,
      a.attname as col
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.clientes'::regclass
  ) loop
    execute format(
      'update %s t set %I = m.keep_id from tmp_cliente_merge m where t.%I = m.dup_id',
      r.tbl,
      r.col,
      r.col
    );
  end loop;
end $$;

-- remove clientes duplicados
delete from public.clientes c
using tmp_cliente_merge m
where c.id = m.dup_id;

-- 4) Unicidade global por CPF (so quando nao-nulo)
--    Reverte o indice composto por empresa.
drop index if exists public.clientes_company_cpf_idx;

-- alguns ambientes antigos podem ainda ter a constraint global
alter table if exists public.clientes drop constraint if exists clientes_cpf_key;

create unique index if not exists clientes_cpf_unique_idx
  on public.clientes (cpf)
  where cpf is not null;

-- 5) Backfill do vinculo cliente<->empresa
insert into public.clientes_company (company_id, cliente_id)
select distinct c.company_id, c.id
from public.clientes c
where c.company_id is not null
on conflict do nothing;

-- vendas (se existir)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendas' and column_name = 'company_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendas' and column_name = 'cliente_id'
  ) then
    execute $sql$
      insert into public.clientes_company (company_id, cliente_id)
      select distinct v.company_id, v.cliente_id
      from public.vendas v
      where v.company_id is not null and v.cliente_id is not null
      on conflict do nothing;
    $sql$;
  end if;
end $$;

-- viagens / passageiros / acompanhantes (se existirem)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viagens' and column_name = 'company_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viagens' and column_name = 'cliente_id'
  ) then
    execute $sql$
      insert into public.clientes_company (company_id, cliente_id)
      select distinct v.company_id, v.cliente_id
      from public.viagens v
      where v.company_id is not null and v.cliente_id is not null
      on conflict do nothing;
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viagem_passageiros' and column_name = 'company_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viagem_passageiros' and column_name = 'cliente_id'
  ) then
    execute $sql$
      insert into public.clientes_company (company_id, cliente_id)
      select distinct vp.company_id, vp.cliente_id
      from public.viagem_passageiros vp
      where vp.company_id is not null and vp.cliente_id is not null
      on conflict do nothing;
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viagem_acompanhantes' and column_name = 'company_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viagem_acompanhantes' and column_name = 'cliente_id'
  ) then
    execute $sql$
      insert into public.clientes_company (company_id, cliente_id)
      select distinct va.company_id, va.cliente_id
      from public.viagem_acompanhantes va
      where va.company_id is not null and va.cliente_id is not null
      on conflict do nothing;
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cliente_acompanhantes' and column_name = 'company_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cliente_acompanhantes' and column_name = 'cliente_id'
  ) then
    execute $sql$
      insert into public.clientes_company (company_id, cliente_id)
      select distinct ca.company_id, ca.cliente_id
      from public.cliente_acompanhantes ca
      where ca.company_id is not null and ca.cliente_id is not null
      on conflict do nothing;
    $sql$;
  end if;
end $$;

-- quote (nao tem company_id: deriva da empresa do criador)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='quote')
     and exists (select 1 from information_schema.tables where table_schema='public' and table_name='users') then
    execute $sql$
      insert into public.clientes_company (company_id, cliente_id)
      select distinct u.company_id, q.client_id
      from public.quote q
      join public.users u on u.id = q.created_by
      where u.company_id is not null and q.client_id is not null
      on conflict do nothing;
    $sql$;
  end if;
end $$;

-- consultorias_online (nao tem company_id: deriva da empresa do criador)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='consultorias_online')
     and exists (select 1 from information_schema.tables where table_schema='public' and table_name='users') then
    execute $sql$
      insert into public.clientes_company (company_id, cliente_id)
      select distinct u.company_id, co.cliente_id
      from public.consultorias_online co
      join public.users u on u.id = co.created_by
      where u.company_id is not null and co.cliente_id is not null
      on conflict do nothing;
    $sql$;
  end if;
end $$;

-- 6) Funcao para garantir vinculo (usada por triggers/RPC)
create or replace function public.ensure_cliente_company_link(
  p_cliente_id uuid,
  p_company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  cid uuid;
begin
  cid := coalesce(p_company_id, public.current_company_id());
  if cid is null or p_cliente_id is null then
    return;
  end if;

  insert into public.clientes_company (company_id, cliente_id)
  values (cid, p_cliente_id)
  on conflict do nothing;
end;
$$;

-- 7) Trigger: ao criar cliente, vincula automaticamente ao company atual
create or replace function public.trg_clientes_link_current_company()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.ensure_cliente_company_link(new.id, null);
  return new;
end;
$$;

drop trigger if exists trg_clientes_link_company on public.clientes;
create trigger trg_clientes_link_company
  after insert on public.clientes
  for each row execute function public.trg_clientes_link_current_company();

-- 8) RPC: vincula (ou cria) cliente por CPF, sem vazar lista cross-company
--    Retorna o id do cliente vinculado.
create or replace function public.clientes_link_by_cpf(p_cpf text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  cpf_norm text;
  found_id uuid;
  created_by_uid uuid;
  created_by_is_corp boolean;
begin
  cpf_norm := public.normalize_cpf(p_cpf);
  if cpf_norm is null then
    raise exception 'CPF invalido';
  end if;

  select c.id, c.created_by
    into found_id, created_by_uid
  from public.clientes c
  where c.cpf = cpf_norm
  limit 1;

  if found_id is null then
    return null;
  end if;

  created_by_is_corp := (created_by_uid is null) or public.is_corporate_user(created_by_uid);
  if not created_by_is_corp then
    -- nao permite "puxar" cliente criado em uso_individual
    return null;
  end if;

  perform public.ensure_cliente_company_link(found_id, null);
  return found_id;
end;
$$;

grant execute on function public.clientes_link_by_cpf(text) to authenticated;

-- 9) RLS: clientes_company
alter table public.clientes_company enable row level security;

drop policy if exists "clientes_company_select" on public.clientes_company;
create policy "clientes_company_select" on public.clientes_company
  for select using (
    is_admin(auth.uid())
    or company_id = public.current_company_id()
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

drop policy if exists "clientes_company_insert" on public.clientes_company;
create policy "clientes_company_insert" on public.clientes_company
  for insert with check (
    is_admin(auth.uid())
    or company_id = public.current_company_id()
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- 10) RLS: clientes (troca escopo company_id -> clientes_company)
--     Mantem privacidade de uso_individual e respeita created_by.
alter table public.clientes enable row level security;

drop policy if exists "clientes_select" on public.clientes;
drop policy if exists "clientes_write" on public.clientes;
drop policy if exists "clientes_insert" on public.clientes;
drop policy if exists "clientes_update" on public.clientes;
drop policy if exists "clientes_delete_admin" on public.clientes;

create policy "clientes_select" on public.clientes
  for select using (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and exists (
        select 1
        from public.clientes_company cc
        where cc.cliente_id = clientes.id
          and (
            cc.company_id = public.current_company_id()
            or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), cc.company_id))
          )
      )
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  );

create policy "clientes_insert" on public.clientes
  for insert
  with check (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  );

create policy "clientes_update" on public.clientes
  for update
  using (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and exists (
        select 1
        from public.clientes_company cc
        where cc.cliente_id = clientes.id
          and (
            cc.company_id = public.current_company_id()
            or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), cc.company_id))
          )
      )
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and created_by = auth.uid()
    )
    or (
      not public.is_uso_individual(auth.uid())
      and exists (
        select 1
        from public.clientes_company cc
        where cc.cliente_id = clientes.id
          and (
            cc.company_id = public.current_company_id()
            or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), cc.company_id))
          )
      )
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  );

create policy "clientes_delete_admin" on public.clientes
  for delete using (is_admin(auth.uid()));

-- 11) Triggers para vincular automaticamente em tabelas que referenciam cliente
-- vendas
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vendas')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendas' AND column_name='cliente_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendas' AND column_name='company_id')
  THEN
    CREATE OR REPLACE FUNCTION public.trg_vendas_link_cliente_company()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    SET row_security = off
    AS $$
    BEGIN
      IF NEW.cliente_id IS NOT NULL AND NEW.company_id IS NOT NULL THEN
        PERFORM public.ensure_cliente_company_link(NEW.cliente_id, NEW.company_id);
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS trg_vendas_link_cliente_company ON public.vendas;
    CREATE TRIGGER trg_vendas_link_cliente_company
      AFTER INSERT OR UPDATE OF cliente_id, company_id ON public.vendas
      FOR EACH ROW EXECUTE FUNCTION public.trg_vendas_link_cliente_company();
  END IF;
END $do$;

-- viagens
create or replace function public.trg_viagens_link_cliente_company()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.cliente_id is not null and new.company_id is not null then
    perform public.ensure_cliente_company_link(new.cliente_id, new.company_id);
  end if;
  return new;
end;
$$;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'viagens'
      AND column_name IN ('company_id','cliente_id')
  ) THEN
    DROP TRIGGER IF EXISTS trg_viagens_link_cliente_company ON public.viagens;
    CREATE TRIGGER trg_viagens_link_cliente_company
      AFTER INSERT OR UPDATE OF cliente_id, company_id ON public.viagens
      FOR EACH ROW EXECUTE FUNCTION public.trg_viagens_link_cliente_company();
  END IF;
END $do$;

-- quote (vincula pela empresa do criador)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='quote')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users')
  THEN
    CREATE OR REPLACE FUNCTION public.trg_quote_link_cliente_company()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    SET row_security = off
    AS $$
    DECLARE
      cid uuid;
    BEGIN
      IF NEW.client_id IS NULL THEN
        RETURN NEW;
      END IF;
      SELECT u.company_id INTO cid FROM public.users u WHERE u.id = NEW.created_by;
      IF cid IS NOT NULL THEN
        PERFORM public.ensure_cliente_company_link(NEW.client_id, cid);
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS trg_quote_link_cliente_company ON public.quote;
    CREATE TRIGGER trg_quote_link_cliente_company
      AFTER INSERT OR UPDATE OF client_id, created_by ON public.quote
      FOR EACH ROW EXECUTE FUNCTION public.trg_quote_link_cliente_company();
  END IF;
END $do$;

-- consultorias_online (vincula pela empresa do criador)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='consultorias_online')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users')
  THEN
    CREATE OR REPLACE FUNCTION public.trg_consultorias_link_cliente_company()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    SET row_security = off
    AS $$
    DECLARE
      cid uuid;
    BEGIN
      IF NEW.cliente_id IS NULL THEN
        RETURN NEW;
      END IF;
      SELECT u.company_id INTO cid FROM public.users u WHERE u.id = NEW.created_by;
      IF cid IS NOT NULL THEN
        PERFORM public.ensure_cliente_company_link(NEW.cliente_id, cid);
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS trg_consultorias_link_cliente_company ON public.consultorias_online;
    CREATE TRIGGER trg_consultorias_link_cliente_company
      AFTER INSERT OR UPDATE OF cliente_id, created_by ON public.consultorias_online
      FOR EACH ROW EXECUTE FUNCTION public.trg_consultorias_link_cliente_company();
  END IF;
END $do$;

-- 12) Atualiza RPCs que listavam clientes por company_id
create or replace function public.vendas_clientes_base()
returns table (id uuid, nome text, cpf text)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  with ctx as (
    select
      auth.uid() as uid,
      public.current_company_id() as company_id
  ),
  allowed as (
    select 1
    from public.modulo_acesso ma
    where ma.usuario_id = auth.uid()
      and ma.ativo = true
      and ma.modulo in ('vendas_consulta', 'vendas', 'vendas_cadastro')
      and coalesce(ma.permissao, 'none') <> 'none'
    limit 1
  )
  select c.id, c.nome, c.cpf
  from public.clientes c
  join public.clientes_company cc
    on cc.cliente_id = c.id
   and cc.company_id = (select company_id from ctx)
  where
    exists (select 1 from allowed)
    or is_admin(auth.uid())
    or is_master(auth.uid());
$$;

grant execute on function public.vendas_clientes_base() to authenticated;

-- Dashboard consultorias (performance): troca company_clientes por clientes_company
create or replace function public.rpc_dashboard_consultorias(
  p_company_id uuid default null,
  p_vendedor_ids uuid[] default null,
  p_inicio timestamp with time zone default null,
  p_fim timestamp with time zone default null
)
returns table (
  id uuid,
  cliente_nome text,
  data_hora timestamp with time zone,
  lembrete text,
  destino text,
  orcamento_id uuid
)
language sql
stable
set search_path = public
as $$
with company_users as (
  select u.id
  from public.users u
  where p_company_id is not null
    and u.company_id = p_company_id
),
company_clientes as (
  select cc.cliente_id as id
  from public.clientes_company cc
  where p_company_id is not null
    and cc.company_id = p_company_id
)
select
  co.id,
  co.cliente_nome,
  co.data_hora,
  co.lembrete,
  co.destino,
  co.orcamento_id
from public.consultorias_online co
where co.fechada = false
  and (p_inicio is null or co.data_hora >= p_inicio)
  and (p_fim is null or co.data_hora <= p_fim)
  and (array_length(p_vendedor_ids, 1) is null or co.created_by = any(p_vendedor_ids))
  and (
    p_company_id is null
    or co.created_by in (select id from company_users)
    or co.cliente_id in (select id from company_clientes)
  )
order by co.data_hora asc
limit 50;
$$;

grant execute on function public.rpc_dashboard_consultorias(uuid, uuid[], timestamp with time zone, timestamp with time zone)
  to authenticated, anon, service_role;
