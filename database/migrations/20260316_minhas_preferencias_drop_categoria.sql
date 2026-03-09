-- 2026-03-16: remove coluna categoria (Categoria é implícita pelo Tipo)

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'minhas_preferencias'
      and column_name = 'categoria'
  ) then
    alter table public.minhas_preferencias
      drop constraint if exists minhas_preferencias_categoria_check;

    alter table public.minhas_preferencias
      drop column if exists categoria;
  end if;
end $$;
