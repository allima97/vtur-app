-- 2026-02-16: remove cor de categorias; cor fica só no To Do

alter table public.todo_categorias drop column if exists cor;

-- mantém colunas em agenda_itens para cor atribuída no To Do

