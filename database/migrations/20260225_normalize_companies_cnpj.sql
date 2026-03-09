-- 2026-02-25: normalize cnpj storage+trigger to keep only digits

create or replace function public.normalize_cnpj(value text)
returns text
language sql
stable
strict
as $$
  select regexp_replace(coalesce(value, ''), '\D', '', 'g');
$$;

create or replace function public.ensure_companies_cnpj_digits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cnpj is not null then
    new.cnpj := public.normalize_cnpj(new.cnpj);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_companies_normalize_cnpj on public.companies;
create trigger trg_companies_normalize_cnpj
  before insert or update on public.companies
  for each row
  execute function public.ensure_companies_cnpj_digits();

update public.companies
set cnpj = public.normalize_cnpj(cnpj)
where cnpj is not null;
