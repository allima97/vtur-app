-- 2026-02-05: backfill clientes.created_by usando o último vendedor da venda

with ranked_vendas as (
  select
    v.cliente_id,
    v.vendedor_id,
    row_number() over (
      partition by v.cliente_id
      order by v.data_lancamento desc nulls last, v.created_at desc nulls last
    ) as rn
  from public.vendas v
  where v.cliente_id is not null
    and v.vendedor_id is not null
)
update public.clientes c
set created_by = rv.vendedor_id
from ranked_vendas rv
where c.id = rv.cliente_id
  and rv.rn = 1
  and c.created_by is null;
