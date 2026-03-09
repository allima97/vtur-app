-- 2026-02-18: RPC agregada para Dashboard (vendas) - performance
-- Objetivo: evitar payload grande (vendas + recibos) e cálculos pesados no front.
-- Retorna KPIs + séries/agrupamentos já prontos para render.

create or replace function public.rpc_dashboard_vendas_summary(
  p_company_id uuid default null,
  p_vendedor_ids uuid[] default null,
  p_inicio date default null,
  p_fim date default null
)
returns table (
  total_vendas numeric,
  total_taxas numeric,
  total_liquido numeric,
  total_seguro numeric,
  qtd_vendas bigint,
  ticket_medio numeric,
  timeline jsonb,
  top_destinos jsonb,
  por_produto jsonb,
  por_vendedor jsonb
)
language sql
stable
set search_path = public
as $$
with vendas_filtradas as (
  select v.id, v.vendedor_id, v.destino_id, v.data_venda, v.valor_total, v.valor_taxas
  from public.vendas v
  where v.cancelada = false
    and (p_company_id is null or v.company_id = p_company_id)
    and (p_inicio is null or v.data_venda >= p_inicio)
    and (p_fim is null or v.data_venda <= p_fim)
    and (array_length(p_vendedor_ids, 1) is null or v.vendedor_id = any(p_vendedor_ids))
),
recibos_base as (
  select
    r.venda_id,
    r.produto_id,
    coalesce(r.valor_total, 0) as valor_total,
    coalesce(r.valor_taxas, 0) as valor_taxas,
    lower(coalesce(tp.tipo, '')) as tp_tipo,
    lower(coalesce(tp.nome, '')) as tp_nome,
    tp.nome as tp_nome_original,
    tp.exibe_kpi_comissao
  from public.vendas_recibos r
  left join public.tipo_produtos tp on tp.id = r.produto_id
  join vendas_filtradas v on v.id = r.venda_id
),
recibos_sum as (
  select
    venda_id,
    sum(valor_total) as total_bruto,
    sum(valor_taxas) as total_taxas,
    sum(case when tp_tipo like '%seguro%' or tp_nome like '%seguro%' then valor_total else 0 end) as total_seguro_bruto
  from recibos_base
  group by venda_id
),
ratio as (
  select
    v.id as venda_id,
    case
      when rs.total_bruto is null then 1::numeric
      when rs.total_bruto > 0 and coalesce(v.valor_total, 0) > 0 then
        least(1, greatest(0, coalesce(v.valor_total, 0) / rs.total_bruto))
      else 1::numeric
    end as fator
  from vendas_filtradas v
  left join recibos_sum rs on rs.venda_id = v.id
),
calc_venda as (
  select
    v.id,
    v.vendedor_id,
    v.destino_id,
    v.data_venda,
    case
      when rs.total_bruto is null then coalesce(v.valor_total, 0)
      else ratio.fator * rs.total_bruto
    end as vendas_total,
    case
      when rs.total_bruto is null then coalesce(v.valor_taxas, 0)
      else coalesce(rs.total_taxas, 0)
    end as taxas_total,
    case
      when rs.total_bruto is null then 0
      else ratio.fator * coalesce(rs.total_seguro_bruto, 0)
    end as seguro_total
  from vendas_filtradas v
  left join recibos_sum rs on rs.venda_id = v.id
  left join ratio on ratio.venda_id = v.id
),
kpis as (
  select
    coalesce(sum(vendas_total), 0) as total_vendas,
    coalesce(sum(taxas_total), 0) as total_taxas,
    coalesce(sum(seguro_total), 0) as total_seguro,
    count(*) as qtd_vendas
  from calc_venda
),
timeline_rows as (
  select
    data_venda::date as day,
    coalesce(sum(vendas_total), 0) as total
  from calc_venda
  group by 1
  order by 1
),
destinos_rows as (
  select
    coalesce(p.nome, 'Sem destino') as nome,
    coalesce(sum(c.vendas_total), 0) as total
  from calc_venda c
  left join public.produtos p on p.id = c.destino_id
  group by 1
  order by total desc
  limit 8
),
produtos_rows as (
  select
    rb.produto_id as id,
    coalesce(rb.tp_nome_original, 'Sem produto') as nome,
    coalesce(sum(rb.valor_total * ratio.fator), 0) as total
  from recibos_base rb
  join ratio on ratio.venda_id = rb.venda_id
  where rb.exibe_kpi_comissao is distinct from false
  group by rb.produto_id, rb.tp_nome_original
  order by total desc
),
vendedor_rows as (
  select
    coalesce(c.vendedor_id::text, 'unknown') as vendedor_id,
    coalesce(sum(c.vendas_total), 0) as total,
    count(*) as qtd
  from calc_venda c
  group by coalesce(c.vendedor_id::text, 'unknown')
  order by total desc
)
select
  k.total_vendas,
  k.total_taxas,
  k.total_vendas - k.total_taxas as total_liquido,
  k.total_seguro as total_seguro,
  k.qtd_vendas,
  case when k.qtd_vendas > 0 then k.total_vendas / k.qtd_vendas else 0 end as ticket_medio,
  coalesce(
    (select jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'value', total)) from timeline_rows),
    '[]'::jsonb
  ) as timeline,
  coalesce(
    (select jsonb_agg(jsonb_build_object('name', nome, 'value', total)) from destinos_rows),
    '[]'::jsonb
  ) as top_destinos,
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', id, 'name', nome, 'value', total)) from produtos_rows),
    '[]'::jsonb
  ) as por_produto,
  coalesce(
    (select jsonb_agg(jsonb_build_object('vendedor_id', vendedor_id, 'total', total, 'qtd', qtd)) from vendedor_rows),
    '[]'::jsonb
  ) as por_vendedor
from kpis k;
$$;

grant execute on function public.rpc_dashboard_vendas_summary(uuid, uuid[], date, date) to authenticated, anon, service_role;

