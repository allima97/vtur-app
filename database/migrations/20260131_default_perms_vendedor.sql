-- 2026-01-31: default access for vendors (Dashboard, Vendas, Clientes, Produtos)

create or replace function public.ensure_default_perms_vendedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tipo_nome text;
  is_vendedor boolean := false;
begin
  if new.user_type_id is not null then
    select upper(coalesce(t.name, '')) into tipo_nome
    from public.user_types t
    where t.id = new.user_type_id;

    if tipo_nome like '%VENDEDOR%' then
      is_vendedor := true;
    end if;
  else
    if coalesce(new.created_by_gestor, false) = false then
      is_vendedor := true;
    end if;
  end if;

  if is_vendedor then
    insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
    select new.id, m.modulo, 'delete', true
    from (values ('Dashboard'), ('Vendas'), ('Clientes'), ('Produtos')) as m(modulo)
    where not exists (
      select 1 from public.modulo_acesso ma
      where ma.usuario_id = new.id and lower(ma.modulo) = lower(m.modulo)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_default_perms_vendedor on public.users;
create trigger trg_default_perms_vendedor
after insert or update of user_type_id, created_by_gestor on public.users
for each row execute function public.ensure_default_perms_vendedor();

-- Backfill existing vendors / self-signups without user_type
insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
    select u.id, m.modulo, 'delete', true
from public.users u
left join public.user_types t on t.id = u.user_type_id
cross join (values ('Dashboard'), ('Vendas'), ('Clientes'), ('Produtos')) as m(modulo)
where
  (
    upper(coalesce(t.name, '')) like '%VENDEDOR%'
    or (u.user_type_id is null and coalesce(u.created_by_gestor, false) = false)
  )
  and not exists (
    select 1 from public.modulo_acesso ma
    where ma.usuario_id = u.id and lower(ma.modulo) = lower(m.modulo)
  );
