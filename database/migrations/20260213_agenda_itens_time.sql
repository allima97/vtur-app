-- 2026-02-13: adiciona horários em agenda_itens

alter table public.agenda_itens
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz;

create index if not exists idx_agenda_itens_start_at on public.agenda_itens (start_at);
