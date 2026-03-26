-- 2026-03-25: garante escrita/exclusao de metas por gestor (proprias/equipe)
-- e por master dentro do escopo de empresa atual/portfolio.

alter table public.metas_vendedor enable row level security;

drop policy if exists "metas_vendedor_write" on public.metas_vendedor;
create policy "metas_vendedor_write" on public.metas_vendedor
  for all using (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and vendedor_id = auth.uid()
    )
    or vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
    or (
      is_master(auth.uid())
      and exists (
        select 1
        from public.users u
        where u.id = metas_vendedor.vendedor_id
          and coalesce(u.uso_individual, false) = false
          and (
            u.company_id = coalesce(
              nullif(current_setting('request.jwt.claims.company_id', true), '')::uuid,
              (select us.company_id from public.users us where us.id = auth.uid())
            )
            or public.master_can_access_company(auth.uid(), u.company_id)
          )
      )
    )
  );

alter table public.metas_vendedor_produto enable row level security;

drop policy if exists "metas_vendedor_produto_write" on public.metas_vendedor_produto;
create policy "metas_vendedor_produto_write" on public.metas_vendedor_produto
  for all using (
    exists (
      select 1
      from public.metas_vendedor mv
      join public.users u on u.id = mv.vendedor_id
      where mv.id = metas_vendedor_produto.meta_vendedor_id
        and (
          is_admin(auth.uid())
          or (
            is_gestor(auth.uid())
            and mv.vendedor_id = auth.uid()
          )
          or mv.vendedor_id in (select vendedor_id from public.gestor_equipe_vendedor_ids(auth.uid()))
          or (
            is_master(auth.uid())
            and coalesce(u.uso_individual, false) = false
            and (
              u.company_id = coalesce(
                nullif(current_setting('request.jwt.claims.company_id', true), '')::uuid,
                (select us.company_id from public.users us where us.id = auth.uid())
              )
              or public.master_can_access_company(auth.uid(), u.company_id)
            )
          )
        )
    )
  );
