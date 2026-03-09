-- 2026-03-19: normaliza clientes corporativos e fortalece link por CPF
-- Objetivo:
-- 1) Corrigir legado: clientes vinculados a empresa com created_by de uso_individual.
-- 2) Evitar regressão: ao criar vínculo em clientes_company, neutraliza created_by individual.
-- 3) Tornar clientes_link_by_cpf robusta, priorizando cliente corporativo.

begin;

-- 1) Corrige base legada
update public.clientes c
set created_by = null
where c.created_by is not null
  and exists (
    select 1
    from public.users u
    where u.id = c.created_by
      and coalesce(u.uso_individual, false) = true
  )
  and exists (
    select 1
    from public.clientes_company cc
    where cc.cliente_id = c.id
  );

-- 2) Previne novos casos ao vincular cliente em empresa
create or replace function public.clientes_normalize_created_by_on_company_link()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.clientes c
     set created_by = null
   where c.id = new.cliente_id
     and c.created_by is not null
     and exists (
       select 1
       from public.users u
       where u.id = c.created_by
         and coalesce(u.uso_individual, false) = true
     );
  return new;
end;
$$;

drop trigger if exists trg_clientes_company_normalize_created_by on public.clientes_company;
create trigger trg_clientes_company_normalize_created_by
after insert on public.clientes_company
for each row execute function public.clientes_normalize_created_by_on_company_link();

-- 3) Robustez no vínculo por CPF para fluxo corporativo
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
begin
  cpf_norm := public.normalize_cpf(p_cpf);
  if cpf_norm is null then
    raise exception 'CPF invalido';
  end if;

  -- Prioriza cliente corporativo (created_by nulo ou de usuário corporativo)
  select c.id
    into found_id
  from public.clientes c
  left join public.users u on u.id = c.created_by
  where c.cpf = cpf_norm
    and (c.created_by is null or coalesce(u.uso_individual, false) = false)
  order by c.created_at nulls last
  limit 1;

  if found_id is null then
    return null;
  end if;

  perform public.ensure_cliente_company_link(found_id, null);
  return found_id;
end;
$$;

grant execute on function public.clientes_link_by_cpf(text) to authenticated;

commit;
