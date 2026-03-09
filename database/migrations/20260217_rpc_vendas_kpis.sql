-- 2026-02-17: RPC agregada para KPIs de vendas (performance)
-- Objetivo: evitar payload grande (vendas + recibos) só para somatórios.
-- Observação: mantém a mesma lógica do endpoint antigo:
-- - Se a venda não tem recibos: usa vendas.valor_total e vendas.valor_taxas
-- - Se tem recibos: distribui o valor_total proporcionalmente (clamp 0..1) e soma taxas dos recibos
-- - Seguro: soma recibos cujo tipo/nome contém "seguro"

create or replace function public.rpc_vendas_kpis(
  p_company_id uuid default null,
  p_vendedor_ids uuid[] default null,
  p_inicio date default null,
  p_fim date default null
)
returns table (
  total_vendas numeric,
  total_taxas numeric,
  total_liquido numeric,
  total_seguro numeric
)
language sql
stable
set search_path = public
as $$
with vendas_filtradas as (
  select v.id, v.valor_total, v.valor_taxas
  from public.vendas v
  where (p_company_id is null or v.company_id = p_company_id)
    and (p_inicio is null or v.data_venda >= p_inicio)
    and (p_fim is null or v.data_venda <= p_fim)
    and (array_length(p_vendedor_ids, 1) is null or v.vendedor_id = any(p_vendedor_ids))
),
recibos as (
  select
    r.venda_id,
    sum(coalesce(r.valor_total, 0)) as total_bruto,
    sum(coalesce(r.valor_taxas, 0)) as total_taxas,
    sum(
      case
        when lower(coalesce(tp.tipo, '')) like '%seguro%'
          or lower(coalesce(tp.nome, '')) like '%seguro%'
        then coalesce(r.valor_total, 0)
        else 0
      end
    ) as total_seguro_bruto
  from public.vendas_recibos r
  left join public.tipo_produtos tp on tp.id = r.produto_id
  join vendas_filtradas v on v.id = r.venda_id
  group by r.venda_id
),
calc as (
  select
    v.id,
    case
      when r.total_bruto is null then coalesce(v.valor_total, 0)
      else
        (case
          when r.total_bruto > 0 and coalesce(v.valor_total, 0) > 0 then
            least(1, greatest(0, coalesce(v.valor_total, 0) / r.total_bruto))
          else 1
        end) * r.total_bruto
    end as vendas_total,
    case
      when r.total_bruto is null then coalesce(v.valor_taxas, 0)
      else coalesce(r.total_taxas, 0)
    end as taxas_total,
    case
      when r.total_bruto is null then 0
      else
        (case
          when r.total_bruto > 0 and coalesce(v.valor_total, 0) > 0 then
            least(1, greatest(0, coalesce(v.valor_total, 0) / r.total_bruto))
          else 1
        end) * coalesce(r.total_seguro_bruto, 0)
    end as seguro_total
  from vendas_filtradas v
  left join recibos r on r.venda_id = v.id
)
select
  coalesce(sum(vendas_total), 0) as total_vendas,
  coalesce(sum(taxas_total), 0) as total_taxas,
  coalesce(sum(vendas_total), 0) - coalesce(sum(taxas_total), 0) as total_liquido,
  coalesce(sum(seguro_total), 0) as total_seguro
from calc;
$$;

grant execute on function public.rpc_vendas_kpis(uuid, uuid[], date, date) to authenticated, anon, service_role;

