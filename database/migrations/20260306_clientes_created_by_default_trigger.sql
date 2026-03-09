-- 2026-03-06: garante clientes.created_by no INSERT (evita 403 RLS quando o front nao envia)

create or replace function public.clientes_set_created_by_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_set_created_by on public.clientes;
create trigger trg_clientes_set_created_by
  before insert on public.clientes
  for each row execute function public.clientes_set_created_by_trigger();

-- Atualiza a policy de INSERT para aceitar created_by nulo (o trigger preenche).
-- Mantem a regra: uso_individual nao pode forjar created_by de outra pessoa.
drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes
  for insert
  with check (
    is_admin(auth.uid())
    or (
      public.is_uso_individual(auth.uid())
      and (created_by is null or created_by = auth.uid())
    )
    or (
      not public.is_uso_individual(auth.uid())
      and (
        created_by is null
        or created_by = auth.uid()
        or public.is_corporate_user(created_by)
      )
    )
  );
