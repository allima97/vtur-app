-- 2026-03-11: expiração de convites (1 hora)

alter table public.user_convites
  add column if not exists expires_at timestamptz;

update public.user_convites
   set expires_at = coalesce(expires_at, created_at + interval '1 hour')
 where expires_at is null;

alter table public.user_convites
  alter column expires_at set not null;

alter table public.user_convites
  alter column expires_at set default (now() + interval '1 hour');

create index if not exists user_convites_expires_at_idx
  on public.user_convites(expires_at);

