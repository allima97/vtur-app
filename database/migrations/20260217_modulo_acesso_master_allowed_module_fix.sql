-- 2026-02-17: corrigir 403/42501 ao salvar permissoes (RLS em modulo_acesso)
-- Causa comum: whitelist desatualizada em public.is_master_allowed_module(modulo),
-- bloqueando insercao/atualizacao de novos modulos (ex.: Operacao/Campanhas/Recados).
-- Solucao: permitir que MASTER gerencie qualquer modulo que nao seja Admin/Master,
-- evitando manutencao manual da whitelist.

create or replace function public.is_master_allowed_module(modulo text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  with m as (
    select lower(btrim(coalesce(modulo, ''))) as v
  )
  select v <> ''
    and v not like 'admin%'
    and v not like 'master%'
  from m;
$$;

grant execute on function public.is_master_allowed_module(text) to anon, authenticated, service_role;
