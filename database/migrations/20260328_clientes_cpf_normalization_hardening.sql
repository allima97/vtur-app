-- 2026-03-28: Hardening de documento (CPF/CNPJ) em clientes
-- Objetivo:
-- 1) Normalizar documentos (somente digitos) no banco.
-- 2) Mesclar clientes duplicados por documento normalizado.
-- 3) Blindar reincidencia com trigger + indice unico.

begin;

create or replace function public.normalize_cpf(raw text)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.clientes_normalize_cpf_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.cpf := public.normalize_cpf(new.cpf);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_normalize_cpf on public.clientes;

-- Remove restricoes antigas para permitir saneamento sem conflito.
drop index if exists public.clientes_cpf_unique_idx;
drop index if exists public.clientes_company_cpf_idx;
alter table if exists public.clientes drop constraint if exists clientes_cpf_key;

-- Forca tipo texto + normalizacao no USING para remover mascara, espacos e
-- qualquer legado que possa violar o check posterior.
alter table if exists public.clientes
  alter column cpf type text
  using public.normalize_cpf(cpf::text);

-- Normaliza base legada (381.018.088-25 -> 38101808825, 12.345.678/0001-90 -> 12345678000190).
update public.clientes
set cpf = public.normalize_cpf(cpf::text)
where cpf is distinct from public.normalize_cpf(cpf::text);

-- Limpa documentos com tamanho invalido para evitar violacao de regra
-- (somente CPF 11 digitos ou CNPJ 14 digitos).
update public.clientes
set cpf = null
where cpf is not null
  and length(cpf) not in (11, 14);

-- Saneamento final defensivo antes de validar constraint:
-- remove qualquer caractere fora de 0-9 (inclui digitos unicode/ocultos).
update public.clientes
set cpf = nullif(regexp_replace(coalesce(cpf::text, ''), '[^0-9]', '', 'g'), '')
where cpf is not null;

update public.clientes
set cpf = null
where cpf is not null
  and cpf !~ '^[0-9]{11}$|^[0-9]{14}$';

-- Mapa de merge: para cada documento, mantem o registro mais recente.
create temporary table if not exists tmp_cliente_doc_merge (
  dup_id uuid primary key,
  keep_id uuid not null
) on commit drop;

truncate table tmp_cliente_doc_merge;

insert into tmp_cliente_doc_merge (dup_id, keep_id)
select ranked.id as dup_id, ranked.keep_id
from (
  select
    c.id,
    first_value(c.id) over (
      partition by c.cpf
      order by c.created_at desc nulls last, c.id asc
    ) as keep_id,
    row_number() over (
      partition by c.cpf
      order by c.created_at desc nulls last, c.id asc
    ) as rn
  from public.clientes c
  where c.cpf is not null
) ranked
where ranked.rn > 1;

-- Tratamento explicito para evitar conflito de PK em clientes_company.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'clientes_company'
  ) then
    delete from public.clientes_company cc
    using tmp_cliente_doc_merge m
    where cc.cliente_id = m.dup_id
      and exists (
        select 1
        from public.clientes_company keep
        where keep.company_id = cc.company_id
          and keep.cliente_id = m.keep_id
      );

    update public.clientes_company cc
    set cliente_id = m.keep_id
    from tmp_cliente_doc_merge m
    where cc.cliente_id = m.dup_id;
  end if;
end $$;

-- Tratamento explicito para evitar conflito em indice (viagem_id, cliente_id).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'viagem_passageiros'
      and column_name = 'viagem_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'viagem_passageiros'
      and column_name = 'cliente_id'
  ) then
    delete from public.viagem_passageiros vp
    using tmp_cliente_doc_merge m
    where vp.cliente_id = m.dup_id
      and exists (
        select 1
        from public.viagem_passageiros keep
        where keep.viagem_id = vp.viagem_id
          and keep.cliente_id = m.keep_id
      );

    update public.viagem_passageiros vp
    set cliente_id = m.keep_id
    from tmp_cliente_doc_merge m
    where vp.cliente_id = m.dup_id;
  end if;
end $$;

-- Tratamento explicito para evitar conflito em indice (cliente_id, cpf) de acompanhantes.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cliente_acompanhantes'
      and column_name = 'cliente_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cliente_acompanhantes'
      and column_name = 'cpf'
  ) then
    delete from public.cliente_acompanhantes ca
    using tmp_cliente_doc_merge m
    where ca.cliente_id = m.dup_id
      and ca.cpf is not null
      and exists (
        select 1
        from public.cliente_acompanhantes keep
        where keep.cliente_id = m.keep_id
          and keep.cpf is not null
          and public.normalize_cpf(keep.cpf) = public.normalize_cpf(ca.cpf)
      );

    update public.cliente_acompanhantes ca
    set cliente_id = m.keep_id
    from tmp_cliente_doc_merge m
    where ca.cliente_id = m.dup_id;
  end if;
end $$;

-- Atualiza referencias nas demais FKs que apontam para public.clientes(id).
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
     and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.clientes'::regclass
      and array_length(c.conkey, 1) = 1
  ) loop
    if r.tbl::text in ('public.clientes_company', 'public.viagem_passageiros', 'public.cliente_acompanhantes') then
      continue;
    end if;

    execute format(
      'update %s t set %I = m.keep_id from tmp_cliente_doc_merge m where t.%I = m.dup_id',
      r.tbl,
      r.col,
      r.col
    );
  end loop;
end $$;

-- Exclui registros duplicados ja remapeados.
delete from public.clientes c
using tmp_cliente_doc_merge m
where c.id = m.dup_id;

-- Blindagem final: documento apenas numerico e com tamanho valido (CPF/CNPJ).
alter table if exists public.clientes
  drop constraint if exists clientes_cpf_digits_only_chk;
alter table if exists public.clientes
  add constraint clientes_cpf_digits_only_chk
  check (cpf is null or (cpf ~ '^[0-9]+$' and length(cpf) in (11, 14)))
  not valid;

alter table if exists public.clientes
  validate constraint clientes_cpf_digits_only_chk;

create unique index if not exists clientes_cpf_unique_idx
  on public.clientes (cpf)
  where cpf is not null;

create trigger trg_clientes_normalize_cpf
  before insert or update of cpf on public.clientes
  for each row execute function public.clientes_normalize_cpf_trigger();

commit;
