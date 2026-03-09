-- 2026-02-16: marca e remove To Do excluído após 2 dias

alter table public.agenda_itens
  add column if not exists deleted_at timestamptz;

-- trigger: ao mover para 'concluido' (Excluído), preenche deleted_at
create or replace function public.agenda_itens_set_deleted_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'concluido' and (old.status is distinct from new.status) then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agenda_itens_deleted_at on public.agenda_itens;
create trigger trg_agenda_itens_deleted_at
before update on public.agenda_itens
for each row execute procedure public.agenda_itens_set_deleted_at();

-- função para limpar itens excluídos com mais de 2 dias
create or replace function public.agenda_itens_purge_excluidos()
returns void
language sql
as $$
  delete from public.agenda_itens
  where status = 'concluido'
    and deleted_at is not null
    and deleted_at < now() - interval '2 days';
$$;

-- agenda diária via pg_cron (se disponível)
create extension if not exists pg_cron;
select cron.schedule('agenda_purge_excluidos', '0 3 * * *', $$select public.agenda_itens_purge_excluidos();$$)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
