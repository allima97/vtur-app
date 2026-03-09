-- 2026-02-27: include Consultoria (online) in default vendor permissions

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
  perform set_config('row_security', 'off', true);
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
    from (values ('Dashboard'), ('Vendas'), ('Clientes'), ('Produtos'), ('Consultoria'), ('Consultoria Online')) as m(modulo)
    where not exists (
      select 1 from public.modulo_acesso ma
      where ma.usuario_id = new.id and lower(ma.modulo) = lower(m.modulo)
    );
  end if;

  return new;
end;
$$;

update public.modulo_acesso ma
set modulo = 'Consultoria Online'
where lower(ma.modulo) = 'consultoria'
  and not exists (
    select 1
    from public.modulo_acesso existing
    where existing.usuario_id = ma.usuario_id
      and lower(existing.modulo) = 'consultoria online'
  );
