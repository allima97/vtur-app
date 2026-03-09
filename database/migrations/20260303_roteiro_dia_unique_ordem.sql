-- Migração: impedir duplicação de dias no roteiro (concorrência de save)
-- Garante 1 linha por (roteiro_id, ordem) quando roteiro_id não é nulo.
-- Data: 2026-03-03

-- 1) Remover duplicados existentes (mantém o mais recente)
with ranked as (
  select
    id,
    row_number() over (
      partition by roteiro_id, ordem
      order by created_at desc nulls last, id desc
    ) as rn
  from public.roteiro_dia
  where roteiro_id is not null
)
delete from public.roteiro_dia d
using ranked r
where d.id = r.id
  and r.rn > 1;

-- 2) Impedir novos duplicados (parcial para não afetar dias avulsos do banco)
create unique index if not exists roteiro_dia_roteiro_ordem_uniq
  on public.roteiro_dia (roteiro_id, ordem)
  where roteiro_id is not null;
