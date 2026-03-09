-- 2026-03-08: exige troca de senha no primeiro acesso para usuarios criados por admin/master/gestor

alter table public.users
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_changed_at timestamptz;

