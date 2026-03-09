-- 2026-02-19: permite listar clientes da empresa no cadastro de vendas
create or replace function public.vendas_clientes_base()
returns table (id uuid, nome text, cpf text)
language sql stable security definer
set search_path = public
as $$
  with ctx as (
    select
      auth.uid() as uid,
      coalesce(
        current_setting('request.jwt.claims.company_id', true)::uuid,
        (select u.company_id from public.users u where u.id = auth.uid())
      ) as company_id
  ),
  allowed as (
    select 1
    from public.modulo_acesso ma
    where ma.usuario_id = auth.uid()
      and ma.ativo = true
      and ma.modulo in ('vendas_consulta', 'vendas', 'vendas_cadastro')
      and coalesce(ma.permissao, 'none') <> 'none'
    limit 1
  )
  select c.id, c.nome, c.cpf
  from public.clientes c
  join ctx on ctx.company_id is not null and c.company_id = ctx.company_id
  where
    exists (select 1 from allowed)
    or is_admin(auth.uid())
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), c.company_id));
$$;

grant execute on function public.vendas_clientes_base() to authenticated;
