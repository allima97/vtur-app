-- 2026-03-12: privacidade por usuario (agenda + todo)
-- Objetivo: itens de agenda/to-do nao devem ficar visiveis para outros usuarios da mesma empresa.

-- agenda_itens: somente o dono (user_id) acessa
alter table public.agenda_itens enable row level security;

drop policy if exists "agenda_itens_select" on public.agenda_itens;
create policy "agenda_itens_select" on public.agenda_itens
  for select using (
    auth.uid() is not null
    and user_id = auth.uid()
  );

drop policy if exists "agenda_itens_insert" on public.agenda_itens;
create policy "agenda_itens_insert" on public.agenda_itens
  for insert with check (
    auth.uid() is not null
    and (user_id = auth.uid() or user_id is null)
  );

drop policy if exists "agenda_itens_update" on public.agenda_itens;
create policy "agenda_itens_update" on public.agenda_itens
  for update using (
    auth.uid() is not null
    and user_id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

drop policy if exists "agenda_itens_delete" on public.agenda_itens;
create policy "agenda_itens_delete" on public.agenda_itens
  for delete using (
    auth.uid() is not null
    and user_id = auth.uid()
  );

-- todo_categorias: somente o dono (user_id) acessa
alter table public.todo_categorias enable row level security;

drop policy if exists "todo_categorias_select" on public.todo_categorias;
create policy "todo_categorias_select" on public.todo_categorias
  for select using (
    auth.uid() is not null
    and user_id = auth.uid()
  );

drop policy if exists "todo_categorias_insert" on public.todo_categorias;
create policy "todo_categorias_insert" on public.todo_categorias
  for insert with check (
    auth.uid() is not null
    and (user_id = auth.uid() or user_id is null)
  );

drop policy if exists "todo_categorias_update" on public.todo_categorias;
create policy "todo_categorias_update" on public.todo_categorias
  for update using (
    auth.uid() is not null
    and user_id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

drop policy if exists "todo_categorias_delete" on public.todo_categorias;
create policy "todo_categorias_delete" on public.todo_categorias
  for delete using (
    auth.uid() is not null
    and user_id = auth.uid()
  );

