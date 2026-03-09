-- 2026-03-04: Competência por recibo (vendas mescladas não devem misturar meses)
--
-- Motivação:
-- Quando uma venda é mesclada, os recibos mudam de venda_id.
-- Se a competência for calculada só por vendas.data_venda, recibos de meses diferentes
-- passam a “cair” todos no mês da venda alvo.
--
-- Solução:
-- 1) Persistir a data de competência no próprio recibo (vendas_recibos.data_venda).
-- 2) Garantir que novos recibos preencham data_venda automaticamente (trigger).
-- 3) Ajustar RPCs agregadas (KPIs/Dashboard) para filtrar por recibo.data_venda,
--    mantendo a mesma lógica de proporcionalidade por venda.

alter table public.vendas_recibos
  add column if not exists data_venda date;

create index if not exists idx_vendas_recibos_data_venda
  on public.vendas_recibos (data_venda);

-- Backfill: assume a data_venda atual da venda como competência inicial do recibo.
-- Observação: se já houve mesclas no passado, não há como recuperar o mês original
-- sem um histórico anterior; a partir desta migration, as próximas mesclas preservam.
update public.vendas_recibos r
set data_venda = v.data_venda
from public.vendas v
where v.id = r.venda_id
  and r.data_venda is null;

create or replace function public.vendas_recibos_set_data_venda_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_venda is null then
    select v.data_venda into new.data_venda
    from public.vendas v
    where v.id = new.venda_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendas_recibos_set_data_venda_default on public.vendas_recibos;
create trigger trg_vendas_recibos_set_data_venda_default
before insert on public.vendas_recibos
for each row
execute function public.vendas_recibos_set_data_venda_default();


-- ================================
-- RPC: Vendas KPIs (competência por recibo)
-- ================================
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
with vendas_base as (
  select v.id, v.valor_total, v.valor_taxas, v.data_venda
  from public.vendas v
  where v.cancelada = false
    and (p_company_id is null or v.company_id = p_company_id)
    and (array_length(p_vendedor_ids, 1) is null or v.vendedor_id = any(p_vendedor_ids))
),
recibos_all as (
  select
    r.venda_id,
    sum(coalesce(r.valor_total, 0)) as total_bruto_all,
    sum(coalesce(r.valor_taxas, 0)) as total_taxas_all,
    sum(
      case
        when lower(coalesce(tp.tipo, '')) like '%seguro%'
          or lower(coalesce(tp.nome, '')) like '%seguro%'
        then coalesce(r.valor_total, 0)
        else 0
      end
    ) as total_seguro_bruto_all
  from public.vendas_recibos r
  left join public.tipo_produtos tp on tp.id = r.produto_id
  join vendas_base v on v.id = r.venda_id
  group by r.venda_id
),
recibos_period as (
  select
    r.venda_id,
    sum(coalesce(r.valor_total, 0)) as total_bruto_period,
    sum(coalesce(r.valor_taxas, 0)) as total_taxas_period,
    sum(
      case
        when lower(coalesce(tp.tipo, '')) like '%seguro%'
          or lower(coalesce(tp.nome, '')) like '%seguro%'
        then coalesce(r.valor_total, 0)
        else 0
      end
    ) as total_seguro_bruto_period
  from public.vendas_recibos r
  left join public.tipo_produtos tp on tp.id = r.produto_id
  join vendas_base v on v.id = r.venda_id
  where (p_inicio is null or coalesce(r.data_venda, v.data_venda) >= p_inicio)
    and (p_fim is null or coalesce(r.data_venda, v.data_venda) <= p_fim)
  group by r.venda_id
),
sem_recibos_period as (
  -- Vendas sem recibos: mantém competência pela própria venda.
  select
    v.id as venda_id,
    coalesce(v.valor_total, 0) as vendas_total,
    coalesce(v.valor_taxas, 0) as taxas_total,
    0::numeric as seguro_total
  from vendas_base v
  left join recibos_all ra on ra.venda_id = v.id
  where ra.venda_id is null
    and (p_inicio is null or v.data_venda >= p_inicio)
    and (p_fim is null or v.data_venda <= p_fim)
),
com_recibos_period as (
  -- Vendas com recibos: distribui proporcionalmente usando o total_all,
  -- e aplica apenas o subtotal do período (por recibo.data_venda).
  select
    v.id as venda_id,
    (
      case
        when ra.total_bruto_all > 0 and coalesce(v.valor_total, 0) > 0 then
          least(1, greatest(0, coalesce(v.valor_total, 0) / ra.total_bruto_all))
        else 1::numeric
      end
    ) * coalesce(rp.total_bruto_period, 0) as vendas_total,
    (
      case
        when ra.total_bruto_all > 0 and coalesce(v.valor_total, 0) > 0 then
          least(1, greatest(0, coalesce(v.valor_total, 0) / ra.total_bruto_all))
        else 1::numeric
      end
    ) * coalesce(rp.total_taxas_period, 0) as taxas_total,
    (
      case
        when ra.total_bruto_all > 0 and coalesce(v.valor_total, 0) > 0 then
          least(1, greatest(0, coalesce(v.valor_total, 0) / ra.total_bruto_all))
        else 1::numeric
      end
    ) * coalesce(rp.total_seguro_bruto_period, 0) as seguro_total
  from vendas_base v
  join recibos_all ra on ra.venda_id = v.id
  join recibos_period rp on rp.venda_id = v.id
)
select
  coalesce(sum(vendas_total), 0) as total_vendas,
  coalesce(sum(taxas_total), 0) as total_taxas,
  coalesce(sum(vendas_total), 0) - coalesce(sum(taxas_total), 0) as total_liquido,
  coalesce(sum(seguro_total), 0) as total_seguro
