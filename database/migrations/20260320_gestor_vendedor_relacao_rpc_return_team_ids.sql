-- 2026-03-20: faz a RPC de equipe devolver a lista final de vendedores da equipe

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
  requester_can_manage_team boolean := false;
  requester_can_edit_target_team boolean := false;
  gestor_company_id uuid;
  gestor_active boolean := false;
  gestor_uso_individual boolean := false;
  gestor_role text := '';
  gestor_can_manage_team boolean := false;
  vendedor_company_id uuid;
  vendedor_active boolean := false;
  vendedor_uso_individual boolean := false;
  vendedor_role text := '';
  equipe_vendedor_ids jsonb := '[]'::jsonb;
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

  select exists (
    select 1
    from public.modulo_acesso ma
    where ma.usuario_id = requester_id
      and coalesce(ma.ativo, true) = true
      and lower(coalesce(ma.modulo, '')) in ('equipe', 'parametros')
      and lower(coalesce(ma.permissao, '')) in ('edit', 'delete', 'admin', 'create')
  )
  into requester_can_manage_team;

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
    into requester_is_master;
  end if;

  requester_is_gestor :=
    not requester_is_admin
    and not requester_is_master
    and not requester_uso_individual
    and (
      requester_role like '%GESTOR%'
      or requester_can_manage_team
    );

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

  select exists (
    select 1
    from public.modulo_acesso ma
    where ma.usuario_id = p_gestor_id
      and coalesce(ma.ativo, true) = true
      and lower(coalesce(ma.modulo, '')) in ('equipe', 'parametros')
      and lower(coalesce(ma.permissao, '')) in ('edit', 'delete', 'admin', 'create')
  )
  into gestor_can_manage_team;

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

  if gestor_uso_individual then
    raise exception 'O usuario selecionado nao e um gestor valido.';
  end if;

  if not (
    gestor_role like '%GESTOR%'
    or gestor_role like '%MASTER%'
    or gestor_role like '%ADMIN%'
    or gestor_can_manage_team
  ) then
    raise exception 'O usuario selecionado nao e um gestor valido.';
  end if;

  if vendedor_uso_individual or vendedor_role not like '%VENDEDOR%' then
    raise exception 'O usuario selecionado nao e um vendedor valido.';
  end if;

  requester_can_edit_target_team :=
    requester_id = p_gestor_id
    or exists (
      with recursive team_links as (
        select gec.gestor_id, gec.gestor_base_id, array[gec.gestor_id] as path
        from public.gestor_equipe_compartilhada gec
        where gec.gestor_id = requester_id
        union all
        select gec2.gestor_id, gec2.gestor_base_id, tl.path || gec2.gestor_id
        from public.gestor_equipe_compartilhada gec2
        join team_links tl on gec2.gestor_id = tl.gestor_base_id
        where not (gec2.gestor_id = any(tl.path))
          and array_length(tl.path, 1) < 10
      )
      select 1
      from team_links
      where gestor_base_id = p_gestor_id
      limit 1
    );

  if requester_is_gestor and not requester_can_edit_target_team then
    raise exception 'Gestor so pode editar sua propria equipe.';
  end if;

  if requester_is_gestor and (requester_company_id is null or requester_company_id <> gestor_company_id) then
    raise exception 'Seu usuario nao esta vinculado a empresa desta equipe.';
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

  select coalesce(
    jsonb_agg(gv.vendedor_id order by gv.vendedor_id),
    '[]'::jsonb
  )
  into equipe_vendedor_ids
  from public.gestor_vendedor gv
  where gv.gestor_id = p_gestor_id
    and coalesce(gv.ativo, true) = true;

  return jsonb_build_object(
    'ok', true,
    'ativo', coalesce(p_ativo, true),
    'gestor_id', p_gestor_id,
    'vendedor_id', p_vendedor_id,
    'equipe_vendedor_ids', equipe_vendedor_ids
  );
end;
$$;

grant execute on function public.set_gestor_vendedor_relacao(uuid, uuid, boolean) to authenticated;
