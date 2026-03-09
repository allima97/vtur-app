-- 2026-02-14: status estruturado para To Do / Agenda

alter table public.agenda_itens
  alter column status set default 'novo';

update public.agenda_itens set status = 'novo' where status is null;

alter table public.agenda_itens
  add constraint agenda_itens_status_chk check (status in ('novo','agendado','em_andamento','concluido'));

create index if not exists idx_agenda_itens_status on public.agenda_itens (status);
