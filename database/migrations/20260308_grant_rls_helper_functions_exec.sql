-- 2026-03-08: garante EXECUTE nas funcoes helper usadas em policies RLS
-- Cobre todas as assinaturas existentes (inclusive funcoes antigas sem parametro).

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'is_admin',
        'is_master',
        'is_gestor',
        'current_company_id',
        'master_can_access_company',
        'master_company_ids',
        'master_can_access_user',
        'is_admin_user_type',
        'is_master_allowed_module'
      )
  loop
    execute format(
      'grant execute on function %s to anon, authenticated, service_role',
      fn.signature
    );
  end loop;
end $$;
