-- 2026-02-15: normaliza status existentes antes da constraint (v2)

-- remove constraint se existir (nome antigo)
alter table public.agenda_itens drop constraint if exists agenda_itens_status_chk;
alter table public.agenda_itens drop constraint if exists agenda_itens_status_chk_v2;

-- corrige dados legados
update public.agenda_itens
set status = case
  when done is true then 'concluido'
  when status in ('agendado','em_andamento','concluido','novo') then status
  else 'novo'
end
where status is null or status not in ('novo','agendado','em_andamento','concluido');

-- garante default
alter table public.agenda_itens
  alter column status set default 'novo';

-- cria constraint com novo nome para evitar conflito
alter table public.agenda_itens
  add constraint agenda_itens_status_chk_v2 check (status in ('novo','agendado','em_andamento','concluido'));

create index if not exists idx_agenda_itens_status on public.agenda_itens (status);
