-- 2026-03-18: improve admin logs pagination and common filters.

create index if not exists idx_logs_created_at_desc
  on public.logs (created_at desc);

create index if not exists idx_logs_user_id_created_at_desc
  on public.logs (user_id, created_at desc);

create index if not exists idx_logs_modulo_created_at_desc
  on public.logs (modulo, created_at desc);

create index if not exists idx_logs_acao_created_at_desc
  on public.logs (acao, created_at desc);
