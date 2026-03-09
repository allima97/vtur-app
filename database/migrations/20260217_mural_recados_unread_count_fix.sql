-- 2026-02-17: Corrige contador de não lidos do Mural de Recados
-- Problema: o contador dependia de current_company_id() não nulo, fazendo o badge ficar 0
-- (ex.: Master sem company_id) e/ou não refletir recados privados corretamente.

create or replace function public.mural_recados_unread_count()
returns integer
language plpgsql
security definer
set row_security = off
set search_path = public
as $$
declare
  usr uuid := auth.uid();
  ctx_company uuid := public.current_company_id();
begin
  if usr is null then
    return 0;
  end if;

  return (
    select count(*)
    from public.mural_recados r
    where (
      -- Privado: conta mesmo sem company context
      (r.receiver_id = usr and coalesce(r.receiver_deleted, false) = false)
      -- Empresa: usa company atual (vendedor/gestor) ou portfolio aprovado (master)
      or (
        r.receiver_id is null
        and (
          (ctx_company is not null and r.company_id = ctx_company)
          or (
            is_master(usr)
            and r.company_id in (select company_id from public.master_company_ids(usr))
          )
        )
      )
    )
      -- Não considera como "não lido" mensagens da empresa enviadas pelo próprio usuário
      and not (r.receiver_id is null and r.sender_id = usr)
      and not exists (
        select 1
        from public.mural_recados_leituras l
        where l.recado_id = r.id
          and l.user_id = usr
          and l.read_at >= r.created_at
      )
  );
end;
$$;

grant execute on function public.mural_recados_unread_count() to authenticated, anon, service_role;

