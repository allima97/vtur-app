-- Permite clientes sem telefone (importacao de contratos).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'telefone'
  ) then
    alter table public.clientes alter column telefone drop not null;
  end if;
end $$;
