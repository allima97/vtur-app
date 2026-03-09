-- Migração: corrigir índice único de roteiro_dia para suportar upsert (ON CONFLICT)
-- Motivo: índices únicos parciais não são inferidos por ON CONFLICT sem cláusula WHERE,
-- o que faz o upsert falhar e pode gerar erro de duplicidade em saves concorrentes.
-- Data: 2026-03-03

-- Remove índice parcial (se existir)
drop index if exists public.roteiro_dia_roteiro_ordem_uniq;

-- Remove duplicados existentes (mantém o mais recente) para permitir criar o UNIQUE
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

-- Cria índice único normal. Observação: `roteiro_id` pode ser NULL em dias avulsos;
-- em Postgres, UNIQUE permite múltiplos NULLs, então isso não bloqueia esses registros.
create unique index if not exists roteiro_dia_roteiro_ordem_uniq
  on public.roteiro_dia (roteiro_id, ordem);
