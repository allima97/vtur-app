-- 2026-02-12: ajusta defaults do agenda_itens (sem subquery em DEFAULT) e preenche via trigger

create or replace function public.agenda_itens_fill_defaults()
returns trigger
language plpgsql
as $$
declare
  v_company uuid;
begin
  -- resolve company_id: jwt claim ou company do usuario
  select coalesce(
    nullif(current_setting('request.jwt.claims.company_id', true), '')::uuid,
    (select u.company_id from public.users u where u.id = auth.uid())
  ) into v_company;

  if new.company_id is null then
    new.company_id := v_company;
  end if;

  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  new.updated_at := now();
  if new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end;
$$;

-- remove default com subquery e deixa trigger cuidar
alter table public.agenda_itens alter column company_id drop default;
alter table public.agenda_itens alter column user_id drop default;

drop trigger if exists trg_agenda_itens_fill_defaults on public.agenda_itens;
create trigger trg_agenda_itens_fill_defaults
before insert on public.agenda_itens
for each row execute procedure public.agenda_itens_fill_defaults();
