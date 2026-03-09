-- 2026-02-06: garante execucao de public.is_admin

do $$
begin
  execute 'grant execute on function public.is_admin(uuid) to anon, authenticated, service_role';
exception
  when undefined_function then
    null;
end $$;
