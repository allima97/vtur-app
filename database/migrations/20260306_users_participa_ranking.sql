-- 2026-03-06: flag para gestores aparecerem no ranking

alter table public.users
  add column if not exists participa_ranking boolean not null default false;
