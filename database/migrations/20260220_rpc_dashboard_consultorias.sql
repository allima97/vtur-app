-- 2026-02-20: RPC agregada para Consultorias no Dashboard (performance)
-- Objetivo: evitar listas longas de IDs no filtro por company.

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
  select c.id
  from public.clientes c
  where p_company_id is not null
    and c.company_id = p_company_id
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
