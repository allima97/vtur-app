-- 2026-02-20: permitir MASTER gerenciar modulos master (bloquear apenas admin)
-- Regras: ADMIN controla tudo; MASTER pode alterar modulos que possui acesso,
-- desde que nao seja modulo admin.

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
  from m;
$$;

grant execute on function public.is_master_allowed_module(text) to anon, authenticated, service_role;