from (
  select * from sem_recibos_period
  union all
  select * from com_recibos_period
) t;
$$;

grant execute on function public.rpc_vendas_kpis(uuid, uuid[], date, date) to authenticated, anon, service_role;


-- ================================
-- RPC: Dashboard Vendas Summary (competência por recibo)
-- ================================
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
with vendas_base as (
  select v.id, v.vendedor_id, v.destino_id, v.data_venda, v.valor_total, v.valor_taxas
  from public.vendas v
  where v.cancelada = false
    and (p_company_id is null or v.company_id = p_company_id)
    and (array_length(p_vendedor_ids, 1) is null or v.vendedor_id = any(p_vendedor_ids))
),
recibos_all as (
  select
    r.venda_id,
    sum(coalesce(r.valor_total, 0)) as total_bruto_all
  from public.vendas_recibos r
  join vendas_base v on v.id = r.venda_id
  group by r.venda_id
),
ratio as (
  select
    v.id as venda_id,
    case
      when ra.total_bruto_all is null then 1::numeric
      when ra.total_bruto_all > 0 and coalesce(v.valor_total, 0) > 0 then
        least(1, greatest(0, coalesce(v.valor_total, 0) / ra.total_bruto_all))
      else 1::numeric
    end as fator
  from vendas_base v
  left join recibos_all ra on ra.venda_id = v.id
),
recibos_period_rows as (
  select
    v.id as venda_id,
    v.vendedor_id,
    v.destino_id,
    coalesce(r.data_venda, v.data_venda)::date as dia,
    r.produto_id,
    coalesce(r.valor_total, 0) as valor_total,
    coalesce(r.valor_taxas, 0) as valor_taxas,
    lower(coalesce(tp.tipo, '')) as tp_tipo,
    lower(coalesce(tp.nome, '')) as tp_nome,
    tp.nome as tp_nome_original,
    tp.exibe_kpi_comissao
  from public.vendas_recibos r
  join vendas_base v on v.id = r.venda_id
  left join public.tipo_produtos tp on tp.id = r.produto_id
  where (p_inicio is null or coalesce(r.data_venda, v.data_venda) >= p_inicio)
    and (p_fim is null or coalesce(r.data_venda, v.data_venda) <= p_fim)
),
recibos_period_calc as (
  select
    r.venda_id,
    r.vendedor_id,
    r.destino_id,
    r.dia,
    r.produto_id,
    (r.valor_total * ratio.fator) as valor_total_adj,
    (r.valor_taxas * ratio.fator) as valor_taxas_adj,
    (case when r.tp_tipo like '%seguro%' or r.tp_nome like '%seguro%' then r.valor_total * ratio.fator else 0 end) as seguro_adj,
    r.tp_nome_original,
    r.exibe_kpi_comissao
  from recibos_period_rows r
  join ratio on ratio.venda_id = r.venda_id
),
vendas_sem_recibos_period as (
  select
    v.id as venda_id,
    v.vendedor_id,
    v.destino_id,
    v.data_venda::date as dia,
    coalesce(v.valor_total, 0) as valor_total_adj,
    coalesce(v.valor_taxas, 0) as valor_taxas_adj,
    0::numeric as seguro_adj
  from vendas_base v
  left join recibos_all ra on ra.venda_id = v.id
  where ra.venda_id is null
    and (p_inicio is null or v.data_venda >= p_inicio)
    and (p_fim is null or v.data_venda <= p_fim)
),
kpis as (
  select
    coalesce(sum(valor_total_adj), 0) as total_vendas,
    coalesce(sum(valor_taxas_adj), 0) as total_taxas,
    coalesce(sum(seguro_adj), 0) as total_seguro,
    count(*)::bigint as qtd_vendas
  from (
    select valor_total_adj, valor_taxas_adj, seguro_adj from recibos_period_calc
    union all
    select valor_total_adj, valor_taxas_adj, seguro_adj from vendas_sem_recibos_period
  ) x
),
timeline_rows as (
  select
    dia as day,
    coalesce(sum(valor_total_adj), 0) as total
  from (
    select dia, valor_total_adj from recibos_period_calc
    union all
    select dia, valor_total_adj from vendas_sem_recibos_period
  ) t
  group by 1
  order by 1
),
destinos_rows as (
  select
    coalesce(p.nome, 'Sem destino') as nome,
    coalesce(sum(total), 0) as total
  from (
    select destino_id, valor_total_adj as total from recibos_period_calc
    union all
    select destino_id, valor_total_adj as total from vendas_sem_recibos_period
  ) t
  left join public.produtos p on p.id = t.destino_id
  group by 1
  order by total desc
  limit 8
),
produtos_rows as (
  select
    produto_id as id,
    coalesce(tp_nome_original, 'Sem produto') as nome,
    coalesce(sum(valor_total_adj), 0) as total
  from recibos_period_calc
  where exibe_kpi_comissao is distinct from false
  group by produto_id, tp_nome_original
  order by total desc
),
vendedor_rows as (
  select
    coalesce(vendedor_id::text, 'unknown') as vendedor_id,
    coalesce(sum(total), 0) as total,
    count(*)::bigint as qtd
  from (
    select vendedor_id, valor_total_adj as total from recibos_period_calc
    union all
    select vendedor_id, valor_total_adj as total from vendas_sem_recibos_period
  ) t
  group by coalesce(vendedor_id::text, 'unknown')
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
