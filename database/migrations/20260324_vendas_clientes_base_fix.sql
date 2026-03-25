-- ============================================================
-- Fix: novo cliente não aparece em nova venda
-- ============================================================
-- Dois problemas identificados:
--
-- 1) vendas_clientes_base() exige obrigatoriamente o JOIN em
--    clientes_company, mas a policy RLS "clientes_select" permite
--    que usuários uso_individual vejam seus clientes apenas pelo
--    created_by = auth.uid(), sem precisar do vínculo de empresa.
--    Resultado: cliente criado por uso_individual aparece em
--    carteira (via RLS) mas não em nova venda (via RPC).
--
-- 2) O trigger trg_clientes_link_current_company chama
--    ensure_cliente_company_link(new.id, null), que depende de
--    current_company_id(). Se o JWT não carregou o claim
--    company_id (sessão desatualizada) E users.company_id for
--    null, o current_company_id() devolve null e a função retorna
--    sem criar o vínculo — silenciosamente.
--    Resultado: cliente criado nessa janela de falha não aparece
--    em nova venda mesmo para usuários corporativos.
-- ============================================================

-- ── Fix 1: vendas_clientes_base ──────────────────────────────
-- Espelha a lógica da policy "clientes_select":
--   • uso_individual → mostra clientes onde created_by = auth.uid()
--   • demais          → mantém o JOIN em clientes_company
create or replace function public.vendas_clientes_base()
returns table (id uuid, nome text, cpf text)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  with ctx as (
    select
      auth.uid()                       as uid,
      public.current_company_id()      as company_id,
      public.is_uso_individual(auth.uid()) as uso_individual
  ),
  allowed as (
    select 1
    from public.modulo_acesso ma
    where ma.usuario_id = (select uid from ctx)
      and ma.ativo = true
      and ma.modulo in ('vendas_consulta', 'vendas', 'vendas_cadastro')
      and coalesce(ma.permissao, 'none') <> 'none'
    limit 1
  )
  select c.id, c.nome, c.cpf
  from public.clientes c
  where
    (exists (select 1 from allowed) or is_admin(auth.uid()) or is_master(auth.uid()))
    and (
      -- uso_individual: mostra somente clientes criados pelo próprio usuário
      (
        (select uso_individual from ctx)
        and c.created_by = (select uid from ctx)
      )
      or
      -- usuário corporativo: requer vínculo em clientes_company
      (
        not (select uso_individual from ctx)
        and exists (
          select 1
          from public.clientes_company cc
          where cc.cliente_id = c.id
            and cc.company_id = (select company_id from ctx)
        )
      )
    );
$$;

grant execute on function public.vendas_clientes_base() to authenticated;

-- ── Fix 2: trigger mais robusto ──────────────────────────────
-- Tenta obter company_id em ordem de preferência:
--   1. new.company_id (caso o payload inclua o campo)
--   2. current_company_id() via JWT/users
--   3. users.company_id do criador (new.created_by)
create or replace function public.trg_clientes_link_current_company()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  cid uuid;
begin
  cid := coalesce(
    new.company_id,
    public.current_company_id(),
    (select u.company_id from public.users u where u.id = new.created_by limit 1)
  );
  if cid is not null then
    insert into public.clientes_company (company_id, cliente_id)
    values (cid, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
