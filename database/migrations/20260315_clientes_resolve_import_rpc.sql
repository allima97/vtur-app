-- 2026-03-15: RPC para resolver/criar cliente na importacao sem depender de insert direto sob RLS
-- Fluxo:
-- 1) procura cliente pelo CPF priorizando cadastro corporativo;
-- 2) vincula a empresa atual quando permitido;
-- 3) cria o cliente quando ainda nao existir;
-- 4) preenche apenas campos faltantes para nao sobrescrever cadastro existente.

begin;

create or replace function public.clientes_resolve_import(
  p_cpf text,
  p_nome text default null,
  p_nascimento text default null,
  p_endereco text default null,
  p_numero text default null,
  p_cidade text default null,
  p_estado text default null,
  p_cep text default null,
  p_rg text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_nascimento date := case
    when btrim(coalesce(p_nascimento, '')) ~ '^\d{4}-\d{2}-\d{2}$' then btrim(p_nascimento)::date
    else null
  end;
  v_endereco text := nullif(btrim(coalesce(p_endereco, '')), '');
  v_numero text := nullif(btrim(coalesce(p_numero, '')), '');
  v_cidade text := nullif(btrim(coalesce(p_cidade, '')), '');
  v_estado text := nullif(upper(btrim(coalesce(p_estado, ''))), '');
  v_cep text := nullif(btrim(coalesce(p_cep, '')), '');
  v_rg text := nullif(btrim(coalesce(p_rg, '')), '');
  v_cliente_id uuid;
  v_created_by uuid;
  v_created_by_uso_individual boolean;
  v_has_company_id boolean;
  v_has_created_by boolean;
begin
  if v_uid is null then
    raise exception 'Sessao invalida.';
  end if;

  if v_company_id is null then
    raise exception 'Usuario sem company_id.';
  end if;

  if v_cpf is null or length(v_cpf) <> 11 then
    raise exception 'CPF invalido para importar contrato.';
  end if;

  v_has_company_id := exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'company_id'
  );

  v_has_created_by := exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'created_by'
  );

  select
    c.id,
    c.created_by,
    coalesce(u.uso_individual, false)
  into
    v_cliente_id,
    v_created_by,
    v_created_by_uso_individual
  from public.clientes c
  left join public.users u on u.id = c.created_by
  where c.cpf = v_cpf
  order by
    case
      when c.created_by is null or coalesce(u.uso_individual, false) = false then 0
      else 1
    end,
    c.created_at asc nulls last,
    c.id asc
  limit 1;

  if v_cliente_id is not null then
    if v_created_by is not null and v_created_by_uso_individual then
      return null;
    end if;

    perform public.ensure_cliente_company_link(v_cliente_id, v_company_id);

    update public.clientes c
       set nome = coalesce(nullif(btrim(c.nome), ''), v_nome, c.nome),
           nascimento = coalesce(c.nascimento, v_nascimento),
           endereco = coalesce(nullif(btrim(c.endereco), ''), v_endereco, c.endereco),
           numero = coalesce(nullif(btrim(c.numero), ''), v_numero, c.numero),
           cidade = coalesce(nullif(btrim(c.cidade), ''), v_cidade, c.cidade),
           estado = coalesce(nullif(btrim(c.estado), ''), v_estado, c.estado),
           cep = coalesce(nullif(btrim(c.cep), ''), v_cep, c.cep),
           rg = coalesce(nullif(btrim(c.rg), ''), v_rg, c.rg)
     where c.id = v_cliente_id;

    return (
      select jsonb_build_object(
        'id', c.id,
        'cpf', c.cpf,
        'nome', c.nome,
        'nascimento', c.nascimento,
        'endereco', c.endereco,
        'numero', c.numero,
        'cidade', c.cidade,
        'estado', c.estado,
        'cep', c.cep,
        'rg', c.rg
      )
      from public.clientes c
      where c.id = v_cliente_id
    );
  end if;

  begin
    if v_has_company_id and v_has_created_by then
      execute $sql$
        insert into public.clientes (
          nome,
          cpf,
          nascimento,
          endereco,
          numero,
          complemento,
          cidade,
          estado,
          cep,
          rg,
          tipo_cliente,
          ativo,
          active,
          created_by,
          company_id
        )
        values ($1, $2, $3, $4, $5, null, $6, $7, $8, $9, 'passageiro', true, true, $10, $11)
        returning id
      $sql$
      into v_cliente_id
      using coalesce(v_nome, v_cpf), v_cpf, v_nascimento, v_endereco, v_numero, v_cidade, v_estado, v_cep, v_rg, v_uid, v_company_id;
    elsif v_has_created_by then
      execute $sql$
        insert into public.clientes (
          nome,
          cpf,
          nascimento,
          endereco,
          numero,
          complemento,
          cidade,
          estado,
          cep,
          rg,
          tipo_cliente,
          ativo,
          active,
          created_by
        )
        values ($1, $2, $3, $4, $5, null, $6, $7, $8, $9, 'passageiro', true, true, $10)
        returning id
      $sql$
      into v_cliente_id
      using coalesce(v_nome, v_cpf), v_cpf, v_nascimento, v_endereco, v_numero, v_cidade, v_estado, v_cep, v_rg, v_uid;
    elsif v_has_company_id then
      execute $sql$
        insert into public.clientes (
          nome,
          cpf,
          nascimento,
          endereco,
          numero,
          complemento,
          cidade,
          estado,
          cep,
          rg,
          tipo_cliente,
          ativo,
          active,
          company_id
        )
        values ($1, $2, $3, $4, $5, null, $6, $7, $8, $9, 'passageiro', true, true, $10)
        returning id
      $sql$
      into v_cliente_id
      using coalesce(v_nome, v_cpf), v_cpf, v_nascimento, v_endereco, v_numero, v_cidade, v_estado, v_cep, v_rg, v_company_id;
    else
      execute $sql$
        insert into public.clientes (
          nome,
          cpf,
          nascimento,
          endereco,
          numero,
          complemento,
          cidade,
          estado,
          cep,
          rg,
          tipo_cliente,
          ativo,
          active
        )
        values ($1, $2, $3, $4, $5, null, $6, $7, $8, $9, 'passageiro', true, true)
        returning id
      $sql$
      into v_cliente_id
      using coalesce(v_nome, v_cpf), v_cpf, v_nascimento, v_endereco, v_numero, v_cidade, v_estado, v_cep, v_rg;
    end if;
  exception
    when unique_violation then
      select
        c.id,
        c.created_by,
        coalesce(u.uso_individual, false)
      into
        v_cliente_id,
        v_created_by,
        v_created_by_uso_individual
      from public.clientes c
      left join public.users u on u.id = c.created_by
      where c.cpf = v_cpf
      order by
        case
          when c.created_by is null or coalesce(u.uso_individual, false) = false then 0
          else 1
        end,
        c.created_at asc nulls last,
        c.id asc
      limit 1;

      if v_cliente_id is null then
        raise;
      end if;

      if v_created_by is not null and v_created_by_uso_individual then
        return null;
      end if;
  end;

  if v_cliente_id is null then
    return null;
  end if;

  perform public.ensure_cliente_company_link(v_cliente_id, v_company_id);

  update public.clientes c
     set nome = coalesce(nullif(btrim(c.nome), ''), v_nome, c.nome),
         nascimento = coalesce(c.nascimento, v_nascimento),
         endereco = coalesce(nullif(btrim(c.endereco), ''), v_endereco, c.endereco),
         numero = coalesce(nullif(btrim(c.numero), ''), v_numero, c.numero),
         cidade = coalesce(nullif(btrim(c.cidade), ''), v_cidade, c.cidade),
         estado = coalesce(nullif(btrim(c.estado), ''), v_estado, c.estado),
         cep = coalesce(nullif(btrim(c.cep), ''), v_cep, c.cep),
         rg = coalesce(nullif(btrim(c.rg), ''), v_rg, c.rg)
   where c.id = v_cliente_id;

  return (
    select jsonb_build_object(
      'id', c.id,
      'cpf', c.cpf,
      'nome', c.nome,
      'nascimento', c.nascimento,
      'endereco', c.endereco,
      'numero', c.numero,
      'cidade', c.cidade,
      'estado', c.estado,
      'cep', c.cep,
      'rg', c.rg
    )
    from public.clientes c
    where c.id = v_cliente_id
  );
end;
$$;

grant execute on function public.clientes_resolve_import(text, text, text, text, text, text, text, text, text)
to authenticated;

commit;
