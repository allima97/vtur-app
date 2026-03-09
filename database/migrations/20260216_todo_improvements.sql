-- 2026-02-16: Melhorias no sistema de To Do
-- 1. Adicionar cor nas categorias
-- 2. Remover cor dos itens (será herdada da categoria)
-- 3. Adicionar campo arquivo nos itens

-- Adicionar coluna cor nas categorias
alter table public.todo_categorias
  add column if not exists cor text;

-- Adicionar coluna arquivo nos itens
alter table public.agenda_itens
  add column if not exists arquivo text;

-- Remover a coluna cor dos itens (será herdada da categoria)
-- Primeiro, vamos migrar as cores existentes para as categorias
do $$
declare
  r record;
begin
  -- Para cada categoria, pegar a cor mais comum dos seus itens
  for r in (
    select 
      categoria_id,
      mode() within group (order by cor) as cor_comum
    from agenda_itens
    where categoria_id is not null 
      and cor is not null
      and tipo = 'todo'
    group by categoria_id
  )
  loop
    update todo_categorias
    set cor = r.cor_comum
    where id = r.categoria_id and cor is null;
  end loop;
end $$;

-- Definir cor padrão para categorias sem cor
update todo_categorias
set cor = '#9ae6c7'
where cor is null;

-- Agora podemos remover a coluna cor dos itens
alter table public.agenda_itens
  drop column if exists cor;

-- Adicionar índice no campo arquivo
create index if not exists idx_agenda_itens_arquivo on public.agenda_itens (arquivo)
  where arquivo is not null;
