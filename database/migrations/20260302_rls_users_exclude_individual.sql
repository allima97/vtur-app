-- 2026-03-02: bloquear acesso de gestores a usuários com uso individual

alter table public.users enable row level security;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users
  for select using (
    is_admin(auth.uid())
    or id = auth.uid()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and coalesce(uso_individual, false) = false
    )
  );
