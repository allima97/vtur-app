-- 2026-03-03: restringe criacao/atualizacao de empresas ao admin

drop policy if exists "companies_insert_master" on public.companies;
drop policy if exists "companies_update_master" on public.companies;

drop policy if exists "master_empresas_insert_master" on public.master_empresas;
drop policy if exists "master_empresas_update_master" on public.master_empresas;
drop policy if exists "master_empresas_delete_master" on public.master_empresas;
