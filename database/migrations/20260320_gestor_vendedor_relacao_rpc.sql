-- 2026-03-20: RPC para vincular/remover vendedores da equipe de um gestor
-- Evita depender de escrita direta em gestor_vendedor com RLS no client.

create or replace function public.set_gestor_vendedor_relacao(
  p_gestor_id uuid,
  p_vendedor_id uuid,
  p_ativo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid := auth.uid();
  requester_company_id uuid;
  requester_role text := '';
  requester_uso_individual boolean := false;
  requester_is_admin boolean := false;
  requester_is_master boolean := false;
  requester_is_gestor boolean := false;
  requester_has_master_mod boolean := false;
  gestor_company_id uuid;
  gestor_active boolean := false;
  gestor_uso_individual boolean := false;
  gestor_role text := '';
  vendedor_company_id uuid;
  vendedor_active boolean := false;
  vendedor_uso_individual boolean := false;
  vendedor_role text := '';
begin
  if requester_id is null then
    raise exception 'Sessao invalida.';
  end if;

  select
    u.company_id,
    coalesce(u.uso_individual, false),
    upper(coalesce(ut.name, ''))
  into
    requester_company_id,
    requester_uso_individual,
    requester_role
  from public.users u
  left join public.user_types ut on ut.id = u.user_type_id
  where u.id = requester_id;

  if requester_role = '' then
    raise exception 'Usuario solicitante nao encontrado.';
  end if;

  requester_is_admin := requester_role like '%ADMIN%';
  requester_is_master := requester_role like '%MASTER%';

  if not requester_is_master then
    select exists (
      select 1
      from public.master_empresas me
      where me.master_id = requester_id
        and coalesce(me.status, '') <> 'rejected'
    )
    into requester_is_master;
  end if;

  if not requester_is_master then
    select exists (
      select 1
      from public.modulo_acesso ma
      where ma.usuario_id = requester_id
        and coalesce(ma.ativo, true) = true
        and lower(coalesce(ma.modulo, '')) in (
          'masterusuarios',
          'masterpermissoes',
          'masterempresas'
        )
    )
    into requester_has_master_mod;
    requester_is_master := requester_has_master_mod;
  end if;

  requester_is_gestor :=
    not requester_is_admin
    and not requester_is_master
    and not requester_uso_individual
    and requester_role like '%GESTOR%';

  if not requester_is_admin and not requester_is_master and not requester_is_gestor then
    raise exception 'Sem permissao para editar equipes.';
  end if;

  select
    u.company_id,
    coalesce(u.active, false),
    coalesce(u.uso_individual, false),
    upper(coalesce(ut.name, ''))
  into
    gestor_company_id,
    gestor_active,
    gestor_uso_individual,
    gestor_role
  from public.users u
  left join public.user_types ut on ut.id = u.user_type_id
  where u.id = p_gestor_id;

  if gestor_role = '' then
    raise exception 'Gestor nao encontrado.';
  end if;

  select
    u.company_id,
    coalesce(u.active, false),
    coalesce(u.uso_individual, false),
    upper(coalesce(ut.name, ''))
  into
    vendedor_company_id,
    vendedor_active,
    vendedor_uso_individual,
    vendedor_role
  from public.users u
  left join public.user_types ut on ut.id = u.user_type_id
  where u.id = p_vendedor_id;

  if vendedor_role = '' then
    raise exception 'Vendedor nao encontrado.';
  end if;

  if gestor_company_id is null or vendedor_company_id is null or gestor_company_id <> vendedor_company_id then
    raise exception 'Gestor e vendedor precisam pertencer a mesma empresa.';
  end if;

  if not gestor_active then
    raise exception 'O gestor selecionado esta inativo.';
  end if;

  if not vendedor_active then
    raise exception 'O vendedor selecionado esta inativo.';
  end if;

  if gestor_uso_individual or gestor_role not like '%GESTOR%' then
    raise exception 'O usuario selecionado nao e um gestor valido.';
  end if;

  if vendedor_uso_individual or vendedor_role not like '%VENDEDOR%' then
    raise exception 'O usuario selecionado nao e um vendedor valido.';
  end if;

  if requester_is_gestor then
    if requester_id <> p_gestor_id then
      raise exception 'Gestor so pode editar a propria equipe.';
    end if;
    if requester_company_id is null or requester_company_id <> gestor_company_id then
      raise exception 'Seu usuario nao esta vinculado a empresa desta equipe.';
    end if;
  end if;

  if requester_is_master and not requester_is_admin then
    if requester_company_id is distinct from gestor_company_id then
      if not exists (
        select 1
        from public.master_empresas me
        where me.master_id = requester_id
          and me.company_id = gestor_company_id
          and coalesce(me.status, '') <> 'rejected'
      ) then
        raise exception 'Master sem acesso a empresa desta equipe.';
      end if;
    end if;
  end if;

  delete from public.gestor_vendedor
  where gestor_id = p_gestor_id
    and vendedor_id = p_vendedor_id;

  if coalesce(p_ativo, true) then
    insert into public.gestor_vendedor (gestor_id, vendedor_id, ativo)
    values (p_gestor_id, p_vendedor_id, true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'ativo', coalesce(p_ativo, true),
    'gestor_id', p_gestor_id,
    'vendedor_id', p_vendedor_id
  );
end;
$$;

grant execute on function public.set_gestor_vendedor_relacao(uuid, uuid, boolean) to authenticated;
